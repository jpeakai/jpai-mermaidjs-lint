// An independent reading of a plan, from what its emitted sources parse back
// to: every original node, region, edge and start or end transition must come
// back exactly once, with its label, markdown flag and shape. Only the plan's
// group list and each detail's stub map are read from memory, to tell group
// nodes and stubs apart; everything else is read from the parsers.

import { type DiagramGraph, extractGraph, type GraphEdge, type GraphNode } from "../../src/parse/graph.ts";
import type { SplitPlan } from "../../src/split/types.ts";

const nodeKey = (n: GraphNode): string => JSON.stringify([n.id, n.label, n.markdown ?? false, n.shape ?? null]);
const regionKey = (n: GraphNode): string => JSON.stringify([n.id, n.label, n.markdown ?? false]);
const edgeKey = (e: GraphEdge, s: string, t: string): string =>
  JSON.stringify([s, t, e.label ?? "", e.markdown ?? false, e.kind ?? "", e.cardinality ?? ""]);

// A start or end transition by its marker's shape and box, the state at its
// other end and its label.
const markerKeys = (g: DiagramGraph, skip: (end: string) => boolean): string[] => {
  const markers = new Map((g.pseudo?.nodes ?? []).map((m) => [m.id, m]));
  return (g.pseudo?.edges ?? []).flatMap((e) => {
    const m = markers.get(e.source) ?? markers.get(e.target);
    const end = markers.has(e.source) ? e.target : e.source;
    if (!m || markers.has(end) || skip(end)) return [];
    return [JSON.stringify([m.shape, m.parent, end, e.label ?? ""])];
  });
};

const diff = (want: string[], got: string[], what: string): string[] => {
  const left = new Map<string, number>();
  for (const k of want) left.set(k, (left.get(k) ?? 0) + 1);
  const extra = got.filter((k) => {
    const n = left.get(k) ?? 0;
    if (n === 0) return true;
    left.set(k, n - 1);
    return false;
  });
  const missing = [...left].flatMap(([k, n]) => Array<string>(n).fill(k));
  return [...missing.map((k) => `${what} missing: ${k}`), ...extra.map((k) => `${what} extra: ${k}`)];
};

interface Read {
  overview: DiagramGraph;
  details: Array<{ graph: DiagramGraph; stubs: Record<string, string> }>;
}

const readBack = async (plan: SplitPlan): Promise<Read> => ({
  overview: await extractGraph(plan.overviewSource),
  details: await Promise.all(plan.details.map(async (d) => ({ graph: await extractGraph(d.source), stubs: d.stubs }))),
});

// Each original edge once: from the overview between two kept nodes, else
// from the detail of a group at its source end, else from the detail at its
// target end. A stub standing for a whole group gives the group, not a node.
const edgeProblems = (original: DiagramGraph, plan: SplitPlan, read: Read): string[] => {
  const groupOf = new Map(plan.groups.flatMap((g) => [...g.members, ...g.regions].map((m) => [m, g.id] as const)));
  const groups = new Set(plan.groups.map((g) => g.id));
  const exact: string[] = read.overview.edges
    .filter((e) => !(groups.has(e.source) || groups.has(e.target)))
    .map((e) => edgeKey(e, e.source, e.target));
  const halves: string[] = [];
  for (const d of read.details) {
    for (const e of d.graph.edges) {
      const [s, t] = [d.stubs[e.source] ?? e.source, d.stubs[e.target] ?? e.target];
      (groups.has(s) || groups.has(t) ? halves : exact).push(edgeKey(e, s, t));
    }
  }
  const wantHalves = original.edges.flatMap((e) => {
    const [gs, gt] = [groupOf.get(e.source), groupOf.get(e.target)];
    return gs && gt && gs !== gt ? [edgeKey(e, gs, e.target)] : [];
  });
  return [
    ...diff(
      original.edges.map((e) => edgeKey(e, e.source, e.target)),
      exact,
      "edge",
    ),
    ...diff(wantHalves, halves, "half edge"),
  ];
};

// The rest of the reading: nodes, regions and marker transitions.
const elementProblems = (original: DiagramGraph, plan: SplitPlan, read: Read): string[] => {
  const groups = new Set(plan.groups.map((g) => g.id));
  const kept = read.overview.nodes.filter((n) => !groups.has(n.id));
  const members = read.details.flatMap((d) => d.graph.nodes.filter((n) => d.stubs[n.id] === undefined));
  // A detail's region the overview also draws is context: a namespace
  // mermaid makes around a dotted name.
  const drawn = new Set(read.overview.subgraphs.map((s) => s.id));
  const regions = [
    ...read.overview.subgraphs,
    ...read.details.flatMap((d) => d.graph.subgraphs.filter((s) => !drawn.has(s.id))),
  ];
  const markers = [
    ...markerKeys(read.overview, (x) => groups.has(x)),
    ...read.details.flatMap((d) => markerKeys(d.graph, (x) => d.stubs[x] !== undefined)),
  ];
  return [
    ...diff(original.nodes.map(nodeKey), [...kept, ...members].map(nodeKey), "node"),
    ...diff(original.subgraphs.map(regionKey), regions.map(regionKey), "region"),
    ...diff(
      markerKeys(original, () => false),
      markers,
      "marker transition",
    ),
  ];
};

export const faithful = async (source: string, plan: SplitPlan): Promise<string[]> => {
  const [original, read] = [await extractGraph(source), await readBack(plan)];
  return [...elementProblems(original, plan, read), ...edgeProblems(original, plan, read)];
};
