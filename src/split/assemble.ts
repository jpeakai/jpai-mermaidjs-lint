// Turns a partition that meets the target into a plan: group ids and labels,
// the overview graph and source, one detail diagram per group, and the loss
// the plan declares. A detail too large for the target is handed back to the
// planner once, through splitDetail.

import type { DiagramGraph, GraphEdge, GraphNode } from "../parse/graph.ts";
import type { ThresholdConfig } from "../parse/metrics.ts";
import { emitSource } from "./emit.ts";
import { buildWorkGraph, byText, edgeKey, type WNode, type WorkGraph } from "./graph.ts";
import {
  type DetailView,
  detailShape,
  detailView,
  type Group,
  idMaker,
  isGroupKey,
  labelParts,
  meets,
  over,
  overviewShape,
  type Partition,
  partitionOf,
  type QEdge,
  quotientEdges,
  remainingRegions,
  scoreOf,
  usedIds,
} from "./quotient.ts";
import { newReachablePairs } from "./reach.ts";
import type { SplitDetail, SplitGroup, SplitPlan, Tier } from "./types.ts";

export interface Snapshot {
  tier: Tier;
  groups: Array<{ members: string[]; regions: string[] }>;
}

export interface Folded {
  work: WorkGraph;
  part: Partition;
  snapshots: Snapshot[];
  tier: Tier;
}

// A plan with what the contract needs beside it: the graph it was planned
// from, which original edges each overview edge covers, the partition after
// each tier, and the build of every detail split again.
export interface Build {
  plan: SplitPlan;
  work: WorkGraph;
  covers: Record<string, string[]>;
  snapshots: Snapshot[];
  nested: Record<string, Build>;
}

export type SplitDetailFn = (work: WorkGraph) => Build | string;

export const snapshotOf = (tier: Tier, part: Partition): Snapshot => ({
  tier,
  groups: part.groups.map((g) => ({ members: g.members, regions: g.regions })),
});

const graphNode = (n: WNode, parent: string | null): GraphNode => ({
  id: n.id,
  label: n.label,
  parent,
  ...(n.shape ? { shape: n.shape } : {}),
});

const regionNode = (work: WorkGraph, id: string, parent: string | null): GraphNode => {
  const r = work.regions.get(id);
  return { id, label: r?.owner ? "" : (r?.label ?? id), parent };
};

const sortEdges = <E extends GraphEdge>(edges: E[]): E[] => [...edges].sort((a, b) => byText(edgeKey(a), edgeKey(b)));

const agreedShape = (work: WorkGraph, g: Group): string | undefined => {
  const shapes = new Set(g.members.map((m) => work.nodes.get(m)?.shape));
  const [only] = [...shapes];
  return shapes.size === 1 ? only : undefined;
};

const qEdge = (e: QEdge, idOf: (k: string) => string): GraphEdge & { covers: string[] } => ({
  id: "",
  source: idOf(e.source),
  target: idOf(e.target),
  ...(e.label !== undefined ? { label: e.label } : {}),
  ...(e.kind !== undefined ? { kind: e.kind } : {}),
  ...(e.cardinality !== undefined ? { cardinality: e.cardinality } : {}),
  covers: e.covers,
});

const markerIds = (work: WorkGraph): Set<string> => new Set(work.markers.map((m) => m.id));

// What the overview draws but does not count: the markers of regions still
// drawn, with each transition's other end moved to its overview node, and the
// lollipops of classes still drawn on their own.
const overviewPseudo = (
  work: WorkGraph,
  part: Partition,
  idOf: (k: string) => string,
): DiagramGraph["pseudo"] | undefined => {
  if (work.family === "class") {
    const kept = [...work.lollipops].filter(([id]) => over(work, part, id) === id);
    return { nodes: kept.map(([id, l]) => ({ id, label: l.label, parent: null, shape: "lollipop" })), edges: [] };
  }
  if (work.family !== "state") return undefined;
  const nodes = work.markers.filter((m) => m.parent === null || !part.regionOf.has(m.parent));
  const kept = new Set(nodes.map((m) => m.id));
  const all = markerIds(work);
  const seen = new Map<string, GraphEdge>();
  for (const e of work.markerEdges) {
    const marker = all.has(e.source) ? e.source : e.target;
    if (!kept.has(marker)) continue;
    const move = (x: string): string => (x === marker ? x : idOf(over(work, part, x)));
    const edge = { ...e, source: move(e.source), target: move(e.target) };
    seen.set(edgeKey(edge), edge);
  }
  const edges = sortEdges([...seen.values()]).map((e, i) => ({ ...e, id: `p${i}` }));
  return { nodes, edges };
};

const overviewGraph = (
  work: WorkGraph,
  part: Partition,
  groups: SplitGroup[],
): { graph: DiagramGraph; covers: Record<string, string[]> } => {
  const idOf = (k: string): string => (isGroupKey(k) ? (groups[part.groupOf.get(k.slice(1)) ?? -1]?.id ?? k) : k);
  const kept = work.ids.filter((id) => !part.groupOf.has(id)).map((id) => work.nodes.get(id) as WNode);
  const pseudo = overviewPseudo(work, part, idOf);
  const edges = sortEdges(quotientEdges(work, part).map((e) => qEdge(e, idOf))).map((e, i) => ({ ...e, id: `o${i}` }));
  const graph: DiagramGraph = {
    diagram_type: work.type,
    nodes: [
      ...kept.map((n) => graphNode(n, n.owns ?? n.parent)),
      ...groups.map((g) => ({
        id: g.id,
        label: g.label,
        parent: g.parent,
        ...(work.family === "flowchart" ? { shape: "subroutine" } : {}),
      })),
    ],
    edges: edges.map(({ covers: _covers, ...e }) => e),
    subgraphs: remainingRegions(work, part).map((r) => regionNode(work, r, work.regions.get(r)?.parent ?? null)),
    ...(pseudo ? { pseudo } : {}),
  };
  return { graph, covers: Object.fromEntries(edges.map((e) => [e.id, e.covers])) };
};

