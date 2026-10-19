// Turns a partition that meets the target into a plan: group ids and labels,
// the overview graph and source, one detail diagram per group, the diagrams
// that draw the rows of nodes the overview keeps, and the loss the plan
// declares. A detail too large for the target is handed back to the planner
// once, through splitDetail.

import type { DiagramGraph, GraphEdge, GraphNode } from "../parse/graph.ts";
import type { ThresholdConfig } from "../parse/metrics.ts";
import { emitSource } from "./emit.ts";
import {
  buildWorkGraph,
  byNatural,
  byOverviewEdge,
  byText,
  edgeKey,
  sorted,
  type WNode,
  type WorkGraph,
} from "./graph.ts";
import { groupLabels, ID_LEAD, type LabelContext, namedStubs, rangeLabel, type StubText, stubTexts } from "./label.ts";
import {
  chainEntries,
  type DetailView,
  detailShape,
  detailView,
  type Group,
  idMaker,
  isGroupKey,
  keyOf,
  type LabelParts,
  labelChoices,
  meets,
  over,
  overviewShape,
  type Partition,
  partitionOf,
  type QEdge,
  quotientEdges,
  remainingRegions,
  reversedEdges,
  scoreOf,
  usedIds,
} from "./quotient.ts";
import { newReachablePairs } from "./reach.ts";
import type { LadderStep, RowDetail, SplitDetail, SplitGroup, SplitPlan, Tier } from "./types.ts";

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

const graphNode = (n: WNode, parent: string | null, rows: boolean): GraphNode => ({
  id: n.id,
  label: n.label,
  parent,
  ...(n.shape ? { shape: n.shape } : {}),
  ...(n.markdown ? { markdown: true as const } : {}),
  ...(rows && n.rows?.length ? { rows: n.rows } : {}),
  ...(n.descriptions?.length ? { descriptions: n.descriptions } : {}),
});

const regionNode = (work: WorkGraph, id: string, parent: string | null): GraphNode => {
  const r = work.regions.get(id);
  return { id, label: r?.owner ? "" : (r?.label ?? id), parent, ...(r?.markdown ? { markdown: true as const } : {}) };
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
  ...(e.markdown ? { markdown: true as const } : {}),
  ...(e.kind !== undefined ? { kind: e.kind } : {}),
  ...(e.cardinality !== undefined ? { cardinality: e.cardinality } : {}),
  covers: e.covers,
});

const markerIds = (work: WorkGraph): Set<string> => new Set(work.markers.map((m) => m.id));

// What the overview draws but does not count: the markers of regions still
// drawn, with each transition's other end moved to its overview node, and
// every lollipop interface, on its class or on the group folding its class.
const overviewPseudo = (
  work: WorkGraph,
  part: Partition,
  idOf: (k: string) => string,
): DiagramGraph["pseudo"] | undefined => {
  if (work.family === "class") {
    const nodes = [...work.lollipops].map(([id, l]) => ({ id, label: l.label, parent: null, shape: "lollipop" }));
    return { nodes, edges: [] };
  }
  if (work.family !== "state") return undefined;
  const { nodes, edges } = overviewMarkers(work, part);
  const move = (x: string): string => idOf(x);
  return {
    nodes,
    edges: edges.map((e) => ({ ...e, source: move(e.source), target: move(e.target) })),
  };
};

export interface OverviewMarkers {
  nodes: GraphNode[];
  // Each transition by its ends as partition keys.
  edges: GraphEdge[];
  // The start and end transitions drawn merged onto a group, less the ones
  // drawn for them.
  merged: number;
}

// The start and end markers an overview draws, with their transitions: one
// from a marker to a kept state for each written, and one from a marker to a
// group for all the marker's transitions into the group's members, labelled
// only when every one of them carries that label. The group's detail draws
// each one as written, so the merge is presentation only.
export const overviewMarkers = (work: WorkGraph, part: Partition): OverviewMarkers => {
  const nodes = work.markers.filter((m) => m.parent === null || !part.regionOf.has(m.parent));
  const kept = new Set(nodes.map((m) => m.id));
  const all = markerIds(work);
  const buckets = new Map<string, GraphEdge[]>();
  for (const e of work.markerEdges) {
    const marker = all.has(e.source) ? e.source : e.target;
    if (!kept.has(marker)) continue;
    const move = (x: string): string => (x === marker ? x : over(work, part, x));
    const edge = { ...e, source: move(e.source), target: move(e.target) };
    const grouped = isGroupKey(edge.source) || isGroupKey(edge.target);
    const key = grouped ? `${edge.source}\u0000${edge.target}` : edgeKey(edge);
    buckets.set(key, [...(buckets.get(key) ?? []), edge]);
  }
  let merged = 0;
  const edges = [...buckets.values()].map((bucket) => {
    const [first, ...rest] = bucket as [GraphEdge, ...GraphEdge[]];
    if (!(isGroupKey(first.source) || isGroupKey(first.target))) return first;
    merged += rest.length;
    const { label: _label, ...bare } = first;
    return bucket.every((e) => e.label === first.label) ? first : bare;
  });
  return { nodes, edges: sortEdges(edges).map((e, i) => ({ ...e, id: `p${i}` })), merged };
};

