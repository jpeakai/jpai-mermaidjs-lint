// The element-level structure of a diagram, read from mermaid's parser result:
// each node, each edge and each subgraph, with what contains what. The stats in
// stats.ts count the same result, and this keeps the elements themselves, so
// the docs site can draw what the parser returned beside the score it earns.
// Only the types the site draws are read, and any other type throws.

import { getMermaidCore } from "./stats.ts";

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

const READERS: Record<string, (type: string, db: AnyDb) => DiagramGraph> = {
  "flowchart-v2": flowchartGraph,
  flowchart: flowchartGraph,
  graph: flowchartGraph,
  mindmap: mindmapGraph,
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
