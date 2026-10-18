// The parse engine: reads a diagram's structure with mermaid's own parsers.
// The Langium grammars in @mermaid-js/parser cover the newer diagram types, and
// the JISON parsers in mermaid core, reached through a happy-dom shim, cover
// the rest. Every adapter reads the parser's result, never the text, so a
// diagram is measured the way mermaid itself reads it.

import { parse as langiumParse } from "@mermaid-js/parser";
import Color from "colorjs.io";
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
  // happy-dom's CSS.supports("color", v) is true for any word, where a browser
  // checks that v is a colour. Mermaid asks it to split `box Shop` into a fill
  // and a title, so the shim's answer gave every one-word box title away as
  // its fill. A colour is whatever colorjs.io can parse, as in color.ts.
  // happy-dom builds a fresh CSS object on each read, so the window's CSS is
  // replaced by one fixed object that carries the corrected check.
  const css = (win as unknown as { CSS?: { supports: (p: string, v?: string) => boolean } }).CSS;
  if (css) {
    const supports = css.supports.bind(css);
    const fixed = {
      ...css,
      supports: (property: string, value?: string): boolean =>
        property === "color" && value !== undefined ? isCssColour(value) : supports(property, value),
    };
    Object.defineProperty(win, "CSS", { value: fixed, configurable: true });
  }
};

const isCssColour = (value: string): boolean => Color.try(value) !== null;

// ZenUML is drawn by an external add-on (@mermaid-js/mermaid-zenuml) that this
// package does not ship. Mermaid's API for an external diagram registers its
// detector alone, so mermaid's own detection names a zenuml diagram, as the
// add-on's detector does, and loading it fails with the reason.
const ZENUML = {
  id: "zenuml",
  detector: (text: string): boolean => /^\s*zenuml/.test(text),
  loader: (): Promise<never> =>
    Promise.reject(new Error("zenuml is drawn by an external mermaid add-on that is not installed")),
};

// Mermaid core is loaded once, when this module loads, so its diagram detection
// is there for the synchronous detectKeyword. The shim goes in first, and
// initialize registers every diagram's detector.
const loadMermaid = async (): Promise<typeof import("mermaid").default> => {
  installDomShim();
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({});
  await mermaid.registerExternalDiagrams([ZENUML]);
  return mermaid;
};

const mermaidCore = await loadMermaid();
const getMermaid = async (): Promise<typeof import("mermaid").default> => mermaidCore;

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
  // The rows drawn inside a node: an erDiagram entity's attributes, and a
  // classDiagram class's attributes and methods. A row is text to read, but it
  // sits in a box the reader has already found, so it is not a node. It is 0
  // for every other type.
  rows: number;
  node_ids: string[];
  subgraph_names: string[];
  // The parser that read the diagram, or, on a failure, the one whose reason
  // `error` carries: langium for the types its grammars own, else mermaid-core.
  parser_used: "langium" | "mermaid-core";
  diagram_type: string;
  // The parser's reason, on one line, when no parser produced structure. Line
  // numbers in it count from the diagram's own first line.
  error: string | null;
  // The diagram line the parser's error points at, counted from the diagram's
  // own first line, or null when it points at none or there is no error. It
  // is optional, so a DiagramStats built without it stays valid.
  error_line?: number | null;
}

type MermaidStats = DiagramStats;

// The diagram types whose grammar is a Langium one in @mermaid-js/parser, by the
// id mermaid's detection gives them, which is also the grammar's name.
type LangiumType =
  | "architecture"
  | "info"
  | "pie"
  | "gitGraph"
  | "packet"
  | "radar"
  | "treemap"
  | "treeView"
  | "wardley";

const LANGIUM_TYPES: ReadonlySet<string> = new Set<LangiumType>([
  "architecture",
  "info",
  "pie",
  "gitGraph",
  "packet",
  "radar",
  "treemap",
  "treeView",
  "wardley",
]);

const isLangiumType = (type: string): type is LangiumType => LANGIUM_TYPES.has(type);

// The keyword a diagram type is declared with, where mermaid's id for the type
// differs from it. Every other id, such as pie or gantt, is its own keyword. A
// type declared two ways has one keyword: `graph` and `flowchart` are both
// flowchart, and the v2 class and state diagrams are classDiagram and
// stateDiagram.
const KEYWORD_OF_TYPE: Readonly<Record<string, string>> = {
  flowchart: "flowchart",
  "flowchart-v2": "flowchart",
  er: "erDiagram",
  sequence: "sequenceDiagram",
  class: "classDiagram",
  classDiagram: "classDiagram",
  state: "stateDiagram",
  stateDiagram: "stateDiagram",
  requirement: "requirementDiagram",
};

