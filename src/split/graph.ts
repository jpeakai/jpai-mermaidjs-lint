// An indexed working graph over the parser's DiagramGraph: nodes and regions
// by id, edges in a canonical order with canonical ids, degree, and what may
// never fold. Everything is sorted, so the statement order of the source never
// reaches a decision.

import type { DiagramGraph, GraphEdge, GraphNode } from "../parse/graph.ts";

export type Family = "flowchart" | "state" | "er" | "class";

const FAMILY: Record<string, Family> = {
  "flowchart-v2": "flowchart",
  flowchart: "flowchart",
  "flowchart-elk": "flowchart",
  graph: "flowchart",
  stateDiagram: "state",
  "stateDiagram-v2": "state",
  er: "er",
  classDiagram: "class",
  "classDiagram-v2": "class",
  class: "class",
};

export const familyOf = (type: string): Family | null => FAMILY[type] ?? null;

export interface WNode {
  id: string;
  label: string;
  // The region the node sits in. A composite state sits in the region around
  // its own box, which it owns.
  parent: string | null;
  shape?: string;
  owns?: string;
  markdown?: true;
  // An erDiagram entity's attributes or a class's members, as the source writes them.
  rows?: string[];
  // A state's description lines under its name.
  descriptions?: string[];
}

// A flowchart subgraph, a composite state's box or a class namespace.
export interface WRegion {
  id: string;
  label: string;
  parent: string | null;
  // The composite state drawn as this box, for a stateDiagram.
  owner?: string;
  markdown?: true;
}

export interface WorkGraph {
  type: string;
  family: Family;
  // The direction mermaid's parser read, which every emitted diagram keeps.
  direction: string;
  nodes: Map<string, WNode>;
  ids: string[];
  edges: GraphEdge[];
  regions: Map<string, WRegion>;
  regionIds: string[];
  // A stateDiagram's start and end markers, and their transitions.
  markers: GraphNode[];
  markerEdges: GraphEdge[];
  // A classDiagram's lollipop interfaces, each with the class it hangs from.
  lollipops: Map<string, { label: string; owner: string }>;
  rows: number;
  degree: Map<string, number>;
  protectedIds: Set<string>;
  // The region a protected node may fold only with: a node's own home, or for
  // a state a start or end marker of a composite touches, that composite's box,
  // so the transition is drawn inside the box it belongs to.
  pins: Map<string, string | null>;
  // The stubs of a detail diagram that is split again: never folded.
  stubs: Set<string>;
}

export const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const sorted = (xs: Iterable<string>): string[] => [...xs].sort(byText);

// Natural order, as a reader counts: n2 before n10. The collator compares
// digit runs by value; ties fall back to code unit order, so the order is total.
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "variant" });
export const byNatural = (a: string, b: string): number => collator.compare(a, b) || byText(a, b);

export const byNaturalTuple = (a: readonly string[], b: readonly string[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = byNatural(a[i] ?? "", b[i] ?? "");
    if (c !== 0) return c;
  }
  return a.length - b.length;
};

// Compares two sorted id tuples element by element, then by length.
export const byTuple = (a: readonly string[], b: readonly string[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = byText(a[i] ?? "", b[i] ?? "");
    if (c !== 0) return c;
  }
  return a.length - b.length;
};

export const edgeKey = (
  e: Pick<GraphEdge, "source" | "target" | "label" | "kind" | "cardinality" | "markdown">,
): string =>
  [e.source, e.target, e.label ?? "", e.kind ?? "", e.cardinality ?? "", e.markdown ? "md" : ""].join("\u0000");

// Decision nodes and state pseudo-states keep their own node in an overview,
// unless the whole region around them folds. These are the shape names the
// parsers give: a flowchart rhombus, and stateDiagram's choice, fork and join
// (mermaid's stateDiagram has no history state).
const PROTECTED_SHAPES = new Set(["diamond", "choice", "fork", "join"]);

export const isProtectedShape = (shape: string | undefined): boolean => PROTECTED_SHAPES.has(shape ?? "");

// Each edge sorted by its ends and attributes, then named e0, e1 and on, so an
// edge's name never depends on where its statement stood.
const canonicalEdges = (edges: GraphEdge[]): GraphEdge[] =>
  edges
    .map((e) => ({ e, k: edgeKey(e) }))
    .sort((a, b) => byText(a.k, b.k))
    .map(({ e }, i) => {
      const { id: _id, ...rest } = e;
      return { id: `e${i}`, ...rest };
    });

const stateOwners = (graph: DiagramGraph): Map<string, string> => {
  const boxes = new Set(graph.subgraphs.map((s) => s.id));
  const owners = new Map<string, string>();
  if (graph.diagram_type !== "stateDiagram" && graph.diagram_type !== "stateDiagram-v2") return owners;
  for (const n of graph.nodes) if (n.parent === `${n.id}__group` && boxes.has(n.parent)) owners.set(n.parent, n.id);
  return owners;
};

