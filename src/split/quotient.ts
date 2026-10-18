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
  return [...buckets.values()]
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

// The members a group may be named after, best first: highest degree, then
// smallest id as a reader counts.
export const rankedMembers = (work: WorkGraph, members: readonly string[]): string[] =>
  [...members].sort((a, b) => (work.degree.get(b) ?? 0) - (work.degree.get(a) ?? 0) || byNatural(a, b));

export const regionRoots = (work: WorkGraph, regions: readonly string[]): string[] => {
  const inSet = new Set(regions);
  return regions.filter((r) => !inSet.has(work.regions.get(r)?.parent ?? ""));
};

export interface LabelParts {
  base: string;
  n: number;
  markdown?: true;
}

const markdownOf = (x: { markdown?: true } | undefined): { markdown?: true } => (x?.markdown ? { markdown: true } : {});

// The labels a group may carry, best first. A group folded from one author
// region carries that region's label; otherwise the label of a member, the
// named one first. N counts the members the label does not already name.
export const labelChoices = (work: WorkGraph, g: Group): LabelParts[] => {
  const roots = regionRoots(work, g.regions);
  const root = roots.length === 1 ? roots[0] : undefined;
  const region = root === undefined ? undefined : work.regions.get(root);
  const whole = root !== undefined && region && g.members.every((m) => regionWithin(work, homeOf(work, m), root));
  const fromRegion: LabelParts[] =
    whole && region
      ? [{ base: region.label, n: g.members.length - (region.owner ? 1 : 0), ...markdownOf(region) }]
      : [];
  const fromMembers = rankedMembers(work, g.members).map((m) => {
    const node = work.nodes.get(m);
    return { base: node?.label ?? m, n: g.members.length - 1, ...markdownOf(node) };
  });
  return [...fromRegion, ...fromMembers];
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

export const detailView = (work: WorkGraph, part: Partition, g: Group): DetailView => {
  const key = keyOf(g);
  const inside = (id: string): boolean => over(work, part, id) === key;
  const touching = work.edges.filter((e) => inside(e.source) || inside(e.target));
  const ends = new Map(touching.map((e) => [e.id, outsideEnd(work, part, e, inside)]));
  const outside = sorted(new Set([...ends.values()].filter((x): x is string => x !== null)));
  const next = idMaker(usedIds(work), "s");
  const stubs = outside.map((endpoint) => ({ id: next(), endpoint }));
  const stubOf = new Map(stubs.map((s) => [s.endpoint, s.id]));
  const edges = touching.map((e) => {
    const end = ends.get(e.id);
    const stub = end === null || end === undefined ? undefined : stubOf.get(end);
    if (stub === undefined) return e;
    return inside(e.source) ? { ...e, target: stub } : { ...e, source: stub };
  });
  return { members: g.members, regions: drawnRegions(work, g), stubs, edges, ...detailMarkers(work, g) };
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