// The diagram type mermaid's own detection gives a diagram, past its
// frontmatter, directives and comments, or null when mermaid detects none.
export const detectType = (content: string): string | null => {
  try {
    return mermaidCore.detectType(content);
  } catch (err) {
    if (err instanceof Error && err.name === "UnknownDiagramError") return null;
    throw err;
  }
};

const keywordOf = (type: string | null): string | null => (type === null ? null : (KEYWORD_OF_TYPE[type] ?? type));

// The keyword of the diagram type mermaid detects, such as flowchart or
// erDiagram, or null when mermaid detects none.
export function detectKeyword(content: string): string | null {
  return keywordOf(detectType(content));
}

// The diagram_type of a diagram whose type mermaid does not detect.
export const UNKNOWN_TYPE = "unknown";

export async function extractStats(content: string): Promise<MermaidStats> {
  const type = detectType(content);
  const keyword = keywordOf(type) ?? UNKNOWN_TYPE;

  // 1. Langium grammar (@mermaid-js/parser) — typed AST, no DOM needed.
  // Its error is kept, because for these types it is the parser that owns the
  // grammar, and mermaid core's attempt below is only a second chance.
  const langium = type !== null && isLangiumType(type);
  let langiumError: ParserError | null = null;
  if (langium) {
    try {
      return await extractLangiumStats(content, type);
    } catch (err) {
      langiumError = parserError(err);
    }
  }

  // 2. Mermaid-core JISON parser via happy-dom. The shim satisfies
  // DOMPurify; the parsers populate each type's DB (vertices, edges,
  // blocks, sections, etc.). A per-type adapter in extractCoreStats reads
  // the canonical DB shape.
  let coreError: ParserError;
  try {
    return await extractCoreStats(content);
  } catch (err) {
    coreError = parserError(err);
  }
  const failure = langiumError ?? coreError;

  // 3. Neither canonical parser produced stats. Return a tagged failure so
  // parseFailed (metrics.ts) flags it, reported as parse-diagram-unparseable.
  return {
    nodes: 0,
    edges: 0,
    subgraphs: 0,
    max_subgraph_depth: 0,
    max_tree_depth: 0,
    rows: 0,
    node_ids: [],
    subgraph_names: [],
    parser_used: langium ? "langium" : "mermaid-core",
    diagram_type: keyword,
    error: failure.reason,
    error_line: failure.line,
  };
}

// What a JISON parser in mermaid core attaches to its error. A parse error
// carries the location and the tokens it expected; a lexical error carries only
// its 0-based line.
interface JisonHash {
  line?: number;
  token?: string | null;
  loc?: { first_line?: number };
  expected?: string[];
}

// What a Langium grammar in @mermaid-js/parser attaches to its error.
interface LangiumResult {
  lexerErrors: Array<{ line?: number; column?: number; message: string }>;
  parserErrors: Array<{ message: string; token?: { startLine?: number; startColumn?: number } }>;
}

const jisonHash = (err: unknown): JisonHash | null => {
  const hash = (err as { hash?: unknown } | null)?.hash;
  return typeof hash === "object" && hash !== null ? (hash as JisonHash) : null;
};

const langiumResult = (err: unknown): LangiumResult | null => {
  const result = (err as { result?: Partial<LangiumResult> } | null)?.result;
  return Array.isArray(result?.lexerErrors) && Array.isArray(result?.parserErrors) ? (result as LangiumResult) : null;
};

// A reason on one line, and the diagram line it points at, when it points at one.
export interface ParserError {
  reason: string;
  line: number | null;
}

const fromJison = (hash: JisonHash): ParserError => {
  const parseLine = hash.loc?.first_line;
  if (parseLine !== undefined) {
    const got = `'${hash.token ?? ""}'`;
    const what = hash.expected?.length ? `Expecting ${hash.expected.join(", ")}, got ${got}` : `Unexpected ${got}`;
    return { reason: `Parse error on line ${parseLine}: ${what}`, line: parseLine };
  }
  if (hash.line === undefined) return { reason: "Parse error", line: null };
  const line = hash.line + 1;
  return { reason: `Lexical error on line ${line}: Unrecognized text`, line };
};

