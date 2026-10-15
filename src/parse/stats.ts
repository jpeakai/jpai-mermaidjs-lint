// The parse engine: reads a diagram's structure with mermaid's own parsers.
// The Langium grammars in @mermaid-js/parser cover the newer diagram types, and
// the JISON parsers in mermaid core, reached through a happy-dom shim, cover
// the rest. Every adapter reads the parser's result, never the text, so a
// diagram is measured the way mermaid itself reads it.

import { parse as langiumParse } from "@mermaid-js/parser";
import { Window } from "happy-dom";

// mermaid core registers DOMPurify hooks while its grammars run, and DOMPurify
// needs a DOM. This runs before the first mermaid import, so mermaid is
// imported dynamically: a static import is hoisted above this call.
const installDomShim = (): void => {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const win = new Window();
  g.window = win;
  g.document = win.document;
  g.Element = win.Element;
  g.HTMLElement = win.HTMLElement;
  g.Node = win.Node;
  g.DocumentFragment = win.DocumentFragment;
  g.NodeFilter = win.NodeFilter;
  g.getComputedStyle = win.getComputedStyle.bind(win);
};

let mermaidCore: typeof import("mermaid").default | null = null;
const getMermaid = async (): Promise<typeof import("mermaid").default> => {
  if (mermaidCore) return mermaidCore;
  installDomShim();
  mermaidCore = (await import("mermaid")).default;
  return mermaidCore;
};

// The slice of mermaid core the contrast scorer reads: the config a diagram
// declares, its parsed DB, and the theme engine. Typed here without mermaid's
// own types, so the published declarations never need them.
export interface MermaidCore {
  parse: (text: string) => Promise<{ config: Record<string, unknown> }>;
  initialize: (config: Record<string, unknown>) => void;
  mermaidAPI: {
    getSiteConfig: () => Record<string, unknown>;
    getDiagramFromText: (text: string) => Promise<{ db: unknown }>;
  };
}

export const getMermaidCore = async (): Promise<MermaidCore> => (await getMermaid()) as unknown as MermaidCore;

export interface DiagramStats {
  nodes: number;
  edges: number;
  subgraphs: number;
  // How deep real containers nest: flowchart subgraphs, composite states,
  // architecture groups and the like.
  max_subgraph_depth: number;
  // How far a tree-shaped diagram (mindmap, treemap, treeView, ishikawa)
  // reaches below its root. Those types draw no subgraphs, so their depth is
  // kept apart from max_subgraph_depth and the nesting rule never reads it.
  // It is 0 for every other type.
  max_tree_depth: number;
  node_ids: string[];
  subgraph_names: string[];
  // The parser that read the diagram, or, on a failure, the one whose reason
  // `error` carries: langium for the types its grammars own, else mermaid-core.
  parser_used: "langium" | "mermaid-core";
  diagram_type: string;
  // The parser's reason, on one line, when no parser produced structure. Line
  // numbers in it count from the diagram's own first line.
  error: string | null;
}

type MermaidStats = DiagramStats;

const LANGIUM_TYPES: Record<
  string,
  "architecture" | "info" | "pie" | "gitGraph" | "packet" | "radar" | "treemap" | "treeView" | "wardley"
> = {
  "architecture-beta": "architecture",
  architecture: "architecture",
  info: "info",
  pie: "pie",
  gitGraph: "gitGraph",
  "packet-beta": "packet",
  packet: "packet",
  "radar-beta": "radar",
  radar: "radar",
  "treemap-beta": "treemap",
  treemap: "treemap",
  "treeView-beta": "treeView",
  treeView: "treeView",
  "wardley-beta": "wardley",
  wardley: "wardley",
};

