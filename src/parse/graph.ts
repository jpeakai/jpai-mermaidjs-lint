// The element-level structure of a diagram, read from mermaid's parser result:
// each node, each edge and each subgraph, with what contains what. The stats in
// stats.ts count the same result, and this keeps the elements themselves, so
// the docs site can draw what the parser returned beside the score it earns.
// Only the types read below are read, and any other type throws.

import {
  countedStateElements,
  flowchartNodeIds,
  getMermaidCore,
  isSequenceMessage,
  SEQUENCE_BLOCK_CLOSE,
  SEQUENCE_BLOCK_OPEN,
} from "./stats.ts";

export interface GraphNode {
  id: string;
  label: string;
  // The subgraph that holds this node, or null at the top level.
  parent: string | null;
  // The shape as mermaid's parser names it, such as "diamond" or "choice".
  shape?: string;
}

export interface GraphEdge {
  // Unique in the graph: mermaid's own id where it gives one, else the two
  // ends and how many edges between them came before, as in L_A_B_0.
  id: string;
  source: string;
  target: string;
  label?: string;
  // The connector as the source writes it, such as "-.->" or "<|--".
  kind?: string;
  // An erDiagram relationship's ends, such as "||--o{", or a classDiagram
  // relation's multiplicities, such as `"1" *-- "many"`.
  cardinality?: string;
}

export interface DiagramGraph {
  diagram_type: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  // A subgraph holds nodes, or other subgraphs through their parent.
  subgraphs: GraphNode[];
  // What is drawn but not counted: a stateDiagram's start and end markers with
  // their transitions, and a classDiagram's lollipop interfaces, which a
  // counted edge may name as an end.
  pseudo?: { nodes: GraphNode[]; edges: GraphEdge[] };
}

// Names each edge by its two ends and how many edges between them came
// before, so a name does not move when an unrelated statement does.
const edgeIds = (): ((source: string, target: string) => string) => {
  const seen = new Map<string, number>();
  return (source, target) => {
    const key = `L_${source}_${target}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${key}_${n}`;
  };
};

type AnyDb = Record<string, unknown>;

interface FlowVertex {
  id: string;
  text?: string;
  type?: string;
}
interface FlowEdge {
  id?: string;
  start: string;
  end: string;
  text?: string;
  type?: string;
  stroke?: string;
}
interface FlowSubgraph {
  id: string;
  title?: string;
  nodes?: string[];
}

// The parser splits a link into a stroke and an arrow type, and the kind puts
// them back as the source spells them. A stretched link (`--->`) only spaces
// the layout, so its length is not kept.
const FLOW_LINE: Record<string, { arrowed: string; open: string }> = {
  normal: { arrowed: "--", open: "---" },
  dotted: { arrowed: "-.-", open: "-.-" },
  thick: { arrowed: "==", open: "===" },
};
const FLOW_HEAD: Record<string, string> = { point: ">", circle: "o", cross: "x" };
const FLOW_TAIL: Record<string, string> = { point: "<", circle: "o", cross: "x" };

const flowKind = (e: FlowEdge): string => {
  if (e.stroke === "invisible") return "~~~";
  const line = FLOW_LINE[e.stroke ?? ""];
  const arrow = /^(double_)?arrow_(point|circle|cross|open)$/.exec(e.type ?? "");
  if (!(line && arrow)) throw new Error(`no kind for the flowchart link ${e.stroke} ${e.type}`);
  const head = arrow[2] ?? "";
  if (head === "open") return line.open;
  return `${arrow[1] ? FLOW_TAIL[head] : ""}${line.arrowed}${FLOW_HEAD[head]}`;
};

// Mermaid lists each member once, under its innermost subgraph, and a nested
// subgraph is listed by id as a member of the one around it. An edge may end
// at a subgraph's id, and then it runs to the subgraph, as stats.ts counts it.
const flowchartGraph = (type: string, db: AnyDb): DiagramGraph => {
  const vertices = db.vertices instanceof Map ? ([...db.vertices.values()] as FlowVertex[]) : [];
  const edges = (Array.isArray(db.edges) ? db.edges : []) as FlowEdge[];
  const subGraphs = (Array.isArray(db.subGraphs) ? db.subGraphs : []) as FlowSubgraph[];
  const parentOf = new Map<string, string>();
  for (const sg of subGraphs) for (const member of sg.nodes ?? []) parentOf.set(member, sg.id);
  const kept = new Set(
    flowchartNodeIds(
      vertices.map((v) => v.id),
      subGraphs,
    ),
  );
  const id = edgeIds();
  return {
    diagram_type: type,
    nodes: vertices
      .filter((v) => kept.has(v.id))
      .map((v) => ({ id: v.id, label: v.text ?? v.id, parent: parentOf.get(v.id) ?? null, shape: v.type ?? "square" })),
    edges: edges.map((e) => ({
      id: e.id ?? id(e.start, e.end),
      source: e.start,
      target: e.end,
      kind: flowKind(e),
      ...(e.text ? { label: e.text } : {}),
    })),
    subgraphs: subGraphs.map((sg) => ({ id: sg.id, label: sg.title ?? sg.id, parent: parentOf.get(sg.id) ?? null })),
  };
};