// Where a Langium error points. A token past the end of the input, as an
// unexpected end is, has NaN for its line and column.
const at = (line: number | null | undefined, column: number | null | undefined): string =>
  Number.isFinite(line)
    ? `on line ${line}, column ${Number.isFinite(column) ? column : "?"}`
    : "at the end of the diagram";

const fromLangium = (result: LangiumResult): ParserError => {
  const lexer = result.lexerErrors.map((e) => ({
    line: e.line,
    text: `Lexer error ${at(e.line, e.column)}: ${e.message}`,
  }));
  const parser = result.parserErrors.map((e) => ({
    line: e.token?.startLine,
    text: `Parse error ${at(e.token?.startLine, e.token?.startColumn)}: ${e.message}`,
  }));
  const all = [...lexer, ...parser];
  const first = all.find((e) => Number.isFinite(e.line))?.line;
  return { reason: `Parsing failed: ${all.map((e) => e.text).join(" ")}`, line: first ?? null };
};

// A parser's whole reason on one line, so a finding stays one line, built from
// the fields the parser attaches to its error: a JISON parser's hash, or a
// Langium grammar's lexer and parser errors. Any other error is mermaid's own,
// such as no diagram type detected, whose message runs on with the diagram's
// text, so its first line is the reason.
export const parserError = (err: unknown): ParserError => {
  const hash = jisonHash(err);
  if (hash) return fromJison(hash);
  const result = langiumResult(err);
  if (result) return fromLangium(result);
  const message = err instanceof Error ? err.message : String(err);
  return { reason: (message.split("\n")[0] ?? "").trim(), line: null };
};

// ── Langium extraction (@mermaid-js/parser) ─────────────────────────────────

async function langiumParseAny(type: LangiumType, content: string): Promise<unknown> {
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
  }
}

async function extractLangiumStats(content: string, type: LangiumType): Promise<MermaidStats> {
  const ast = (await langiumParseAny(type, content)) as Record<string, unknown>;
  const { nodeIds, edges, subgraphNames, maxDepth, treeDepth = 0 } = LANGIUM_ADAPTERS[type](ast);

  return {
    nodes: new Set(nodeIds.filter(Boolean)).size,
    edges,
    subgraphs: subgraphNames.length,
    max_subgraph_depth: maxDepth,
    max_tree_depth: treeDepth,
    rows: 0,
    node_ids: [...new Set(nodeIds.filter(Boolean))].sort(),
    subgraph_names: subgraphNames,
    parser_used: "langium",
    diagram_type: type,
    error: null,
    error_line: null,
  };
}

// ─── Per-type Langium AST adapters ──
// Each adapter reads ONLY the typed AST its grammar produces, the way the
// mermaid-core adapters below read only their type's DB.

type LangiumAdapter = (ast: Record<string, unknown>) => Structure;

const LANGIUM_ADAPTERS: Record<LangiumType, LangiumAdapter> = {
  architecture: adaptLangiumArchitecture,
  info: adaptLangiumInfo,
  pie: adaptLangiumPie,
  gitGraph: adaptLangiumGitGraph,
  packet: adaptLangiumPacket,
  radar: adaptLangiumRadar,
  treemap: adaptLangiumTreemap,
  treeView: adaptLangiumTreeView,
  wardley: adaptLangiumWardley,
};

function adaptLangiumArchitecture(ast: Record<string, unknown>): Structure {
  const services = (ast.services as Array<{ id?: string }> | undefined) ?? [];
  const groups = (ast.groups as Array<{ id?: string; title?: string; in?: string }> | undefined) ?? [];
  const edgeArr = (ast.edges as Array<unknown> | undefined) ?? [];
  return {
    nodeIds: services.map((s) => s.id ?? ""),
    edges: edgeArr.length,
    subgraphNames: groups.map((g) => g.title ?? g.id ?? ""),
    maxDepth: architectureDepth(groups),
  };
}

// A trivial diagram type, with no structure.
function adaptLangiumInfo(): Structure {
  return { nodeIds: [], edges: 0, subgraphNames: [], maxDepth: 0 };
}

function adaptLangiumPie(ast: Record<string, unknown>): Structure {
  const sections = (ast.sections as Array<{ label?: string }> | undefined) ?? [];
  return { nodeIds: sections.map((s, i) => s.label ?? `slice_${i}`), edges: 0, subgraphNames: [], maxDepth: 0 };
}