const regionsOf = (graph: DiagramGraph, owners: Map<string, string>): Map<string, WRegion> => {
  const labelOf = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const regions = new Map<string, WRegion>();
  for (const s of graph.subgraphs) {
    const owner = owners.get(s.id);
    const label = owner ? (labelOf.get(owner) ?? owner) : s.label;
    regions.set(s.id, {
      id: s.id,
      label,
      parent: s.parent,
      ...(owner ? { owner } : {}),
      ...(s.markdown ? { markdown: true as const } : {}),
    });
  }
  return regions;
};

// What a node carries beyond its id, label and place.
const extrasOf = (n: GraphNode): Pick<WNode, "shape" | "markdown" | "rows" | "descriptions"> => ({
  ...(n.shape ? { shape: n.shape } : {}),
  ...(n.markdown ? { markdown: true as const } : {}),
  ...(n.rows?.length ? { rows: n.rows } : {}),
  ...(n.descriptions?.length ? { descriptions: n.descriptions } : {}),
});

const nodesOf = (graph: DiagramGraph, regions: Map<string, WRegion>): Map<string, WNode> => {
  const nodes = new Map<string, WNode>();
  for (const n of graph.nodes) {
    const owned = n.parent !== null && regions.get(n.parent)?.owner === n.id ? n.parent : undefined;
    const parent = owned ? (regions.get(owned)?.parent ?? null) : n.parent;
    nodes.set(n.id, { id: n.id, label: n.label, parent, ...(owned ? { owns: owned } : {}), ...extrasOf(n) });
  }
  return nodes;
};

const lollipopsOf = (graph: DiagramGraph, edges: GraphEdge[]): Map<string, { label: string; owner: string }> => {
  const out = new Map<string, { label: string; owner: string }>();
  for (const p of graph.pseudo?.nodes ?? []) {
    if (p.shape !== "lollipop") continue;
    const ends = edges.flatMap((e) => (e.target === p.id ? [e.source] : e.source === p.id ? [e.target] : []));
    const owner = sorted(ends)[0];
    if (owner !== undefined) out.set(p.id, { label: p.label, owner });
  }
  return out;
};

const degreesOf = (edges: GraphEdge[]): Map<string, number> => {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  return degree;
};

export interface WorkOptions {
  direction: string;
  rows: number;
  stubs?: Iterable<string>;
}

export const buildWorkGraph = (graph: DiagramGraph, options: WorkOptions): WorkGraph => {
  const family = familyOf(graph.diagram_type);
  if (!family) throw new Error(`no split for the diagram type ${graph.diagram_type}`);
  const regions = regionsOf(graph, stateOwners(graph));
  const nodes = nodesOf(graph, regions);
  const edges = canonicalEdges(graph.edges);
  const stubs = new Set(options.stubs ?? []);
  const markers = (graph.pseudo?.nodes ?? []).filter((n) => n.shape === "stateStart" || n.shape === "stateEnd");
  const pins = pinsOf(nodes, markers, graph.pseudo?.edges ?? []);
  for (const n of nodes.values()) {
    if (isProtectedShape(n.shape) || n.owns || stubs.has(n.id)) pins.set(n.id, pins.get(n.id) ?? n.owns ?? n.parent);
  }
  const protectedIds = new Set(pins.keys());
  return {
    type: graph.diagram_type,
    family,
    direction: options.direction,
    nodes,
    ids: sorted(nodes.keys()),
    edges,
    regions,
    regionIds: sorted(regions.keys()),
    markers: [...markers].sort((a, b) => byText(a.id, b.id)),
    markerEdges: canonicalEdges(graph.pseudo?.edges ?? []),
    lollipops: lollipopsOf(graph, edges),
    rows: options.rows,
    degree: degreesOf(edges),
    protectedIds,
    pins,
    stubs,
  };
};

// Each state a start or end marker inside a composite touches, pinned to that
// composite's box. A marker at the top level pins nothing: a detail draws it
// at its own top level, where it was.
const pinsOf = (nodes: Map<string, WNode>, markers: GraphNode[], edges: GraphEdge[]): Map<string, string | null> => {
  const boxOf = new Map(markers.filter((m) => m.parent !== null).map((m) => [m.id, m.parent]));
  const pins = new Map<string, string | null>();
  for (const e of edges) {
    const box = boxOf.get(e.source) ?? boxOf.get(e.target);
    const state = boxOf.has(e.source) ? e.target : e.source;
    if (box !== undefined && nodes.has(state)) pins.set(state, box);
  }
  return pins;
};

// Where a node lives for folding: a composite state lives in its own box.
export const homeOf = (work: WorkGraph, id: string): string | null => {
  const n = work.nodes.get(id);
  return n ? (n.owns ?? n.parent) : null;
};

// Whether a region sits at or inside another.
export const regionWithin = (work: WorkGraph, region: string | null, outer: string): boolean => {
  const seen = new Set<string>();
  for (let r = region; r !== null && !seen.has(r); r = work.regions.get(r)?.parent ?? null) {
    if (r === outer) return true;
    seen.add(r);
  }
  return false;
};