// The id of the overview node a partition key stands for.
const idOfKey =
  (part: Partition, groups: SplitGroup[]) =>
  (k: string): string =>
    isGroupKey(k) ? (groups[part.groupOf.get(k.slice(1)) ?? -1]?.id ?? k) : k;

const overviewGraph = (
  work: WorkGraph,
  part: Partition,
  groups: SplitGroup[],
): { graph: DiagramGraph; covers: Record<string, string[]> } => {
  const idOf = idOfKey(part, groups);
  const kept = work.ids.filter((id) => !part.groupOf.has(id)).map((id) => work.nodes.get(id) as WNode);
  const pseudo = overviewPseudo(work, part, idOf);
  const edges = quotientEdges(work, part)
    .map((e) => qEdge(e, idOf))
    .sort(byOverviewEdge)
    .map((e, i) => ({ ...e, id: `o${i}` }));
  const graph: DiagramGraph = {
    diagram_type: work.type,
    nodes: [
      ...kept.map((n) => graphNode(n, n.owns ?? n.parent, false)),
      ...groups.map((g) => ({
        id: g.id,
        label: g.label,
        parent: g.parent,
        ...(work.family === "flowchart" ? { shape: "subroutine" } : {}),
        ...(g.markdown ? { markdown: true as const } : {}),
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

const detailGraph = (work: WorkGraph, view: DetailView, texts: Map<string, StubText>, rows: boolean): DiagramGraph => {
  const drawn = new Set(view.regions);
  const inDrawn = (p: string | null | undefined): string | null => (p && drawn.has(p) ? p : null);
  const pseudo = detailPseudo(work, view);
  return {
    diagram_type: work.type,
    nodes: [
      ...view.members.map((id) => {
        const n = work.nodes.get(id) as WNode;
        return graphNode(n, inDrawn(n.owns ?? n.parent), rows);
      }),
      ...view.stubs.map((s) => {
        const text = texts.get(s.id);
        return {
          id: s.id,
          label: text?.label ?? s.id,
          parent: null,
          ...(work.family === "flowchart" ? { shape: "stadium" } : {}),
          ...(text?.markdown ? { markdown: true as const } : {}),
        };
      }),
    ],
    edges: sortEdges(view.edges),
    subgraphs: view.regions.map((r) => regionNode(work, r, inDrawn(work.regions.get(r)?.parent))),
    ...(pseudo ? { pseudo } : {}),
  };
};

const rowCount = (work: WorkGraph, ids: readonly string[]): number =>
  ids.reduce((sum, id) => sum + (work.nodes.get(id)?.rows?.length ?? 0), 0);

const drawnRows = (work: WorkGraph, details: SplitDetail[], rowDetails: RowDetail[]): number =>
  details.reduce(
    (sum, d) =>
      sum +
      (d.rows
        ? rowCount(
            work,
            d.graph.nodes.map((n) => n.id),
          )
        : 0),
    0,
  ) + rowDetails.reduce((sum, d) => sum + rowCount(work, d.members), 0);

const lossOf = (work: WorkGraph, folded: Folded, drawn: number): SplitPlan["loss"] => {
  const byTier: Partial<Record<Tier, number>> = {};
  for (const s of folded.snapshots) byTier[s.tier] = newReachablePairs(work, partFromSnapshot(s));
  return {
    newReachablePairs: newReachablePairs(work, folded.part),
    byTier,
    droppedRows: work.rows - drawn,
    mergedMarkers: work.family === "state" ? overviewMarkers(work, folded.part).merged : 0,
    reversedEdges: reversedEdges(work, folded.part),
  };
};

// The overview's size after each tier walked, measured as the plan is.
export const ladderOf = (work: WorkGraph, snapshots: Snapshot[], config: ThresholdConfig): LadderStep[] =>
  snapshots.map((s) => {
    const part = partFromSnapshot(s);
    const shape = overviewShape(work, part, quotientEdges(work, part));
    return { tier: s.tier, nodes: shape.nodes, score: scoreOf(shape, 0, config) };
  });

export const partFromGroups = (groups: Array<{ members: string[]; regions: string[] }>): Partition =>
  partitionOf(groups.map((g) => ({ members: g.members, regions: g.regions, parent: null, tier: "T1", reason: "" })));

const partFromSnapshot = (s: Snapshot): Partition => partFromGroups(s.groups);

interface DetailBuilt {
  detail: SplitDetail;
  nested: Build | null;
}

interface Assembly {
  folded: Folded;
  config: ThresholdConfig;
  split: SplitDetailFn;
  labels: LabelContext;
}

// A detail's view and its stubs' texts, a whole-group stub that reads alike
// another named by the member its edges leave where it can be (namedStubs).
// A stub's sources are every member of its group with an edge into this one,
// including those whose edges it draws once for several.
const viewOf = (a: Assembly, group: Group): { view: DetailView; texts: Map<string, StubText> } => {
  const { work, part } = a.folded;
  const view = detailView(work, part, group);
  const endOf = new Map(view.stubs.map((s) => [s.id, s.endpoint]));
  const here = keyOf(group);
  const sourcesOf = (stub: string): string[] => {
    const end = endOf.get(stub);
    return sorted(
      new Set(
        work.edges
          .filter((e) => over(work, part, e.source) === end && over(work, part, e.target) === here)
          .map((e) => e.source),
      ),
    );
  };
  const texts = stubTexts(a.labels, view.stubs);
  return { view, texts: namedStubs(a.labels, view.stubs, texts, sourcesOf) ?? texts };
};

// A detail draws its members' rows when it still meets the target with them.
const buildDetail = (a: Assembly, g: SplitGroup): DetailBuilt | string => {
  const { work, part } = a.folded;
  const group = part.groups[part.groupOf.get(g.members[0] ?? "") ?? -1] as Group;
  const { view, texts } = viewOf(a, group);
  const shape = detailShape(work, view);
  const rowsHere = rowCount(work, view.members);
  const rows = rowsHere > 0 && meets(shape.nodes, scoreOf(shape, rowsHere, a.config), a.config);
  const score = scoreOf(shape, rows ? rowsHere : 0, a.config);
  const graph = detailGraph(work, view, texts, rows);
  const stubs = Object.fromEntries(view.stubs.map((s) => [s.id, texts.get(s.id)?.endpoint ?? s.endpoint]));
  const source = emitSource(work, { graph, stubs: new Set(Object.keys(stubs)) });
  const detail = { group: g.id, graph, stubs, rows, source, nodes: shape.nodes, score, split: null };
  if (meets(shape.nodes, score, a.config)) return { detail, nested: null };
  const nested = a.split(buildWorkGraph(graph, { direction: work.direction, rows: 0, stubs: Object.keys(stubs) }));
  if (typeof nested === "string") return `the detail of ${g.label} exceeds the target and does not split: ${nested}`;
  return { detail: { ...detail, split: nested.plan }, nested };
};

const labelOf = (work: WorkGraph, id: string): string => work.nodes.get(id)?.label ?? id;

// How a group may be named beyond its region and head: the range of its
// members' labels, for twins and sibling leaves or for members whose labels
// all lead with an id, when no other group's member falls in it; and, for
// id-led labels, its members in natural order of their labels, so a group
// with no honest range is named by its first id.
const namingOf = (work: WorkGraph, part: Partition, g: Group): { range: string | null; byLabel: boolean } => {
  const labels = g.members.map((m) => labelOf(work, m));
  const idLed = labels.every((l) => ID_LEAD.test(l));
  // Twin chains are named by an entry, so a range never spans two stages of them.
  const runs = (g.reason === "twins" || g.reason === "sibling leaves") && chainEntries(work, g.members) === null;
  if (g.members.some((m) => work.nodes.get(m)?.markdown) || !(runs || idLed)) return { range: null, byLabel: false };
  const hidden = part.groups.filter((x) => x !== g).flatMap((x) => x.members.map((m) => labelOf(work, m)));
  return { range: rangeLabel(labels, hidden), byLabel: idLed };
};

// The labels a group may show, preferred first. A region's label qualified
// by the region around it comes first when another group is named after a
// region of the same label, so echoing regions read apart by where they sit
// rather than by an id; else it comes after the region's own label, before
// any label tagged with an id.
const optionsOf = (choices: LabelParts[], id: string, shared: boolean): Array<LabelParts & { label: string }> => {
  const all = choices.flatMap((c) => groupLabels(c.base, c.n, c.markdown, id).map((label) => ({ ...c, label })));
  const qualified = all.filter((o) => o.qualified && !o.label.endsWith(`[${id}]`));
  if (qualified.length === 0) return all;
  const rest = all.filter((o) => !qualified.includes(o));
  const plain = rest.filter((o) => o.base === choices[0]?.base && !o.label.endsWith(`[${id}]`));
  const others = rest.filter((o) => !plain.includes(o));
  return shared ? [...qualified, ...plain, ...others] : [...plain, ...qualified, ...others];
};

// Each group's label: the first of its choices no original node, region or
// earlier group already shows, so a group never reads as another node.
const groupsOf = (work: WorkGraph, part: Partition): SplitGroup[] => {
  const next = idMaker(usedIds(work), "g");
  const taken = new Set([...work.nodes.values()].map((n) => n.label));
  for (const r of work.regions.values()) taken.add(r.label);
  const choices = part.groups.map((g) => labelChoices(work, g, namingOf(work, part, g)));
  const regionBase = (cs: LabelParts[]): string | undefined => (cs[1]?.qualified ? cs[0]?.base : undefined);
  const bases = choices.map(regionBase);
  return part.groups.map((g, i) => {
    const id = next();
    const mine = choices[i] ?? [];
    const named = regionBase(mine);
    const shared = named !== undefined && bases.filter((b) => b === named).length > 1;
    const options = optionsOf(mine, id, shared);
    const pick = options.find((o) => !taken.has(o.label)) ?? options[0];
    const { base, n, markdown, label } = pick ?? { base: "", n: 0, label: "" };
    taken.add(label);
    const shape = agreedShape(work, g);
    return {
      id,
      label,
      labelBase: base,
      hidden: n,
      ...(markdown ? { markdown } : {}),
      members: g.members,
      regions: g.regions,
      parent: g.parent,
      tier: g.tier,
      reason: g.reason,
      ...(shape !== undefined ? { shape } : {}),
    };
  });
};

const labelContext = (work: WorkGraph, part: Partition, groups: SplitGroup[]): LabelContext => ({
  work,
  part,
  groups: new Map(
    part.groups.map((g, i) => {
      const s = groups[i] as SplitGroup;
      return [
        keyOf(g),
        { id: s.id, base: s.labelBase, label: s.label, ...(s.markdown ? { markdown: s.markdown } : {}) },
      ];
    }),
  ),
});

// The rows of the nodes the overview keeps, drawn in diagrams of a few nodes
// each, in natural order of their ids, each meeting the target. A node whose
// rows alone exceed the target is drawn in none, and its rows are declared.
const rowDetailsOf = (work: WorkGraph, part: Partition, config: ThresholdConfig): RowDetail[] => {
  const kept = work.ids.filter((id) => !part.groupOf.has(id) && work.nodes.get(id)?.rows?.length).sort(byNatural);
  const fits = (ids: string[]): boolean =>
    meets(
      ids.length,
      scoreOf({ nodes: ids.length, edges: 0, subgraphs: 0, depth: 0 }, rowCount(work, ids), config),
      config,
    );
  const chunks: string[][] = [];
  for (const id of kept) {
    const last = chunks.at(-1);
    if (last && fits([...last, id])) last.push(id);
    else if (fits([id])) chunks.push([id]);
  }
  return chunks.map((members) => {
    const graph: DiagramGraph = {
      diagram_type: work.type,
      nodes: members.map((id) => graphNode(work.nodes.get(id) as WNode, null, true)),
      edges: [],
      subgraphs: [],
    };
    const shape = { nodes: members.length, edges: 0, subgraphs: 0, depth: 0 };
    const source = emitSource(work, { graph, stubs: new Set() });
    return { members, graph, source, nodes: members.length, score: scoreOf(shape, rowCount(work, members), config) };
  });
};

export const assemble = (folded: Folded, config: ThresholdConfig, split: SplitDetailFn): Build | string => {
  const { work, part } = folded;
  const groups = groupsOf(work, part);
  const { graph: overview, covers } = overviewGraph(work, part, groups);
  const a: Assembly = { folded, config, split, labels: labelContext(work, part, groups) };
  const details: SplitDetail[] = [];
  const nested: Record<string, Build> = {};
  for (const g of groups) {
    const built = buildDetail(a, g);
    if (typeof built === "string") return built;
    details.push(built.detail);
    if (built.nested) nested[g.id] = built.nested;
  }
  const rowDetails = rowDetailsOf(work, part, config);
  const shape = overviewShape(work, part, quotientEdges(work, part));
  const stubs = new Set(overview.nodes.filter((n) => work.stubs.has(n.id)).map((n) => n.id));
  const plan: SplitPlan = {
    diagram_type: work.type,
    tier: folded.tier,
    groups,
    overview,
    overviewSource: emitSource(work, { graph: overview, stubs, groups: new Set(groups.map((g) => g.id)) }),
    overviewNodes: shape.nodes,
    overviewScore: scoreOf(shape, 0, config),
    details,
    rowDetails,
    loss: lossOf(work, folded, drawnRows(work, details, rowDetails)),
    ladder: ladderOf(work, folded.snapshots, config),
  };
  return { plan, work, covers, snapshots: folded.snapshots, nested };
};