function adaptLangiumPacket(ast: Record<string, unknown>): Structure {
  const blocks = (ast.blocks as Array<unknown> | undefined) ?? [];
  return { nodeIds: blocks.map((_, i) => `block_${i}`), edges: 0, subgraphNames: [], maxDepth: 0 };
}

function adaptLangiumGitGraph(ast: Record<string, unknown>): Structure {
  const statements = (ast.statements as Array<{ $type?: string; id?: string; name?: string }> | undefined) ?? [];
  const nodeIds: string[] = [];
  const subgraphNames: string[] = [];
  let edges = 0;
  for (const s of statements) {
    if (s.$type === "Commit") nodeIds.push(s.id ?? `commit_${nodeIds.length}`);
    else if (s.$type === "Branch") subgraphNames.push(s.name ?? `branch_${subgraphNames.length}`);
    else if (s.$type === "Merge") edges++;
  }
  return { nodeIds, edges, subgraphNames, maxDepth: 0 };
}

function adaptLangiumRadar(ast: Record<string, unknown>): Structure {
  const axes = (ast.axes as Array<{ name?: string }> | undefined) ?? [];
  const curves = (ast.curves as Array<{ name?: string }> | undefined) ?? [];
  return {
    nodeIds: [...axes.map((a, i) => a.name ?? `axis_${i}`), ...curves.map((c, i) => c.name ?? `curve_${i}`)],
    edges: axes.length * curves.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

function adaptLangiumTreeView(ast: Record<string, unknown>): Structure {
  // AST shape: flat ast.nodes[] with { name, indent }. Tree structure
  // derives from indent values; edges = nodes - roots.
  const nodes = (ast.nodes as Array<{ name?: string; indent?: number }> | undefined) ?? [];
  const stats = indentTreeStats(nodes.map((n, i) => ({ label: n.name ?? `node_${i}`, indent: n.indent ?? 0 })));
  return { nodeIds: stats.labels, edges: stats.edges, subgraphNames: [], maxDepth: 0, treeDepth: stats.depth };
}

function adaptLangiumTreemap(ast: Record<string, unknown>): Structure {
  // AST shape: ast.TreemapRows[] with .indent and .item.{Section|Leaf}.name.
  const rows = (ast.TreemapRows as Array<{ indent?: number; item?: { name?: string } }> | undefined) ?? [];
  const stats = indentTreeStats(rows.map((r, i) => ({ label: r.item?.name ?? `row_${i}`, indent: r.indent ?? 0 })));
  return { nodeIds: stats.labels, edges: stats.edges, subgraphNames: [], maxDepth: 0, treeDepth: stats.depth };
}

function adaptLangiumWardley(ast: Record<string, unknown>): Structure {
  // AST shape: ast.anchors[], ast.components[], ast.links[] — NOT ast.edges.
  const components = (ast.components as Array<{ name?: string }> | undefined) ?? [];
  const anchors = (ast.anchors as Array<{ name?: string }> | undefined) ?? [];
  const links = (ast.links as Array<unknown> | undefined) ?? [];
  return {
    nodeIds: [...anchors.map((a, i) => a.name ?? `anchor_${i}`), ...components.map((c, i) => c.name ?? `comp_${i}`)],
    edges: links.length,
    subgraphNames: [],
    maxDepth: 0,
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
  // Set only by the types that draw rows inside a node: see rows.
  rows?: number;
}
type CoreAdapter = (db: AnyDb) => Structure;

async function extractCoreStats(content: string): Promise<MermaidStats> {
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
  const diagramType = diagram.type ?? UNKNOWN_TYPE;

  const adapter = CORE_ADAPTERS[diagramType];
  if (!adapter) throw new Error(`no core adapter for diagram.type="${diagramType}"`);
  const { nodeIds, edges, subgraphNames, maxDepth, treeDepth = 0, rows = 0 } = adapter(diagram.db);

  return {
    nodes: nodeIds.length,
    edges,
    subgraphs: subgraphNames.length,
    max_subgraph_depth: maxDepth,
    max_tree_depth: treeDepth,
    rows,
    node_ids: [...nodeIds].sort(),
    subgraph_names: subgraphNames,
    parser_used: "mermaid-core",
    diagram_type: diagramType,
    error: null,
    error_line: null,
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
    nodeIds: flowchartNodeIds(vertices.keys(), subGraphs),
    edges: edgesArr.length,
    subgraphNames: subGraphs.map((s) => s.title ?? s.id ?? ""),
    maxDepth: subgraphNestingDepth(subGraphs),
  };
}

// An edge to a subgraph's id (`A --> S`) leaves a vertex named S in the db, but
// mermaid draws that edge to the subgraph's box and draws no node S. So a
// vertex that shares a subgraph's id is the subgraph, not a node.
export const flowchartNodeIds = (ids: Iterable<string>, subGraphs: Array<{ id?: string }>): string[] => {
  const boxes = new Set(subGraphs.map((s) => s.id));
  return [...ids].filter((id) => !boxes.has(id));
};

const lengthOf = (x: unknown): number => (Array.isArray(x) ? x.length : 0);

function adaptClass(db: AnyDb): Structure {
  // classDb exposes data on direct properties: db.classes (Map), db.relations (Array).
  const classes = (db.classes instanceof Map ? db.classes : new Map()) as Map<
    string,
    { members?: unknown; methods?: unknown }
  >;
  const relations = (Array.isArray(db.relations) ? db.relations : []) as Array<unknown>;
  // Each namespace draws a box, and one may sit inside another through parent.
  const namespaces = (db.namespaces instanceof Map ? db.namespaces : new Map()) as Map<
    string,
    { label?: string; parent?: string }
  >;
  const groups = [...namespaces].map(([id, ns]) => ({ id, in: ns.parent, label: ns.label || id }));
  let rows = 0;
  for (const c of classes.values()) rows += lengthOf(c.members) + lengthOf(c.methods);
  return {
    nodeIds: [...classes.keys()],
    edges: relations.length,
    subgraphNames: groups.map((g) => g.label),
    maxDepth: architectureDepth(groups),
    rows,
  };
}

interface SequenceRecord {
  type?: number;
  from?: unknown;
  to?: unknown;
  message?: unknown;
}
interface SequenceState {
  records?: {
    actors?: Map<string, unknown>;
    messages?: Array<unknown>;
    boxes?: Array<{ name?: string }>;
  };
}
// The sequence db's messages list holds every statement in order: a message,
// but also a note, an activation and each line that opens, divides or closes a
// block. Each carries a code from the db's own LINETYPE table. A block opens
// with one code, may be divided (else, and, option), and closes with another.
// A par_over block closes with PAR_END, like par. A `rect` is left out: it
// tints the background behind its messages, with no title or border, so it is
// a highlight rather than a boundary to track.
const SEQUENCE_BLOCK_OPENERS = [
  "LOOP_START",
  "ALT_START",
  "OPT_START",
  "PAR_START",
  "CRITICAL_START",
  "BREAK_START",
  "PAR_OVER_START",
] as const;
const SEQUENCE_BLOCK_CLOSERS = ["LOOP_END", "ALT_END", "OPT_END", "PAR_END", "CRITICAL_END", "BREAK_END"] as const;

export interface SequenceCodes {
  note: number;
  open: ReadonlySet<number>;
  close: ReadonlySet<number>;
}

// The codes read from a sequence db's LINETYPE table. A name the table lacks
// throws, because a statement could not then be told apart.
export const sequenceCodes = (db: AnyDb): SequenceCodes => {
  const table = db.LINETYPE as Readonly<Record<string, unknown>> | undefined;
  const code = (name: string): number => {
    const value = table?.[name];
    if (typeof value !== "number") throw new Error(`the sequence db's LINETYPE has no ${name}`);
    return value;
  };
  return {
    note: code("NOTE"),
    open: new Set(SEQUENCE_BLOCK_OPENERS.map(code)),
    close: new Set(SEQUENCE_BLOCK_CLOSERS.map(code)),
  };
};

// A message runs from one participant to another (or itself). A note also
// names both, so it is told apart by its code, and an activation names only one.
export const isSequenceMessage = (codes: SequenceCodes, m: SequenceRecord): boolean =>
  m.type !== codes.note && typeof m.from === "string" && typeof m.to === "string";

function adaptSequence(db: AnyDb): Structure {
  const codes = sequenceCodes(db);
  // sequenceDb stores state under db.state.records.{actors,messages,boxes}.
  const state = (db.state as SequenceState | undefined)?.records;
  const actors = state?.actors instanceof Map ? state.actors : new Map<string, unknown>();
  const rawMessages = state?.messages;
  const records = (Array.isArray(rawMessages) ? rawMessages : []) as SequenceRecord[];
  const boxes = Array.isArray(state?.boxes) ? state.boxes : [];
  // A box groups participants and a block frames messages: both are drawn as
  // a labelled boundary. Boxes cannot nest, and blocks nest inside each other.
  const subgraphNames = boxes.map((b, i) => b.name || `box_${i}`);
  let depth = 0;
  let maxBlockDepth = 0;
  for (const r of records) {
    if (r.type !== undefined && codes.open.has(r.type)) {
      depth++;
      maxBlockDepth = Math.max(maxBlockDepth, depth);
      subgraphNames.push(typeof r.message === "string" && r.message ? r.message : `block_${subgraphNames.length}`);
    } else if (r.type !== undefined && codes.close.has(r.type)) {
      depth = Math.max(0, depth - 1);
    }
  }
  return {
    nodeIds: [...actors.keys()],
    edges: records.filter((r) => isSequenceMessage(codes, r)).length,
    subgraphNames,
    maxDepth: Math.max(boxes.length > 0 ? 1 : 0, maxBlockDepth),
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
  const entities = (db.entities instanceof Map ? db.entities : new Map()) as Map<string, { attributes?: unknown }>;
  const relationships = (Array.isArray(db.relationships) ? db.relationships : []) as Array<unknown>;
  let rows = 0;
  for (const e of entities.values()) rows += lengthOf(e.attributes);
  return {
    nodeIds: [...entities.keys()],
    edges: relationships.length,
    subgraphNames: [],
    maxDepth: 0,
    rows,
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
  shape?: string;
  isGroup?: boolean;
  parentId?: string;
}
interface StateEdge {
  start?: string;
  end?: string;
}
// The shapes stateDb gives what is not a state: the start and end markers
// ([*], one pair per composite state), and a note with the group mermaid wraps
// it in. A marker only says where a path begins or ends, and a note is an
// annotation, as notes are in every other type.
//
// A divider is one concurrency region of a composite state, the part between
// two `--` lines. Mermaid draws it as an unlabelled area of the composite's
// box, set off from the next region by a dashed line, with no box or title of
// its own. The composite is the boundary the reader finds and tracks, and the
// dashed line only divides it, as `and` divides a sequence `par` block that
// counts once. So a region is neither a state nor a subgraph, and the states
// in it belong to the composite. Its id is also random, so counting it would
// change the node and subgraph names from one parse to the next.
const STATE_DIVIDER = "divider";
const STATE_NOT_A_STATE = new Set(["stateStart", "stateEnd", "note", "noteGroup", STATE_DIVIDER]);

const isCountedState = (n: { shape?: string }): boolean => !STATE_NOT_A_STATE.has(n.shape ?? "");

// Each state's parent with concurrency regions passed over, so a state in a
// region has the composite around the region as its parent.
export const stateParents = (db: AnyDb): ((n: StateNode) => string | undefined) => {
  const all = (db.nodes as StateNode[] | undefined) ?? [];
  const dividers = new Map(all.filter((n) => n.shape === STATE_DIVIDER).map((n) => [n.id ?? "", n.parentId]));
  return (n) => {
    let parent = n.parentId;
    const seen = new Set<string>();
    while (parent !== undefined && dividers.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      parent = dividers.get(parent);
    }
    return parent;
  };
};

// The states and transitions a stateDiagram draws, without markers, notes or
// concurrency regions, each with its parent read past any region. A
// transition into or out of a marker goes with it, as does a note's
// connector. graph.ts draws the same set, so the two never disagree.
export const countedStateElements = <N extends StateNode, E extends StateEdge>(
  db: AnyDb,
): { nodes: N[]; edges: E[] } => {
  const all = (db.nodes as N[] | undefined) ?? [];
  const parentOf = stateParents(db);
  const nodes = all.filter(isCountedState).map((n) => {
    const parentId = parentOf(n);
    const { parentId: _, ...rest } = n;
    return (parentId === undefined ? rest : { ...rest, parentId }) as N;
  });
  const kept = new Set(nodes.map((n) => n.id ?? ""));
  const edges = ((db.edges as E[] | undefined) ?? []).filter((e) => kept.has(e.start ?? "") && kept.has(e.end ?? ""));
  return { nodes, edges };
};

// A composite state (`state A { ... }`) is a group that holds other states,
// so it counts as a subgraph too, and its nesting depth is read from each
// state's parentId chain. It stays a node as well, because it is drawn as a
// labelled state.
function adaptState(db: AnyDb): Structure {
  // stateDiagram db exposes data on direct properties.
  const { nodes, edges } = countedStateElements<StateNode, StateEdge>(db);
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
