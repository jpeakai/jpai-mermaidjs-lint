// A partition of the working graph into groups, and what it draws: the
// overview's nodes and merged edges, its counts and score, and the detail
// diagram each group gets. The planner and the contract both read these, so a
// plan is scored by the same counts it is emitted from.

import type { GraphEdge, GraphNode } from "../parse/graph.ts";
import { calculateComplexity, type ThresholdConfig } from "../parse/metrics.ts";
import { byNatural, byText, byTuple, edgeKey, homeOf, regionWithin, sorted, type WorkGraph } from "./graph.ts";
import type { Tier } from "./types.ts";

export interface Group {
  members: string[];
  regions: string[];
  parent: string | null;
  tier: Tier;
  reason: string;
  // The decision a decision region starts at, which names the group.
  head?: string;
}

export interface Partition {
  groups: Group[];
  groupOf: Map<string, number>;
  regionOf: Map<string, number>;
}

// A group's key in the overview while planning. Ids never hold U+0000, so a
// key never meets a node id.
const GROUP_MARK = "\u0000";

export const keyOf = (g: Group): string => `${GROUP_MARK}${g.members[0] ?? ""}`;
export const isGroupKey = (key: string): boolean => key.startsWith(GROUP_MARK);

export const partitionOf = (groups: Group[]): Partition => {
  const ordered = [...groups].sort((a, b) => byTuple(a.members, b.members));
  const groupOf = new Map<string, number>();
  const regionOf = new Map<string, number>();
  for (let i = 0; i < ordered.length; i++) {
    for (const m of ordered[i]?.members ?? []) groupOf.set(m, i);
    for (const r of ordered[i]?.regions ?? []) regionOf.set(r, i);
  }
  return { groups: ordered, groupOf, regionOf };
};

export const EMPTY_PARTITION: Partition = partitionOf([]);

export const groupOfKey = (part: Partition, key: string): Group | undefined =>
  isGroupKey(key) ? part.groups[part.groupOf.get(key.slice(1)) ?? -1] : undefined;

// The overview node an original endpoint is drawn in: its group, or itself. A
// lollipop interface is never folded, so the overview draws it on the group
// of the class it hangs from, and the class's detail draws it too.
export const over = (_work: WorkGraph, part: Partition, id: string): string => {
  const g = part.groupOf.get(id) ?? part.regionOf.get(id);
  return g === undefined ? id : keyOf(part.groups[g] as Group);
};

export interface Merge {
  keys: string[];
  regions?: string[];
  parent: string | null;
  tier: Tier;
  reason: string;
  head?: string;
}

export const merge = (part: Partition, m: Merge): Partition => {
  const taken = new Set<number>();
  const members: string[] = [];
  const regions: string[] = [...(m.regions ?? [])];
  for (const key of m.keys) {
    const i = isGroupKey(key) ? part.groupOf.get(key.slice(1)) : undefined;
    const g = i === undefined ? undefined : part.groups[i];
    if (i === undefined || !g) {
      members.push(key);
      continue;
    }
    taken.add(i);
    members.push(...g.members);
    regions.push(...g.regions);
  }
  const group: Group = {
    members: sorted(new Set(members)),
    regions: sorted(new Set(regions)),
    parent: m.parent,
    tier: m.tier,
    reason: m.reason,
    ...(m.head !== undefined ? { head: m.head } : {}),
  };
  return partitionOf([...part.groups.filter((_, i) => !taken.has(i)), group]);
};

export const overviewKeys = (work: WorkGraph, part: Partition): string[] => [
  ...work.ids.filter((id) => !part.groupOf.has(id)),
  ...part.groups.map(keyOf),
];

export const parentOfKey = (work: WorkGraph, part: Partition, key: string): string | null => {
  const g = groupOfKey(part, key);
  if (g) return g.parent;
  return work.nodes.get(key)?.parent ?? work.regions.get(key)?.parent ?? null;
};