const detailPseudo = (work: WorkGraph, view: DetailView): DiagramGraph["pseudo"] | undefined => {
  if (work.family === "state") return { nodes: view.markers, edges: view.markerEdges };
  if (work.family !== "class") return undefined;
  const ends = new Set(view.edges.flatMap((e) => [e.source, e.target]));
  const nodes = [...work.lollipops]
    .filter(([id]) => ends.has(id))
    .map(([id, l]) => ({ id, label: l.label, parent: null, shape: "lollipop" }));
  return { nodes, edges: [] };
};

export const detailGraph = (work: WorkGraph, view: DetailView): DiagramGraph => {
  const drawn = new Set(view.regions);
  const inDrawn = (p: string | null | undefined): string | null => (p && drawn.has(p) ? p : null);
  const pseudo = detailPseudo(work, view);
  return {
    diagram_type: work.type,
    nodes: [
      ...view.members.map((id) => {
        const n = work.nodes.get(id) as WNode;
        return graphNode(n, inDrawn(n.owns ?? n.parent));
      }),
      ...view.stubs.map((s) => ({
        id: s.id,
        label: s.label,
        parent: null,
        ...(work.family === "flowchart" ? { shape: "stadium" } : {}),
      })),
    ],
    edges: sortEdges(view.edges),
    subgraphs: view.regions.map((r) => regionNode(work, r, inDrawn(work.regions.get(r)?.parent))),
    ...(pseudo ? { pseudo } : {}),
  };
};

const lossOf = (work: WorkGraph, folded: Folded): SplitPlan["loss"] => {
  const byTier: Partial<Record<Tier, number>> = {};
  for (const s of folded.snapshots) byTier[s.tier] = newReachablePairs(work, partFromSnapshot(s));
  return { newReachablePairs: newReachablePairs(work, folded.part), byTier, droppedRows: work.rows };
};

export const partFromGroups = (groups: Array<{ members: string[]; regions: string[] }>): Partition =>
  partitionOf(groups.map((g) => ({ members: g.members, regions: g.regions, parent: null, tier: "T1", reason: "" })));

const partFromSnapshot = (s: Snapshot): Partition => partFromGroups(s.groups);

interface DetailBuilt {
  detail: SplitDetail;
  nested: Build | null;
}

const buildDetail = (
  folded: Folded,
  g: SplitGroup,
  config: ThresholdConfig,
  split: SplitDetailFn,
): DetailBuilt | string => {
  const { work, part } = folded;
  const group = part.groups[part.groupOf.get(g.members[0] ?? "") ?? -1] as Group;
  const view = detailView(work, part, group);
  const graph = detailGraph(work, view);
  const shape = detailShape(work, view);
  const score = scoreOf(shape, 0, config);
  const stubs = Object.fromEntries(view.stubs.map((s) => [s.id, s.endpoint]));
  const source = emitSource(work, { graph, stubs: new Set(Object.keys(stubs)) });
  const detail = { group: g.id, graph, stubs, source, nodes: shape.nodes, score, split: null };
  if (meets(shape.nodes, score, config)) return { detail, nested: null };
  const nested = split(buildWorkGraph(graph, { direction: work.direction, rows: 0, stubs: Object.keys(stubs) }));
  if (typeof nested === "string") return `the detail of ${g.label} exceeds the target and does not split: ${nested}`;
  return { detail: { ...detail, split: nested.plan }, nested };
};

const groupsOf = (work: WorkGraph, part: Partition): SplitGroup[] => {
  const next = idMaker(usedIds(work), "g");
  return part.groups.map((g) => {
    const shape = agreedShape(work, g);
    const { base, n } = labelParts(work, g);
    return {
      id: next(),
      label: `${base} (+${n})`,
      labelBase: base,
      hidden: n,
      members: g.members,
      regions: g.regions,
      parent: g.parent,
      tier: g.tier,
      reason: g.reason,
      ...(shape !== undefined ? { shape } : {}),
    };
  });
};

export const assemble = (folded: Folded, config: ThresholdConfig, split: SplitDetailFn): Build | string => {
  const { work, part } = folded;
  const groups = groupsOf(work, part);
  const { graph: overview, covers } = overviewGraph(work, part, groups);
  const details: SplitDetail[] = [];
  const nested: Record<string, Build> = {};
  for (const g of groups) {
    const built = buildDetail(folded, g, config, split);
    if (typeof built === "string") return built;
    details.push(built.detail);
    if (built.nested) nested[g.id] = built.nested;
  }
  const shape = overviewShape(work, part, quotientEdges(work, part));
  const stubs = new Set(overview.nodes.filter((n) => work.stubs.has(n.id)).map((n) => n.id));
  const plan: SplitPlan = {
    diagram_type: work.type,
    tier: folded.tier,
    groups,
    overview,
    overviewSource: emitSource(work, { graph: overview, stubs }),
    overviewNodes: shape.nodes,
    overviewScore: scoreOf(shape, 0, config),
    details,
    loss: lossOf(work, folded),
  };
  return { plan, work, covers, snapshots: folded.snapshots, nested };
};