interface MindmapNode {
  id: number;
  descr?: string;
  children?: MindmapNode[];
}

// A mindmap's labels may repeat, so each entry is named by the parser's own id.
const mindmapGraph = (type: string, db: AnyDb): DiagramGraph => {
  const getRoot = db.getMindmap;
  const root = typeof getRoot === "function" ? (getRoot.call(db) as MindmapNode | null) : null;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeId = edgeIds();
  const walk = (node: MindmapNode, parent: string | null): void => {
    const id = `n${node.id}`;
    nodes.push({ id, label: node.descr ?? id, parent: null });
    if (parent) edges.push({ id: edgeId(parent, id), source: parent, target: id });
    for (const child of node.children ?? []) walk(child, id);
  };
  if (root) walk(root, null);
  return { diagram_type: type, nodes, edges, subgraphs: [] };
};

interface SequenceActor {
  description?: string;
  box?: { name?: string };
}
interface SequenceRecord {
  type?: number;
  from?: unknown;
  to?: unknown;
  message?: unknown;
}

// A participant is a node, and a message an edge between two. A box holds its
// participants. A block (loop, alt, opt, par and the rest) frames messages,
// not participants, so it holds no node; it is drawn as an empty boundary,
// inside the block around it.
const sequenceGraph = (type: string, db: AnyDb): DiagramGraph => {
  const records = (db.state as { records?: Record<string, unknown> } | undefined)?.records ?? {};
  const actors = records.actors instanceof Map ? (records.actors as Map<string, SequenceActor>) : new Map();
  const boxes = (Array.isArray(records.boxes) ? records.boxes : []) as Array<{ name?: string }>;
  const messages = (Array.isArray(records.messages) ? records.messages : []) as SequenceRecord[];
  const boxId = (i: number): string => `box_${i}`;
  const subgraphs: GraphNode[] = boxes.map((b, i) => ({ id: boxId(i), label: b.name || boxId(i), parent: null }));
  const nodes: GraphNode[] = [...actors].map(([id, a]) => {
    const i = a.box ? boxes.indexOf(a.box) : -1;
    return { id, label: a.description ?? id, parent: i >= 0 ? boxId(i) : null };
  });
  const id = edgeIds();
  const edges = messages.filter(isSequenceMessage).map((r) => {
    const [source, target] = [r.from as string, r.to as string];
    return { id: id(source, target), source, target };
  });
  return { diagram_type: type, nodes, edges, subgraphs: [...subgraphs, ...sequenceBlocks(messages, subgraphs.length)] };
};

// Each block in statement order, inside the block open around it. Ids number
// on from the boxes, so a block and a box never share one.
const sequenceBlocks = (records: SequenceRecord[], first: number): GraphNode[] => {
  const blocks: GraphNode[] = [];
  const open: string[] = [];
  for (const r of records) {
    if (r.type === undefined) continue;
    if (SEQUENCE_BLOCK_OPEN.has(r.type)) {
      const id = `block_${first + blocks.length}`;
      const label = typeof r.message === "string" && r.message ? r.message : id;
      blocks.push({ id, label, parent: open[open.length - 1] ?? null });
      open.push(id);
    } else if (SEQUENCE_BLOCK_CLOSE.has(r.type)) {
      open.pop();
    }
  }
  return blocks;
};

interface ErEntity {
  id?: string;
  alias?: string;
}
interface ErRelationship {
  entityA?: string;
  entityB?: string;
  roleA?: string;
  relSpec?: { cardA?: string; cardB?: string; relType?: string };
}