export const membersOfKey = (part: Partition, key: string): string[] => groupOfKey(part, key)?.members ?? [key];

export interface QEdge {
  source: string;
  target: string;
  label?: string;
  markdown?: true;
  kind?: string;
  cardinality?: string;
  covers: string[];
}

const agreed = (edges: GraphEdge[], pick: (e: GraphEdge) => string | undefined): string | undefined => {
  const first = edges[0] ? pick(edges[0]) : undefined;
  return first !== undefined && edges.every((e) => pick(e) === first) ? first : undefined;
};

// Merges what may merge: between two kept nodes nothing, since the overview is
// the only diagram that draws that edge and an edge written twice must read
// back twice; with a group at either end, every edge of the pair, keeping only
// the attributes all agree on. An erDiagram never merges two cardinalities or
// two labels.
const bucketKey = (work: WorkGraph, e: GraphEdge, a: string, b: string): string => {
  if (!(isGroupKey(a) || isGroupKey(b))) return `${GROUP_MARK}${e.id}`;
  if (work.family === "er") return [a, b, e.label ?? "", e.cardinality ?? ""].join(GROUP_MARK);
  return `${a}${GROUP_MARK}${b}`;
};

// The edge kinds with no direction: a flowchart link with no arrowhead, and a
// classDiagram link with no end marker.
export const UNDIRECTED_KINDS: ReadonlySet<string> = new Set(["---", "-.-", "===", "~~~", "--", ".."]);

// Whether an overview edge may stand for edges written the other way: it has
// a group at one end or both, an undirected kind and no cardinality.
export const reversible = (e: Pick<QEdge, "kind" | "cardinality">, grouped: boolean): boolean =>
  grouped && e.kind !== undefined && UNDIRECTED_KINDS.has(e.kind) && e.cardinality === undefined;

// One overview edge for an undirected edge written both ways between the
// same two overview nodes, at least one a group: the pair, kind and label all
// agree, so the edge the other way draws nothing new. Each detail still draws
// each original edge as written.
const mergeReversed = (edges: QEdge[]): QEdge[] => {
  const byKey = new Map(edges.map((e) => [edgeKey(e), e]));
  const dropped = new Set<QEdge>();
  for (const e of edges) {
    if (dropped.has(e) || !reversible(e, isGroupKey(e.source) || isGroupKey(e.target))) continue;
    const back = byKey.get(edgeKey({ ...e, source: e.target, target: e.source }));
    if (!back || back === e || dropped.has(back)) continue;
    dropped.add(back);
    e.covers = [...e.covers, ...back.covers];
  }
  return edges.filter((e) => !dropped.has(e));
};

export const quotientEdges = (work: WorkGraph, part: Partition): QEdge[] => {
  const buckets = new Map<string, { source: string; target: string; edges: GraphEdge[] }>();
  for (const e of work.edges) {
    const [a, b] = [over(work, part, e.source), over(work, part, e.target)];
    if (a === b && isGroupKey(a)) continue;
    const key = bucketKey(work, e, a, b);
    const bucket = buckets.get(key) ?? { source: a, target: b, edges: [] };
    bucket.edges.push(e);
    buckets.set(key, bucket);
  }
  const merged = [...buckets.values()]
    .map(({ source, target, edges }) => {
      const [label, kind, cardinality] = [
        agreed(edges, (e) => (e.label === undefined ? undefined : `${e.markdown ? "m" : "s"}${e.label}`)),
        agreed(edges, (e) => e.kind),
        agreed(edges, (e) => e.cardinality),
      ];
      return {
        source,
        target,
        ...(label !== undefined
          ? { label: label.slice(1), ...(label.startsWith("m") ? { markdown: true as const } : {}) }
          : {}),
        ...(kind !== undefined ? { kind } : {}),
        ...(cardinality !== undefined ? { cardinality } : {}),
        covers: edges.map((e) => e.id),
      };
    })
    .sort((x, y) => byText(edgeKey(x), edgeKey(y)));
  return mergeReversed(merged);
};

