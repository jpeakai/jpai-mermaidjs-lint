// The element-level structure of a diagram, read from mermaid's parser result:
// each node, each edge and each subgraph, with what contains what. The stats in
// stats.ts count the same result, and this keeps the elements themselves, so
// the docs site can draw what the parser returned beside the score it earns.
// Only the types the site draws are read, and any other type throws.

import {
  countedStateElements,
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
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface DiagramGraph {
  diagram_type: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  // A subgraph holds nodes, or other subgraphs through their parent.
  subgraphs: GraphNode[];
}

type AnyDb = Record<string, unknown>;

interface FlowVertex {
  id: string;
  text?: string;
}
interface FlowEdge {
  start: string;
  end: string;
}
interface FlowSubgraph {
  id: string;
  title?: string;
  nodes?: string[];
}

// Mermaid lists each member once, under its innermost subgraph, and a nested
// subgraph is listed by id as a member of the one around it.
const flowchartGraph = (type: string, db: AnyDb): DiagramGraph => {
  const vertices = db.vertices instanceof Map ? ([...db.vertices.values()] as FlowVertex[]) : [];
  const edges = (Array.isArray(db.edges) ? db.edges : []) as FlowEdge[];
  const subGraphs = (Array.isArray(db.subGraphs) ? db.subGraphs : []) as FlowSubgraph[];
  const parentOf = new Map<string, string>();
  for (const sg of subGraphs) for (const member of sg.nodes ?? []) parentOf.set(member, sg.id);
  return {
    diagram_type: type,
    nodes: vertices.map((v) => ({ id: v.id, label: v.text ?? v.id, parent: parentOf.get(v.id) ?? null })),
    edges: edges.map((e) => ({ source: e.start, target: e.end })),
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
  const walk = (node: MindmapNode, parent: string | null): void => {
    const id = `n${node.id}`;
    nodes.push({ id, label: node.descr ?? id, parent: null });
    if (parent) edges.push({ source: parent, target: id });
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
  const edges = messages.filter(isSequenceMessage).map((r) => ({ source: r.from as string, target: r.to as string }));
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
}

// An entity is a node and a relationship an edge. The db keys entities by
// name, and a relationship names its two ends by the entity's own id.
const erGraph = (type: string, db: AnyDb): DiagramGraph => {
  const entities = db.entities instanceof Map ? (db.entities as Map<string, ErEntity>) : new Map();
  const rels = (Array.isArray(db.relationships) ? db.relationships : []) as ErRelationship[];
  const nameOf = new Map([...entities].map(([name, e]) => [e.id ?? name, name]));
  return {
    diagram_type: type,
    nodes: [...entities].map(([name, e]) => ({ id: name, label: e.alias || name, parent: null })),
    edges: rels.map((r) => ({
      source: nameOf.get(r.entityA ?? "") ?? r.entityA ?? "",
      target: nameOf.get(r.entityB ?? "") ?? r.entityB ?? "",
    })),
    subgraphs: [],
  };
};

interface StateNode {
  id?: string;
  label?: string;
  isGroup?: boolean;
  parentId?: string;
}
interface StateEdge {
  start?: string;
  end?: string;
}

// The states and transitions stats.ts counts, without start and end markers or
// notes. A composite state is both a node and the subgraph that holds its
// children, as the stats count it; the node is named apart from its box, since
// cytoscape cannot draw one element as both.
const stateGraph = (type: string, db: AnyDb): DiagramGraph => {
  const { nodes, edges } = countedStateElements<StateNode, StateEdge>(db);
  const groupId = (id: string): string => `${id}__group`;
  const groups = new Set(nodes.filter((n) => n.isGroup).map((n) => n.id ?? ""));
  const parentOf = (n: StateNode): string | null => (n.parentId && groups.has(n.parentId) ? groupId(n.parentId) : null);
  return {
    diagram_type: type,
    nodes: nodes.map((n) => ({
      id: n.id ?? "",
      label: n.label ?? n.id ?? "",
      parent: n.isGroup ? groupId(n.id ?? "") : parentOf(n),
    })),
    edges: edges.map((e) => ({ source: e.start ?? "", target: e.end ?? "" })),
    subgraphs: nodes.filter((n) => n.isGroup).map((n) => ({ id: groupId(n.id ?? ""), label: "", parent: parentOf(n) })),
  };
};

const READERS: Record<string, (type: string, db: AnyDb) => DiagramGraph> = {
  "flowchart-v2": flowchartGraph,
  flowchart: flowchartGraph,
  graph: flowchartGraph,
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