// The parser stores the marker beside entityA as cardB, and the one beside
// entityB as cardA, so `A ||--o{ B` gives cardB ONLY_ONE and cardA ZERO_OR_MORE.
const ER_NEAR_A: Record<string, string> = {
  ONLY_ONE: "||",
  ZERO_OR_ONE: "|o",
  ONE_OR_MORE: "}|",
  ZERO_OR_MORE: "}o",
  MD_PARENT: "u",
};
const ER_NEAR_B: Record<string, string> = {
  ONLY_ONE: "||",
  ZERO_OR_ONE: "o|",
  ONE_OR_MORE: "|{",
  ZERO_OR_MORE: "o{",
  MD_PARENT: "u",
};
const ER_LINE: Record<string, string> = { IDENTIFYING: "--", NON_IDENTIFYING: ".." };

const erConnector = (r: ErRelationship): { kind: string; cardinality: string } => {
  const { cardA = "", cardB = "", relType = "" } = r.relSpec ?? {};
  const [nearA, line, nearB] = [ER_NEAR_A[cardB], ER_LINE[relType], ER_NEAR_B[cardA]];
  if (!(nearA && line && nearB)) throw new Error(`no cardinality for the relationship ${cardB} ${relType} ${cardA}`);
  return { kind: line, cardinality: `${nearA}${line}${nearB}` };
};

// An entity is a node and a relationship an edge. The db keys entities by
// name, and a relationship names its two ends by the entity's own id.
const erGraph = (type: string, db: AnyDb): DiagramGraph => {
  const entities = db.entities instanceof Map ? (db.entities as Map<string, ErEntity>) : new Map();
  const rels = (Array.isArray(db.relationships) ? db.relationships : []) as ErRelationship[];
  const nameOf = new Map([...entities].map(([name, e]) => [e.id ?? name, name]));
  const id = edgeIds();
  return {
    diagram_type: type,
    nodes: [...entities].map(([name, e]) => ({ id: name, label: e.alias || name, parent: null })),
    edges: rels.map((r) => {
      const source = nameOf.get(r.entityA ?? "") ?? r.entityA ?? "";
      const target = nameOf.get(r.entityB ?? "") ?? r.entityB ?? "";
      return { id: id(source, target), source, target, ...erConnector(r), ...(r.roleA ? { label: r.roleA } : {}) };
    }),
    subgraphs: [],
  };
};

interface StateNode {
  id?: string;
  label?: string;
  shape?: string;
  isGroup?: boolean;
  parentId?: string;
}
interface StateEdge {
  start?: string;
  end?: string;
  label?: string;
}

const STATE_MARKERS = new Set(["stateStart", "stateEnd"]);

// The start and end markers, and each transition into or out of one. They are
// kept apart from what stats.ts counts, so a reader of the graph still sees
// where a path begins and ends. Notes, and their connectors, are dropped.
const stateMarkers = (db: AnyDb, counted: StateNode[]): { nodes: StateNode[]; edges: StateEdge[] } => {
  const nodes = ((db.nodes as StateNode[] | undefined) ?? []).filter((n) => STATE_MARKERS.has(n.shape ?? ""));
  const markers = new Set(nodes.map((n) => n.id ?? ""));
  const drawn = new Set([...markers, ...counted.map((n) => n.id ?? "")]);
  const edges = ((db.edges as StateEdge[] | undefined) ?? []).filter(
    (e) =>
      (markers.has(e.start ?? "") || markers.has(e.end ?? "")) && drawn.has(e.start ?? "") && drawn.has(e.end ?? ""),
  );
  return { nodes, edges };
};

// The states and transitions stats.ts counts, without start and end markers or
// notes. A composite state is both a node and the subgraph that holds its
// children, as the stats count it; the node is named apart from its box, since
// cytoscape cannot draw one element as both.
const stateGraph = (type: string, db: AnyDb): DiagramGraph => {
  const { nodes, edges } = countedStateElements<StateNode, StateEdge>(db);
  const markers = stateMarkers(db, nodes);
  const groupId = (id: string): string => `${id}__group`;
  const groups = new Set(nodes.filter((n) => n.isGroup).map((n) => n.id ?? ""));
  const parentOf = (n: StateNode): string | null => (n.parentId && groups.has(n.parentId) ? groupId(n.parentId) : null);
  const node = (n: StateNode): GraphNode => ({
    id: n.id ?? "",
    label: n.label ?? n.id ?? "",
    parent: n.isGroup ? groupId(n.id ?? "") : parentOf(n),
    ...(n.shape ? { shape: n.shape } : {}),
  });
  const id = edgeIds();
  const edge = (e: StateEdge): GraphEdge => {
    const [source, target] = [e.start ?? "", e.end ?? ""];
    return { id: id(source, target), source, target, ...(e.label ? { label: e.label } : {}) };
  };
  return {
    diagram_type: type,
    nodes: nodes.map(node),
    edges: edges.map(edge),
    subgraphs: nodes.filter((n) => n.isGroup).map((n) => ({ id: groupId(n.id ?? ""), label: "", parent: parentOf(n) })),
    pseudo: { nodes: markers.nodes.map(node), edges: markers.edges.map(edge) },
  };
};