// The overview edges beside another between the same two overview nodes, at
// least one a group, that stand for edges between other ends than it does:
// parallel lines a fold drew, where the original draws one. Edges the
// original itself draws side by side between two nodes are not counted.
export const foldedParallels = (work: WorkGraph, qedges: readonly QEdge[]): number => {
  const ends = new Map(work.edges.map((e) => [e.id, [e.source, e.target].sort(byText).join("\u0000")]));
  const pairs = new Map<string, Set<string>[]>();
  for (const e of qedges) {
    if (!(isGroupKey(e.source) || isGroupKey(e.target))) continue;
    const pair = [e.source, e.target].sort(byText).join("\u0000");
    pairs.set(pair, [...(pairs.get(pair) ?? []), new Set(e.covers.map((id) => ends.get(id) ?? id))]);
  }
  let count = 0;
  for (const drawn of pairs.values()) {
    if (drawn.length > 1 && new Set(drawn.flatMap((d) => [...d])).size > 1) count += drawn.length - 1;
  }
  return count;
};

export interface Shape {
  nodes: number;
  edges: number;
  subgraphs: number;
  depth: number;
}

// How deep a set of regions nests, counting only regions in the set.
export const nestingDepth = (regions: readonly string[], parentOf: (r: string) => string | null): number => {
  const inSet = new Set(regions);
  let max = 0;
  for (const r of regions) {
    let depth = 0;
    const seen = new Set<string>();
    for (let cur: string | null = r; cur !== null && inSet.has(cur) && !seen.has(cur); cur = parentOf(cur)) {
      seen.add(cur);
      depth++;
    }
    max = Math.max(max, depth);
  }
  return max;
};

export const remainingRegions = (work: WorkGraph, part: Partition): string[] =>
  work.regionIds.filter((r) => !part.regionOf.has(r));

export const overviewShape = (work: WorkGraph, part: Partition, qedges: QEdge[]): Shape => {
  const remaining = remainingRegions(work, part);
  return {
    nodes: work.ids.length - part.groupOf.size + part.groups.length,
    edges: qedges.length,
    subgraphs: remaining.length,
    depth: nestingDepth(remaining, (r) => work.regions.get(r)?.parent ?? null),
  };
};

export const scoreOf = (shape: Shape, rows: number, config: ThresholdConfig): number =>
  calculateComplexity(
    {
      nodes: shape.nodes,
      edges: shape.edges,
      subgraphs: shape.subgraphs,
      max_subgraph_depth: shape.depth,
      max_tree_depth: 0,
      rows,
      node_ids: [],
      subgraph_names: [],
      parser_used: "mermaid-core",
      diagram_type: "",
      error: null,
    },
    config,
  ).visual_complexity_score;

export const meets = (nodes: number, score: number, config: ThresholdConfig): boolean =>
  nodes <= config.node_target && score <= config.vcs_target;

const flowCache = new WeakMap<WorkGraph, Map<string, number>>();

// How many edges from where the flow enters each node sits: a breadth-first
// walk along edge directions from every node no edge enters, or a start
// marker leaves, or failing both the first node as a reader counts.
export const flowOrder = (work: WorkGraph): Map<string, number> => {
  const known = flowCache.get(work);
  if (known) return known;
  const entered = new Set(work.edges.filter((e) => e.source !== e.target).map((e) => e.target));
  const started = work.markerEdges.filter((e) => work.nodes.has(e.target)).map((e) => e.target);
  const roots = [...new Set([...work.ids.filter((id) => !entered.has(id)), ...started])].sort(byNatural);
  const depth = new Map<string, number>((roots.length > 0 ? roots : work.ids.slice(0, 1)).map((id) => [id, 0]));
  for (let layer = [...depth.keys()]; layer.length > 0; ) {
    const next = new Set<string>();
    for (const e of work.edges)
      if (layer.includes(e.source) && !depth.has(e.target) && work.nodes.has(e.target)) next.add(e.target);
    for (const id of next) depth.set(id, (depth.get(layer[0] ?? "") ?? 0) + 1);
    layer = [...next];
  }
  flowCache.set(work, depth);
  return depth;
};