export function detectKeyword(content: string): string | null {
  // A leading "---" opens a YAML frontmatter block that runs to the next "---".
  // Everything between is config, not diagram source: returning its first key
  // (typically "config:") would miss the Langium dispatch table and mis-report a
  // valid frontmatter-prefixed diagram (e.g. architecture-beta) as unparseable
  // (parseFailed in metrics.ts, reported as parse-diagram-unparseable).
  let seenContent = false;
  let inFrontmatter = false;

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("%%")) continue;

    if (line === "---") {
      if (inFrontmatter) {
        inFrontmatter = false; // closing delimiter — diagram source follows
      } else if (!seenContent) {
        inFrontmatter = true; // opening delimiter — only valid before any source
      }
      seenContent = true;
      continue;
    }

    seenContent = true;
    if (inFrontmatter) continue;

    const first = line.split(/\s+/)[0];
    return first ?? null;
  }
  return null;
}

export async function extractStats(content: string): Promise<MermaidStats> {
  const keyword = detectKeyword(content) ?? "unknown";

  // 1. Langium grammar (@mermaid-js/parser) — typed AST, no DOM needed.
  // Its error is kept, because for these types it is the parser that owns the
  // grammar, and mermaid core's attempt below is only a second chance.
  const langium = keyword in LANGIUM_TYPES;
  let langiumError: string | null = null;
  if (langium) {
    try {
      return await extractLangiumStats(content, keyword);
    } catch (err) {
      langiumError = parserReason(err);
    }
  }

  // 2. Mermaid-core JISON parser via happy-dom. The shim satisfies
  // DOMPurify; the parsers populate each type's DB (vertices, edges,
  // blocks, sections, etc.). A per-type adapter in extractCoreStats reads
  // the canonical DB shape.
  let coreError: string;
  try {
    return await extractCoreStats(content, keyword);
  } catch (err) {
    coreError = parserReason(err);
  }

  // 3. Neither canonical parser produced stats. Return a tagged failure so
  // parseFailed (metrics.ts) flags it, reported as parse-diagram-unparseable.
  return {
    nodes: 0,
    edges: 0,
    subgraphs: 0,
    max_subgraph_depth: 0,
    max_tree_depth: 0,
    node_ids: [],
    subgraph_names: [],
    parser_used: langium ? "langium" : "mermaid-core",
    diagram_type: keyword,
    error: langiumError ?? coreError,
  };
}

// A pointer line under an echoed source line, as the JISON parsers print it.
const POINTER = /^-*\^$/;