interface ClassNode {
  label?: string;
  shape?: string;
  parent?: string;
}
interface ClassRelation {
  id1?: string;
  id2?: string;
  title?: string;
  relationTitle1?: string;
  relationTitle2?: string;
  relation?: { type1?: number | string; type2?: number | string; lineType?: number };
}

// A relation end, by mermaid's relationType number: aggregation, extension,
// composition, dependency, lollipop. An end with no marker is "none".
const CLASS_NEAR_1 = ["o", "<|", "*", "<", "()"];
const CLASS_NEAR_2 = ["o", "|>", "*", ">", "()"];

const classEnd = (markers: string[], type: number | string | undefined): string => {
  if (type === undefined || type === "none") return "";
  const marker = typeof type === "number" ? markers[type] : undefined;
  if (marker === undefined) throw new Error(`no marker for the class relation end ${type}`);
  return marker;
};

// A multiplicity is quoted beside its end, as the source writes it.
const classEdge = (r: ClassRelation, id: (source: string, target: string) => string): GraphEdge => {
  const [source, target] = [r.id1 ?? "", r.id2 ?? ""];
  const line = r.relation?.lineType === 1 ? ".." : "--";
  const kind = `${classEnd(CLASS_NEAR_1, r.relation?.type1)}${line}${classEnd(CLASS_NEAR_2, r.relation?.type2)}`;
  const quoted = (t: string | undefined): string[] => (t && t !== "none" ? [`"${t}"`] : []);
  const [near1, near2] = [quoted(r.relationTitle1), quoted(r.relationTitle2)];
  const cardinality = near1.length + near2.length > 0 ? [...near1, kind, ...near2].join(" ") : "";
  return {
    id: id(source, target),
    source,
    target,
    kind,
    ...(cardinality ? { cardinality } : {}),
    ...(r.title ? { label: r.title } : {}),
  };
};

// A class is a node, a namespace a subgraph, and a relation an edge. A
// lollipop interface is drawn, not counted, so it is a pseudo node that its
// relation names as one end.
const classGraph = (type: string, db: AnyDb): DiagramGraph => {
  const classes = db.classes instanceof Map ? (db.classes as Map<string, ClassNode>) : new Map();
  const namespaces = db.namespaces instanceof Map ? (db.namespaces as Map<string, ClassNode>) : new Map();
  const relations = (Array.isArray(db.relations) ? db.relations : []) as ClassRelation[];
  const interfaces = (Array.isArray(db.interfaces) ? db.interfaces : []) as Array<{ id?: string; label?: string }>;
  const id = edgeIds();
  return {
    diagram_type: type,
    nodes: [...classes].map(([key, c]) => ({
      id: key,
      label: c.label || key,
      parent: c.parent ?? null,
      ...(c.shape ? { shape: c.shape } : {}),
    })),
    edges: relations.map((r) => classEdge(r, id)),
    subgraphs: [...namespaces].map(([key, ns]) => ({ id: key, label: ns.label || key, parent: ns.parent ?? null })),
    pseudo: {
      nodes: interfaces.map((i) => ({ id: i.id ?? "", label: i.label ?? "", parent: null, shape: "lollipop" })),
      edges: [],
    },
  };
};

const READERS: Record<string, (type: string, db: AnyDb) => DiagramGraph> = {
  "flowchart-v2": flowchartGraph,
  flowchart: flowchartGraph,
  // A flowchart drawn with the ELK layout, parsed into the same db.
  "flowchart-elk": flowchartGraph,
  graph: flowchartGraph,
  classDiagram: classGraph,
  "classDiagram-v2": classGraph,
  class: classGraph,
  mindmap: mindmapGraph,
  sequence: sequenceGraph,
  er: erGraph,
  stateDiagram: stateGraph,
  "stateDiagram-v2": stateGraph,
};

export const extractGraph = async (content: string): Promise<DiagramGraph> => {
  const mermaid = await getMermaidCore();
  await mermaid.parse(content);
  const diagram = (await mermaid.mermaidAPI.getDiagramFromText(content)) as { db: AnyDb; type?: string };
  const type = diagram.type ?? "unknown";
  const read = READERS[type];
  if (!read) throw new Error(`extractGraph reads ${Object.keys(READERS).join(", ")}, not ${type}`);
  return read(type, diagram.db);
};