// The entries of a chain-like group in a flowchart or stateDiagram: its
// members, by the directed edges between them, form one path or several
// disjoint paths (twin chains), with at least one edge between members. The
// entries are the members no member leads into, where a reader enters each
// path. Null for any other group.
export const chainEntries = (work: WorkGraph, members: readonly string[]): string[] | null => {
  if (work.family !== "flowchart" && work.family !== "state") return null;
  const inside = new Set(members);
  const next = new Map<string, string>();
  const entered = new Set<string>();
  for (const e of work.edges) {
    if (e.source === e.target || !inside.has(e.source) || !inside.has(e.target)) continue;
    if (UNDIRECTED_KINDS.has(e.kind ?? "") || next.has(e.source) || entered.has(e.target)) return null;
    next.set(e.source, e.target);
    entered.add(e.target);
  }
  if (next.size === 0) return null;
  const entries = members.filter((m) => !entered.has(m));
  let walked = 0;
  for (const s of entries) for (let x: string | undefined = s; x !== undefined; x = next.get(x)) walked++;
  return walked === members.length ? entries : null;
};

// Each member by the edges crossing the group's boundary at it, either way, a
// start or end transition counted as one.
const crossingOf = (work: WorkGraph, members: readonly string[]): Map<string, number> => {
  const inside = new Set(members);
  const crossing = new Map<string, number>();
  const add = (id: string): void => {
    crossing.set(id, (crossing.get(id) ?? 0) + 1);
  };
  for (const e of work.edges) {
    if (inside.has(e.source) !== inside.has(e.target)) add(inside.has(e.source) ? e.source : e.target);
  }
  for (const e of work.markerEdges) for (const end of [e.source, e.target]) if (inside.has(end)) add(end);
  return crossing;
};

// The members a group may be named after, best first. A chain stage is named
// after the member the flow reaches first, where the stage starts, and so is
// any chain-like group (chainEntries): after its entry, or for twin chains
// after the entry the flow reaches first, then the first by label, never a
// later stage. A suggested group (T5 or T6) is named after the member on its
// main path: the one with the most edges crossing the group's boundary, then
// the one the flow reaches first. Any other group is named after its
// best-connected member, the one of highest degree. Ties go to the smallest
// id as a reader counts.
export const rankedMembers = (work: WorkGraph, g: Pick<Group, "members" | "tier"> & { reason?: string }): string[] => {
  const flow = flowOrder(work);
  const at = (id: string): number => flow.get(id) ?? Number.POSITIVE_INFINITY;
  const labelOf = (id: string): string => work.nodes.get(id)?.label ?? id;
  if (g.reason === "chain stage") return [...g.members].sort((a, b) => at(a) - at(b) || byNatural(a, b));
  const entries = new Set(chainEntries(work, g.members) ?? []);
  if (entries.size > 0) {
    const entry = (id: string): number => (entries.has(id) ? 0 : 1);
    return [...g.members].sort(
      (a, b) => entry(a) - entry(b) || at(a) - at(b) || byNatural(labelOf(a), labelOf(b)) || byNatural(a, b),
    );
  }
  if (g.tier !== "T5" && g.tier !== "T6")
    return [...g.members].sort((a, b) => (work.degree.get(b) ?? 0) - (work.degree.get(a) ?? 0) || byNatural(a, b));
  const crossing = crossingOf(work, g.members);
  return [...g.members].sort(
    (a, b) => (crossing.get(b) ?? 0) - (crossing.get(a) ?? 0) || at(a) - at(b) || byNatural(a, b),
  );
};