// A parser's whole reason on one line, so a finding stays one line. The JISON
// parsers echo the source line and point at the column; both are dropped, and
// the line number and what the parser expected are kept. "No diagram type
// detected" echoes the whole diagram after its first line, so only that line
// is kept.
export const parserReason = (err: unknown): string => {
  const message = err instanceof Error ? err.message : String(err);
  const lines = message.split("\n");
  if (message.startsWith("No diagram type detected")) return (lines[0] ?? "").trim();
  return lines
    .filter((line, i) => !POINTER.test(line.trim()) && !POINTER.test((lines[i + 1] ?? "").trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};

// ── Langium extraction (@mermaid-js/parser) ─────────────────────────────────

async function langiumParseAny(type: string, content: string): Promise<unknown> {
  switch (type) {
    case "architecture":
      return langiumParse("architecture", content);
    case "info":
      return langiumParse("info", content);
    case "pie":
      return langiumParse("pie", content);
    case "gitGraph":
      return langiumParse("gitGraph", content);
    case "packet":
      return langiumParse("packet", content);
    case "radar":
      return langiumParse("radar", content);
    case "treemap":
      return langiumParse("treemap", content);
    case "treeView":
      return langiumParse("treeView", content);
    case "wardley":
      return langiumParse("wardley", content);
    default:
      throw new Error(`no langium parser for ${type}`);
  }
}

async function extractLangiumStats(content: string, keyword: string): Promise<MermaidStats> {
  const mapped = LANGIUM_TYPES[keyword];
  if (!mapped) throw new Error(`not a langium keyword: ${keyword}`);
  const ast = (await langiumParseAny(mapped, content)) as Record<string, unknown>;

  const nodeIds: string[] = [];
  const subgraphNames: string[] = [];
  let edges = 0;
  let maxDepth = 0;
  let treeDepth = 0;

  switch (mapped) {
    case "architecture": {
      const services = (ast.services as Array<{ id?: string }> | undefined) ?? [];
      const groups = (ast.groups as Array<{ id?: string; title?: string; in?: string }> | undefined) ?? [];
      const edgeArr = (ast.edges as Array<unknown> | undefined) ?? [];
      nodeIds.push(...services.map((s) => s.id ?? ""));
      subgraphNames.push(...groups.map((g) => g.title ?? g.id ?? ""));
      maxDepth = architectureDepth(groups);
      edges = edgeArr.length;
      break;
    }
    case "pie": {
      const sections = (ast.sections as Array<{ label?: string }> | undefined) ?? [];
      nodeIds.push(...sections.map((s, i) => s.label ?? `slice_${i}`));
      break;
    }
    case "packet": {
      const blocks = (ast.blocks as Array<unknown> | undefined) ?? [];
      nodeIds.push(...blocks.map((_, i) => `block_${i}`));
      break;
    }
    case "gitGraph": {
      const statements = (ast.statements as Array<{ $type?: string; id?: string; name?: string }> | undefined) ?? [];
      for (const s of statements) {
        if (s.$type === "Commit") nodeIds.push(s.id ?? `commit_${nodeIds.length}`);
        else if (s.$type === "Branch") subgraphNames.push(s.name ?? `branch_${subgraphNames.length}`);
        else if (s.$type === "Merge") edges++;
      }
      break;
    }
    case "radar": {
      const axes = (ast.axes as Array<{ name?: string }> | undefined) ?? [];
      const curves = (ast.curves as Array<{ name?: string }> | undefined) ?? [];
      nodeIds.push(...axes.map((a, i) => a.name ?? `axis_${i}`));
      nodeIds.push(...curves.map((c, i) => c.name ?? `curve_${i}`));
      edges = axes.length * curves.length;
      break;
    }
    case "treeView": {
      // AST shape: flat ast.nodes[] with { name, indent }. Tree structure
      // derives from indent values; edges = nodes - roots.
      const nodes = (ast.nodes as Array<{ name?: string; indent?: number }> | undefined) ?? [];
      const stats = indentTreeStats(nodes.map((n, i) => ({ label: n.name ?? `node_${i}`, indent: n.indent ?? 0 })));
      nodeIds.push(...stats.labels);
      edges = stats.edges;
      treeDepth = stats.depth;
      break;
    }
    case "treemap": {
      // AST shape: ast.TreemapRows[] with .indent and .item.{Section|Leaf}.name.
      const rows = (ast.TreemapRows as Array<{ indent?: number; item?: { name?: string } }> | undefined) ?? [];
      const stats = indentTreeStats(rows.map((r, i) => ({ label: r.item?.name ?? `row_${i}`, indent: r.indent ?? 0 })));
      nodeIds.push(...stats.labels);
      edges = stats.edges;
      treeDepth = stats.depth;
      break;
    }
    case "wardley": {
      // AST shape: ast.anchors[], ast.components[], ast.links[] — NOT ast.edges.
      const components = (ast.components as Array<{ name?: string }> | undefined) ?? [];
      const anchors = (ast.anchors as Array<{ name?: string }> | undefined) ?? [];
      const links = (ast.links as Array<unknown> | undefined) ?? [];
      nodeIds.push(...anchors.map((a, i) => a.name ?? `anchor_${i}`));
      nodeIds.push(...components.map((c, i) => c.name ?? `comp_${i}`));
      edges = links.length;
      break;
    }
    case "info":
      break; // trivial diagram type, no structure
  }

  return {
    nodes: new Set(nodeIds.filter(Boolean)).size,
    edges,
    subgraphs: subgraphNames.length,
    max_subgraph_depth: maxDepth,
    max_tree_depth: treeDepth,
    node_ids: [...new Set(nodeIds.filter(Boolean))].sort(),
    subgraph_names: subgraphNames,
    parser_used: "langium",
    diagram_type: keyword,
    error: null,
  };
}

function architectureDepth(groups: Array<{ id?: string; in?: string }>): number {
  const parentOf = new Map<string, string | undefined>();
  for (const g of groups) parentOf.set(g.id ?? "", g.in);
  let max = 0;
  for (const g of groups) {
    let depth = 1;
    let cur = g.in;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      depth++;
      cur = parentOf.get(cur);
    }
    if (depth > max) max = depth;
  }
  return max;
}

// Compute tree structure from a flat, indent-ordered node list.
// Used for treemap and treeView, where parent-child is encoded via
// indentation rather than explicit edges. `labels` preserves the node names for VCS bookkeeping; `edges` is
// the number of parent-child links (nodes - number_of_roots); `depth` is
// the maximum number of indent-steps past the root level.
export function indentTreeStats(items: Array<{ label: string; indent: number }>): {
  labels: string[];
  edges: number;
  depth: number;
} {
  if (items.length === 0) return { labels: [], edges: 0, depth: 0 };
  const labels = items.map((i) => i.label);
  const indents = items.map((i) => i.indent);
  const minIndent = Math.min(...indents);
  const uniqueIndents = [...new Set(indents)].sort((a, b) => a - b);
  const roots = items.filter((i) => i.indent === minIndent).length;
  const edges = Math.max(0, items.length - roots);
  const depth = Math.max(0, uniqueIndents.length - 1);
  return { labels, edges, depth };
}

// ── mermaid-core extraction via .db after parse ─────────────────────────────
//
// Every diagram type's canonical DB has a different shape. Some expose data
// via getter methods (kanban's getData, block's getBlocks, sankey's
// getNodes/getLinks). Others expose it via direct properties (flowchart's
// vertices/edges/subGraphs, er.entities, state.nodes,
// requirement.requirements). We dispatch on diagram.type and
// each adapter reads ONLY that type's canonical surface — no text parsing,
// no regex. The parser did the work; we just read the result.

type AnyDb = Record<string, unknown>;
interface Structure {
  nodeIds: string[];
  edges: number;
  subgraphNames: string[];
  maxDepth: number;
  // Set only by the tree-shaped types: see max_tree_depth.
  treeDepth?: number;
}
type CoreAdapter = (db: AnyDb) => Structure;

async function extractCoreStats(content: string, keyword: string): Promise<MermaidStats> {
  const mermaid = await getMermaid();

  // mermaid.parse() lazily registers the matching diagram and populates its DB.
  await mermaid.parse(content);

  const api = (
    mermaid as unknown as {
      mermaidAPI?: { getDiagramFromText?: (t: string) => Promise<{ db: AnyDb; type?: string }> };
    }
  ).mermaidAPI;
  if (!api?.getDiagramFromText) throw new Error("mermaidAPI.getDiagramFromText not available");
  const diagram = await api.getDiagramFromText(content);
  const diagramType = diagram.type ?? keyword;

  const adapter = CORE_ADAPTERS[diagramType];
  if (!adapter) {
    throw new Error(`no core adapter for diagram.type="${diagramType}" (keyword="${keyword}")`);
  }
  const { nodeIds, edges, subgraphNames, maxDepth, treeDepth = 0 } = adapter(diagram.db);

  return {
    nodes: nodeIds.length,
    edges,
    subgraphs: subgraphNames.length,
    max_subgraph_depth: maxDepth,
    max_tree_depth: treeDepth,
    node_ids: [...nodeIds].sort(),
    subgraph_names: subgraphNames,
    parser_used: "mermaid-core",
    diagram_type: diagramType,
    error: null,
  };
}

// ─── Per-type DB adapters ──
// Each adapter reads ONLY canonical mermaid DB surface for that diagram type.
// Keys below match the `diagram.type` string mermaid assigns after parse
// (which may differ from the first-line keyword — e.g. "flowchart-v2" vs
// "flowchart", "er" vs "erDiagram", "stateDiagram" vs "stateDiagram-v2").

const CORE_ADAPTERS: Record<string, CoreAdapter> = {
  "flowchart-v2": adaptFlowchart,
  flowchart: adaptFlowchart,
  // `flowchart-elk` is a flowchart drawn with the ELK layout. Mermaid parses it
  // with the flowchart grammar into the same DB, and only the layout differs.
  "flowchart-elk": adaptFlowchart,
  graph: adaptFlowchart,
  classDiagram: adaptClass,
  "classDiagram-v2": adaptClass,
  class: adaptClass,
  sequence: adaptSequence,
  block: adaptBlock,
  c4: adaptC4,
  er: adaptEr,
  gantt: adaptGantt,
  ishikawa: adaptIshikawa,
  kanban: adaptKanban,
  mindmap: adaptMindmap,
  quadrantChart: adaptQuadrantChart,
  requirement: adaptRequirement,
  sankey: adaptSankey,
  stateDiagram: adaptState,
  "stateDiagram-v2": adaptState,
  timeline: adaptTimeline,
  journey: adaptJourney,
  venn: adaptVenn,
  xychart: adaptXychart,
};

function callGetter<T>(db: AnyDb, name: string): T | null {
  const fn = db[name];
  return typeof fn === "function" ? ((fn as () => T)() ?? null) : null;
}

function adaptFlowchart(db: AnyDb): Structure {
  // flowchartDb exposes data on direct properties: db.vertices (Map),
  // db.edges (Array), db.subGraphs (Array). No getters.
  const vertices = (db.vertices instanceof Map ? db.vertices : new Map()) as Map<string, unknown>;
  const edgesArr = (Array.isArray(db.edges) ? db.edges : []) as Array<unknown>;
  const subGraphs = (Array.isArray(db.subGraphs) ? db.subGraphs : []) as Array<{
    id?: string;
    title?: string;
    nodes?: string[];
  }>;
  return {
    nodeIds: [...vertices.keys()],
    edges: edgesArr.length,
    subgraphNames: subGraphs.map((s) => s.title ?? s.id ?? ""),
    maxDepth: subgraphNestingDepth(subGraphs),
  };
}

function adaptClass(db: AnyDb): Structure {
  // classDb exposes data on direct properties: db.classes (Map), db.relations (Array).
  const classes = (db.classes instanceof Map ? db.classes : new Map()) as Map<string, unknown>;
  const relations = (Array.isArray(db.relations) ? db.relations : []) as Array<unknown>;
  return { nodeIds: [...classes.keys()], edges: relations.length, subgraphNames: [], maxDepth: 0 };
}

interface SequenceState {
  records?: {
    actors?: Map<string, unknown>;
    messages?: Array<unknown>;
  };
}
function adaptSequence(db: AnyDb): Structure {
  // sequenceDb stores state under db.state.records.{actors,messages}.
  const state = (db.state as SequenceState | undefined)?.records;
  const actors = state?.actors instanceof Map ? state.actors : new Map<string, unknown>();
  const rawMessages = state?.messages;
  const messages = Array.isArray(rawMessages) ? rawMessages : [];
  return {
    nodeIds: [...actors.keys()],
    edges: messages.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

interface BlockItem {
  id?: string;
  type?: string;
  children?: BlockItem[];
}
function adaptBlock(db: AnyDb): Structure {
  // Block uses a recursive tree: container blocks have non-empty `children`,
  // leaf blocks don't. getBlocks() is the top-level list; walk recursively.
  const roots = callGetter<BlockItem[]>(db, "getBlocks") ?? [];
  const edges = (callGetter<Array<unknown>>(db, "getEdges") ?? []).length;
  const leaves: string[] = [];
  const containers: string[] = [];
  let maxDepth = 0;
  const walk = (items: BlockItem[], depth: number): void => {
    for (const item of items) {
      const id = item.id ?? "";
      const kids = item.children ?? [];
      // Mermaid wraps content in "space" / "composite" synthetic nodes —
      // count user-visible blocks only. Treat composite-with-children as
      // a container (subgraph), everything else as a leaf node.
      if (kids.length > 0) {
        containers.push(id);
        if (depth + 1 > maxDepth) maxDepth = depth + 1;
        walk(kids, depth + 1);
      } else if (item.type !== "space" && item.type !== "composite") {
        leaves.push(id);
      }
    }
  };
  walk(roots, 0);
  return { nodeIds: leaves, edges, subgraphNames: containers, maxDepth };
}

interface C4Boundary {
  alias?: string;
  label?: { text?: string };
}
function adaptC4(db: AnyDb): Structure {
  const shapes = callGetter<Array<{ alias?: string }>>(db, "getC4ShapeArray") ?? [];
  const rels = callGetter<Array<unknown>>(db, "getRels") ?? [];
  const boundaries = callGetter<C4Boundary[]>(db, "getBoundaries") ?? [];
  // Top-level "global" boundary is synthetic; exclude from user-visible count.
  const userBoundaries = boundaries.filter((b) => b.alias && b.alias !== "global");
  return {
    nodeIds: shapes.map((s) => s.alias ?? ""),
    edges: rels.length,
    subgraphNames: userBoundaries.map((b) => b.alias ?? ""),
    maxDepth: userBoundaries.length > 0 ? 1 : 0,
  };
}

function adaptEr(db: AnyDb): Structure {
  // ER db exposes data on direct properties. entities is a Map keyed on
  // entity name (CAR, NAMED-DRIVER); relationships is an Array.
  const entities = db.entities instanceof Map ? db.entities : new Map<string, unknown>();
  const relationships = (Array.isArray(db.relationships) ? db.relationships : []) as Array<unknown>;
  return {
    nodeIds: [...entities.keys()],
    edges: relationships.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

interface GanttTask {
  id?: string;
  task?: string;
}
interface GanttSection {
  name?: string;
}
function adaptGantt(db: AnyDb): Structure {
  const tasks = callGetter<GanttTask[]>(db, "getTasks") ?? [];
  const sections = callGetter<GanttSection[]>(db, "getSections") ?? [];
  return {
    nodeIds: tasks.map((t) => t.id ?? t.task ?? ""),
    edges: 0,
    subgraphNames: sections.map((s) => s.name ?? ""),
    maxDepth: sections.length > 0 ? 1 : 0,
  };
}

interface IshikawaNode {
  label?: string;
  name?: string;
  children?: IshikawaNode[];
}
function adaptIshikawa(db: AnyDb): Structure {
  const root = callGetter<IshikawaNode | null>(db, "getRoot");
  if (!root) return { nodeIds: [], edges: 0, subgraphNames: [], maxDepth: 0 };
  const labels: string[] = [];
  let maxDepth = 0;
  const walk = (node: IshikawaNode, depth: number): void => {
    labels.push(node.label ?? node.name ?? "");
    if (depth > maxDepth) maxDepth = depth;
    for (const c of node.children ?? []) walk(c, depth + 1);
  };
  walk(root, 0);
  return {
    nodeIds: labels,
    edges: Math.max(0, labels.length - 1),
    subgraphNames: [],
    maxDepth: 0,
    treeDepth: maxDepth,
  };
}

interface KanbanNode {
  id?: string;
  parentId?: string;
  isGroup?: boolean;
}
function adaptKanban(db: AnyDb): Structure {
  // getData() returns a flat node list; isGroup=true marks columns, tasks
  // point at their column via parentId.
  const data = callGetter<{ nodes?: KanbanNode[] } | null>(db, "getData");
  const nodes = data?.nodes ?? [];
  const columns = nodes.filter((n) => n.isGroup === true);
  const tasks = nodes.filter((n) => n.isGroup === false);
  return {
    nodeIds: tasks.map((t) => t.id ?? ""),
    edges: 0,
    subgraphNames: columns.map((c) => c.id ?? ""),
    maxDepth: columns.length > 0 ? 1 : 0,
  };
}

interface MindmapNode {
  nodeId?: number;
  descr?: string;
  children?: MindmapNode[];
}
function adaptMindmap(db: AnyDb): Structure {
  const root = callGetter<MindmapNode | null>(db, "getMindmap");
  if (!root) return { nodeIds: [], edges: 0, subgraphNames: [], maxDepth: 0 };
  const labels: string[] = [];
  let maxDepth = 0;
  const walk = (node: MindmapNode, depth: number): void => {
    labels.push(node.descr ?? String(node.nodeId ?? ""));
    if (depth > maxDepth) maxDepth = depth;
    for (const c of node.children ?? []) walk(c, depth + 1);
  };
  walk(root, 0);
  return {
    nodeIds: labels,
    edges: Math.max(0, labels.length - 1),
    subgraphNames: [],
    maxDepth: 0,
    treeDepth: maxDepth,
  };
}

type QuadrantText = { text?: string } | string | undefined;
interface QuadrantData {
  quadrants?: Array<{ text?: QuadrantText }>;
  points?: Array<{ text?: QuadrantText }>;
}
// A node is every plotted point, plus every quadrant that carries a label. The
// four quadrant boxes are always drawn, so an unlabelled one adds nothing to
// read, while every point is a mark the reader must place.
function adaptQuadrantChart(db: AnyDb): Structure {
  const data = callGetter<QuadrantData | null>(db, "getQuadrantData");
  const textOf = (t: QuadrantText): string => (typeof t === "string" ? t : (t?.text ?? ""));
  const quadrants = (data?.quadrants ?? []).map((q) => textOf(q.text)).filter((t) => t.trim() !== "");
  const points = (data?.points ?? []).map((p, i) => textOf(p.text) || `point_${i}`);
  return { nodeIds: [...quadrants, ...points], edges: 0, subgraphNames: [], maxDepth: 0 };
}

function adaptRequirement(db: AnyDb): Structure {
  // requirements and elements are both Maps keyed on name. relations is an Array.
  const requirements = db.requirements instanceof Map ? db.requirements : new Map<string, unknown>();
  const elements = db.elements instanceof Map ? db.elements : new Map<string, unknown>();
  const relations = (Array.isArray(db.relations) ? db.relations : []) as Array<unknown>;
  return {
    nodeIds: [...requirements.keys(), ...elements.keys()],
    edges: relations.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

function adaptSankey(db: AnyDb): Structure {
  const nodes = callGetter<Array<{ id?: string }>>(db, "getNodes") ?? [];
  const links = callGetter<Array<unknown>>(db, "getLinks") ?? [];
  return {
    nodeIds: nodes.map((n) => n.id ?? ""),
    edges: links.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

interface StateNode {
  id?: string;
  type?: string;
  isGroup?: boolean;
  parentId?: string;
}
interface StateEdge {
  id1?: string;
  id2?: string;
}
// A composite state (`state A { ... }`) is a group that holds other states,
// so it counts as a subgraph too, and its nesting depth is read from each
// state's parentId chain. It stays a node as well, because it is drawn as a
// labelled state.
function adaptState(db: AnyDb): Structure {
  // stateDiagram db exposes data on direct properties.
  const nodes = (db.nodes as StateNode[] | undefined) ?? [];
  const edges = (db.edges as StateEdge[] | undefined) ?? [];
  const groups = nodes.filter((n) => n.isGroup === true);
  const parentOf = new Map(nodes.map((n) => [n.id ?? "", n.parentId]));
  let maxDepth = 0;
  for (const g of groups) {
    let depth = 1;
    const seen = new Set<string>();
    for (let cur = g.parentId; cur && !seen.has(cur); cur = parentOf.get(cur)) {
      seen.add(cur);
      depth++;
    }
    maxDepth = Math.max(maxDepth, depth);
  }
  return {
    nodeIds: nodes.map((n) => n.id ?? ""),
    edges: edges.length,
    subgraphNames: groups.map((g) => g.id ?? ""),
    maxDepth,
  };
}

interface TimelineTask {
  task?: string;
  section?: string;
  events?: string[];
}
interface TimelineSection {
  sectionName?: string;
  section?: string;
}
function adaptTimeline(db: AnyDb): Structure {
  // Every period and every event under it is a box on the page.
  const tasks = callGetter<TimelineTask[]>(db, "getTasks") ?? [];
  const sections = callGetter<TimelineSection[]>(db, "getSections") ?? [];
  return {
    nodeIds: tasks.flatMap((t) => [t.task ?? "", ...(t.events ?? []).map((e) => `${t.task ?? ""}: ${e}`)]),
    edges: 0,
    subgraphNames: sections.map((s) => s.sectionName ?? s.section ?? ""),
    maxDepth: sections.length > 0 ? 1 : 0,
  };
}

interface JourneyTask {
  task?: string;
}
interface JourneySection {
  id?: string;
  name?: string;
}
function adaptJourney(db: AnyDb): Structure {
  const tasks = callGetter<JourneyTask[]>(db, "getTasks") ?? [];
  const sections = callGetter<JourneySection[]>(db, "getSections") ?? [];
  return {
    nodeIds: tasks.map((t) => t.task ?? ""),
    edges: 0,
    subgraphNames: sections.map((s) => s.name ?? s.id ?? ""),
    maxDepth: sections.length > 0 ? 1 : 0,
  };
}

interface VennSet {
  id?: string;
}
interface VennSubset {
  sets?: string[];
}
function adaptVenn(db: AnyDb): Structure {
  const sets = callGetter<VennSet[]>(db, "getCurrentSets") ?? [];
  const subsets = callGetter<VennSubset[]>(db, "getSubsetData") ?? [];
  // Subsets with multiple sets = unions/intersections = edges.
  const multiSetSubsets = subsets.filter((s) => (s.sets?.length ?? 0) >= 2);
  return {
    nodeIds: sets.map((s) => s.id ?? ""),
    edges: multiSetSubsets.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

interface XYChartData {
  xAxis?: { categories?: string[] };
  plots?: Array<{ data?: unknown[] }>;
}
// A node is an x position: a category, or, on a numeric x-axis, a point of the
// longest series.
function adaptXychart(db: AnyDb): Structure {
  const data = callGetter<XYChartData | null>(db, "getXYChartData");
  const categories = data?.xAxis?.categories ?? [];
  if (categories.length > 0) return { nodeIds: categories, edges: 0, subgraphNames: [], maxDepth: 0 };
  const longest = Math.max(0, ...(data?.plots ?? []).map((p) => p.data?.length ?? 0));
  return { nodeIds: Array.from({ length: longest }, (_, i) => `x_${i}`), edges: 0, subgraphNames: [], maxDepth: 0 };
}

function subgraphNestingDepth(subGraphs: Array<{ id?: string; nodes?: string[] }>): number {
  if (subGraphs.length === 0) return 0;
  const idToMembers = new Map<string, Set<string>>();
  for (const sg of subGraphs) {
    if (sg.id) idToMembers.set(sg.id, new Set(sg.nodes ?? []));
  }
  let max = 1;
  const depthOf = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 1;
    seen.add(id);
    let d = 1;
    for (const [otherId, members] of idToMembers) {
      if (otherId !== id && members.has(id)) {
        d = Math.max(d, 1 + depthOf(otherId, seen));
      }
    }
    return d;
  };
  for (const id of idToMembers.keys()) max = Math.max(max, depthOf(id, new Set()));
  return max;
}