// Whether an aggregate's root is a lookup: every edge it has joins one other
// member, as a LANGUAGE table hangs from FILM. Its name says little of the
// aggregate, whose edges all leave from the other members.
const isLookup = (work: WorkGraph, root: string, members: readonly string[]): boolean => {
  const others = new Set(
    work.edges
      .filter((e) => e.source !== e.target && (e.source === root || e.target === root))
      .map((e) => (e.source === root ? e.target : e.source)),
  );
  const [only] = [...others];
  return others.size === 1 && only !== undefined && members.includes(only);
};

// An aggregate's members by the edges crossing its boundary, then degree.
const byCrossing = (work: WorkGraph, members: readonly string[]): string[] => {
  const crossing = crossingOf(work, members);
  const degree = (id: string): number => work.degree.get(id) ?? 0;
  return [...members].sort(
    (a, b) => (crossing.get(b) ?? 0) - (crossing.get(a) ?? 0) || degree(b) - degree(a) || byNatural(a, b),
  );
};

export const regionRoots = (work: WorkGraph, regions: readonly string[]): string[] => {
  const inSet = new Set(regions);
  return regions.filter((r) => !inSet.has(work.regions.get(r)?.parent ?? ""));
};

export interface LabelParts {
  base: string;
  n: number;
  markdown?: true;
  // A region's label followed by the label of the region around it, in
  // brackets, which names it apart from a region of the same label elsewhere.
  qualified?: true;
}

// A region's label qualified by the label of the region around it, as
// "Public subnets (us-east-1)": null when either is empty or markdown, or the
// region sits at the top level.
export const qualifiedLabel = (work: WorkGraph, region: string): string | null => {
  const r = work.regions.get(region);
  const p = r?.parent ? work.regions.get(r.parent) : undefined;
  if (!(r && p) || r.owner || p.owner || r.markdown || p.markdown || r.label === "" || p.label === "") return null;
  return `${r.label} (${p.label})`;
};

const markdownOf = (x: { markdown?: true } | undefined): { markdown?: true } => (x?.markdown ? { markdown: true } : {});

// The labels a group may carry, best first. A group folded from one author
// region carries that region's label; otherwise the label of a member: the
// group's head (a decision region's decision, an aggregate's root) first, then
// the named one. An aggregate whose root is a lookup is named after the
// member with the most edges crossing its boundary instead. A range of the
// members' labels, when given, comes after the region and the head, and the
// members may be taken in natural order of their labels instead. N counts the
// members the label does not already name.
// The labels a group folding one author region whole may take from it: the
// region's label, then that label qualified by the region around it.
const regionChoices = (work: WorkGraph, g: Group): LabelParts[] => {
  const roots = regionRoots(work, g.regions);
  const root = roots.length === 1 ? roots[0] : undefined;
  const region = root === undefined ? undefined : work.regions.get(root);
  if (!(root !== undefined && region && g.members.every((m) => regionWithin(work, homeOf(work, m), root)))) return [];
  const qualified = qualifiedLabel(work, root);
  return [
    { base: region.label, n: g.members.length - (region.owner ? 1 : 0), ...markdownOf(region) },
    ...(qualified === null ? [] : [{ base: qualified, n: g.members.length, qualified: true as const }]),
  ];
};

export const labelChoices = (
  work: WorkGraph,
  g: Group,
  naming: { range: string | null; byLabel: boolean } = { range: null, byLabel: false },
): LabelParts[] => {
  const { range } = naming;
  const fromRegion = regionChoices(work, g);
  const labelOf = (m: string): string => work.nodes.get(m)?.label ?? m;
  const lookup = g.tier === "T4" && g.head !== undefined && isLookup(work, g.head, g.members);
  const ranked = naming.byLabel
    ? [...g.members].sort((a, b) => byNatural(labelOf(a), labelOf(b)) || byNatural(a, b))
    : lookup
      ? byCrossing(work, g.members)
      : rankedMembers(work, g);
  const head = g.head !== undefined && !lookup && ranked.includes(g.head) ? [g.head] : [];
  const label = (m: string): LabelParts => {
    const node = work.nodes.get(m);
    return { base: node?.label ?? m, n: g.members.length - 1, ...markdownOf(node) };
  };
  const fromRange = range === null ? [] : [{ base: range, n: g.members.length - 2 }];
  return [...fromRegion, ...head.map(label), ...fromRange, ...ranked.filter((m) => !head.includes(m)).map(label)];
};

// A stub stands for one outside overview node: a kept node, a region or an
// interface by its own id, or a whole other group by its group key. A stub for
// a node inside another group stands for that node, so the edge is exact.
export interface Stub {
  id: string;
  endpoint: string;
}

export interface DetailView {
  members: string[];
  regions: string[];
  stubs: Stub[];
  edges: GraphEdge[];
  markers: GraphNode[];
  markerEdges: GraphEdge[];
}

// Ids generated as prefix1, prefix2 and on, skipping any already in use.
export const idMaker = (used: Set<string>, prefix: string): (() => string) => {
  let i = 0;
  return () => {
    let id: string;
    do id = `${prefix}${++i}`;
    while (used.has(id));
    used.add(id);
    return id;
  };
};

export const usedIds = (work: WorkGraph): Set<string> =>
  new Set([...work.ids, ...work.regionIds, ...work.lollipops.keys(), ...work.markers.map((m) => m.id)]);

export const endpointLabel = (work: WorkGraph, id: string): string =>
  work.nodes.get(id)?.label ?? work.regions.get(id)?.label ?? work.lollipops.get(id)?.label ?? id;

const ROOT_MARKER: Record<string, string> = { stateStart: "root_start", stateEnd: "root_end" };

// A marker transition as a detail draws it: an inside marker as it is, an
// outside one moved to the detail's own root marker. Null when the other end
// is not a member.
const markerEdgeIn = (
  e: GraphEdge,
  members: ReadonlySet<string>,
  markers: { inner: Map<string, GraphNode>; all: Map<string, GraphNode> },
): { edge: GraphEdge; marker: GraphNode } | null => {
  const marker = markers.all.get(e.source) ?? markers.all.get(e.target);
  if (!(marker && members.has(marker.id === e.source ? e.target : e.source))) return null;
  if (markers.inner.has(marker.id)) return { edge: e, marker };
  // A composite's marker pins the states it touches, so a group holding one
  // folds the composite whole and the marker is inner; this one stays out.
  if (marker.parent !== null) return null;
  const id = ROOT_MARKER[marker.shape ?? ""] ?? marker.id;
  const moved = { id, label: id, parent: null, ...(marker.shape ? { shape: marker.shape } : {}) };
  const swap = (x: string): string => (x === marker.id ? id : x);
  return { edge: { ...e, source: swap(e.source), target: swap(e.target) }, marker: moved };
};

// The start and end markers a detail draws: those inside its regions, and an
// outside marker's transition to a member, drawn from the detail's own root.
const detailMarkers = (work: WorkGraph, g: Group): { markers: GraphNode[]; markerEdges: GraphEdge[] } => {
  const regions = new Set(g.regions);
  const inner = new Map(work.markers.filter((m) => m.parent !== null && regions.has(m.parent)).map((m) => [m.id, m]));
  const all = new Map(work.markers.map((m) => [m.id, m]));
  const members = new Set(g.members);
  const used = new Map<string, GraphNode>(inner);
  const edges = new Map<string, GraphEdge>();
  for (const e of work.markerEdges) {
    const drawn = markerEdgeIn(e, members, { inner, all });
    if (!drawn) continue;
    used.set(drawn.marker.id, drawn.marker);
    if (!edges.has(edgeKey(drawn.edge))) edges.set(edgeKey(drawn.edge), drawn.edge);
  }
  return { markers: [...used.values()].sort((a, b) => byText(a.id, b.id)), markerEdges: [...edges.values()] };
};

// What a detail's outside end stands for. An edge into the group from inside
// another group stands for that whole group: the source's own detail draws it
// to this exact node, so it reads back exactly once. A lollipop interface is
// drawn as itself, hanging from its member. Every other outside end stands
// for itself.
const outsideEnd = (work: WorkGraph, part: Partition, e: GraphEdge, inside: (id: string) => boolean): string | null => {
  if (work.lollipops.has(e.source) || work.lollipops.has(e.target)) return null;
  if (inside(e.target) && !inside(e.source)) {
    const from = over(work, part, e.source);
    return isGroupKey(from) ? from : e.source;
  }
  return inside(e.source) && !inside(e.target) ? e.target : null;
};

// Which half edges draw as one: those the same way between one group and one
// member, of one kind (a kind left out would read back as another), and in an
// erDiagram of one label and cardinality.
const halfKey = (work: WorkGraph, e: GraphEdge, [s, t]: [string, string]): string =>
  JSON.stringify([s, t, e.kind ?? "", ...(work.family === "er" ? [e.label ?? "", e.cardinality ?? ""] : [])]);

// A half edge, between a stub for a whole group and a member, drawn once for
// every edge halfKey puts with it, as the overview draws one edge between two
// overview nodes: keeping only the label and cardinality all agree on. Each
// of them is drawn exactly in the other group's detail.
const halfOf = (halves: Map<string, GraphEdge[]>, e: GraphEdge): GraphEdge => {
  const bucket = [...halves.values()].find((b) => b[0] === e);
  if (!bucket) return e;
  const { label: _l, markdown: _m, kind: _k, cardinality: _c, ...bare } = e;
  const label = agreed(bucket, (x) => (x.label === undefined ? undefined : `${x.markdown ? "m" : "s"}${x.label}`));
  const kind = agreed(bucket, (x) => x.kind);
  const cardinality = agreed(bucket, (x) => x.cardinality);
  return {
    ...bare,
    ...(label !== undefined
      ? { label: label.slice(1), ...(label.startsWith("m") ? { markdown: true as const } : {}) }
      : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(cardinality !== undefined ? { cardinality } : {}),
  };
};

// The group whose detail draws exactly every edge between two groups that
// edges join both ways: the one whose detail is split again when the other's
// is not, since a stub in a nested overview standing for a whole group hides
// which member a reader is sent to two levels away (MJL-0035); then the one
// needing stubs for fewer of the other's members, then the first by key. The
// other group's detail draws one stub for the whole group, with every edge
// each way drawn once for those alike, so no detail draws a group whole beside
// stubs for its members.
export const exactSide = (
  work: WorkGraph,
  part: Partition,
  [a, b]: [string, string],
  nested: ReadonlySet<string> = new Set(),
): string => {
  if (nested.has(a) !== nested.has(b)) return nested.has(a) ? a : b;
  const between = work.edges.filter((e) => {
    const ends = [over(work, part, e.source), over(work, part, e.target)];
    return ends.includes(a) && ends.includes(b) && a !== b;
  });
  const needs = (side: string): number =>
    new Set(between.flatMap((e) => [e.source, e.target]).filter((x) => over(work, part, x) !== side)).size;
  const [na, nb] = [needs(a), needs(b)];
  return na !== nb ? (na < nb ? a : b) : byText(a, b) <= 0 ? a : b;
};

// The outside groups edges join to a group both ways.
const bothWays = (work: WorkGraph, part: Partition, key: string, touching: GraphEdge[]): Set<string> => {
  const [into, from] = [new Set<string>(), new Set<string>()];
  for (const e of touching) {
    const [s, t] = [over(work, part, e.source), over(work, part, e.target)];
    if (s === key && t !== key && isGroupKey(t)) into.add(t);
    if (t === key && s !== key && isGroupKey(s)) from.add(s);
  }
  return new Set([...into].filter((x) => from.has(x)));
};

// One stub per outside end, and each edge from a whole group drawn alike
// another drawn once. A group that edges join to this one both ways is drawn
// whole, or as stubs for its members, never both, as exactSide decides from
// the groups whose details are split again.
export const detailView = (
  work: WorkGraph,
  part: Partition,
  g: Group,
  nested: ReadonlySet<string> = new Set(),
): DetailView => {
  const key = keyOf(g);
  const inside = (id: string): boolean => over(work, part, id) === key;
  const touching = work.edges.filter((e) => inside(e.source) || inside(e.target));
  const pairs = bothWays(work, part, key, touching);
  const whole = new Set([...pairs].filter((h) => exactSide(work, part, [key, h], nested) !== key));
  const endOf = (e: GraphEdge): string | null => {
    const end = outsideEnd(work, part, e, inside);
    if (end === null) return null;
    const far = inside(e.source) ? e.target : e.source;
    const group = over(work, part, far);
    if (!pairs.has(group)) return end;
    return whole.has(group) ? group : far;
  };
  const ends = new Map(touching.map((e) => [e.id, endOf(e)]));
  const outside = sorted(new Set([...ends.values()].filter((x): x is string => x !== null)));
  const next = idMaker(usedIds(work), "s");
  const stubs = outside.map((endpoint) => ({ id: next(), endpoint }));
  const stubOf = new Map(outside.map((endpoint, i) => [endpoint, stubs[i]?.id ?? endpoint]));
  const halves = new Map<string, GraphEdge[]>();
  const edges = touching.flatMap((e) => {
    const end = ends.get(e.id);
    if (end === null || end === undefined) return [e];
    const stub = stubOf.get(end) ?? end;
    const drawn = inside(e.source) ? { ...e, target: stub } : { ...e, source: stub };
    if (!isGroupKey(end)) return [drawn];
    const bucket = halfKey(work, e, inside(e.source) ? [e.source, end] : [end, e.target]);
    const known = halves.get(bucket);
    halves.set(bucket, [...(known ?? []), drawn]);
    return known ? [] : [drawn];
  });
  return {
    members: g.members,
    regions: drawnRegions(work, g),
    stubs,
    edges: edges.map((e) => halfOf(halves, e)),
    ...detailMarkers(work, g),
  };
};

// The regions a detail draws: the ones its group folds, and in a classDiagram
// every namespace around them too, since mermaid makes each namespace a
// dotted name names.
const drawnRegions = (work: WorkGraph, g: Group): string[] => {
  if (work.family !== "class") return g.regions;
  const out = new Set(g.regions);
  for (const r of g.regions) {
    for (
      let p = work.regions.get(r)?.parent ?? null;
      p !== null && !out.has(p);
      p = work.regions.get(p)?.parent ?? null
    ) {
      out.add(p);
    }
  }
  return sorted(out);
};

export const detailShape = (work: WorkGraph, view: DetailView): Shape => {
  const drawn = new Set(view.regions);
  return {
    nodes: view.members.length + view.stubs.length,
    edges: view.edges.length,
    subgraphs: view.regions.length,
    depth: nestingDepth(view.regions, (r) => {
      const p = work.regions.get(r)?.parent ?? null;
      return p !== null && drawn.has(p) ? p : null;
    }),
  };
};

// How many original edges the overview draws on an edge written the other way.
export const reversedEdges = (work: WorkGraph, part: Partition): number => {
  const sourceOf = new Map(work.edges.map((e) => [e.id, e.source]));
  return quotientEdges(work, part).reduce(
    (n, q) => n + q.covers.filter((id) => over(work, part, sourceOf.get(id) ?? "") !== q.source).length,
    0,
  );
};
