// Turns a partition that meets the target into a plan: group ids and labels,
// the overview graph and source, one detail diagram per group, the diagrams
// that draw the rows of nodes the overview keeps, and the loss the plan
// declares. A detail too large for the target is handed back to the planner
// once, through splitDetail.

import type { DiagramGraph, GraphEdge, GraphNode } from "../parse/graph.ts";
import type { ThresholdConfig } from "../parse/metrics.ts";
import { emitSource } from "./emit.ts";
import { flaggedText } from "./flagged.ts";
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
import {
  fanLabel,
  groupLabels,
  ID_LEAD,
  type LabelContext,
  MAX_LISTED,
  memberText,
  namedStubs,
  rangeLabel,
  type StubText,
  shorten,
  stubTexts,
  wholeNaming,
} from "./label.ts";
import {
  chainEntries,
  type DetailView,
  detailShape,
  detailView,
  endpointLabel,
  fanOf,
  type Group,
  groupOfKey,
  idMaker,
  isGroupKey,
  keyOf,
  type LabelParts,
  labelChoices,
  meets,
  type Naming,
  over,
  overviewShape,
  type Partition,
  partitionOf,
  type QEdge,
  quotientEdges,
  remainingRegions,
  reversedEdges,
  type Shape,
  type Stub,
  scoreOf,
  soleRegion,
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

// A box of stubs (MJL-0037): in a flowchart detail, the stubs for two or more
// members of one other group, drawn inside one subgraph showing the label
// that group shows, each stub showing its member's own label. A group standing
// for one author region whole (soleRegion) is boxed as that region, so an
// edge to the region meets the box; any other group's box draws no edge.
export interface Box {
  id: string;
  // The region the box stands for, or the id of the group it stands for.
  endpoint: string;
  label: string;
  markdown?: true;
  // The stubs it holds, each standing for a member of its group.
  inner: string[];
}

// A detail's stubs by the group each stands in: for a member or a region
// of that group, or for the group whole.
const stubsByGroup = (work: WorkGraph, part: Partition, view: DetailView): Map<string, Stub[]> => {
  const byGroup = new Map<string, Stub[]>();
  for (const s of view.stubs) {
    const k = isGroupKey(s.endpoint) ? s.endpoint : over(work, part, s.endpoint);
    if (isGroupKey(k)) byGroup.set(k, [...(byGroup.get(k) ?? []), s]);
  }
  return byGroup;
};

// The box for one group's stubs, or null. A group is boxed only when every
// stub for it stands for a member or for the region it stands for whole,
// one member at least, each shows its plain text, and each member's label
// names one member.
const boxFor = (
  a: Assembly,
  k: string,
  stubs: Stub[],
  texts: Map<string, StubText>,
): (Omit<Box, "id"> & { on?: string }) | null => {
  const { work, part } = a.folded;
  const g = groupOfKey(part, k);
  const shown = a.labels.groups.get(k);
  if (!(g && shown) || stubs.length < 2) return null;
  const region = soleRegion(work, g);
  const inner = stubs.filter((s) => work.nodes.has(s.endpoint));
  const onRegion = stubs.filter((s) => s.endpoint === region);
  const plain = stubs.every((s) => texts.get(s.id)?.label === memberText(a.labels, s.endpoint));
  const labels = g.members.map((m) => labelOf(work, m));
  const named = inner.every((s) => labels.filter((l) => l === labelOf(work, s.endpoint)).length === 1);
  if (inner.length + onRegion.length !== stubs.length || inner.length === 0 || !(plain && named)) return null;
  return {
    endpoint: region ?? shown.id,
    label: shown.label,
    ...(shown.markdown ? { markdown: shown.markdown } : {}),
    inner: inner.map((s) => s.id),
    ...(onRegion[0] ? { on: onRegion[0].id } : {}),
  };
};

// The boxes a detail may draw, most stubs first, each taking the id of the
// stub for its region when it has one.
const boxChoices = (a: Assembly, view: DetailView, texts: Map<string, StubText>): Box[] => {
  const { work, part } = a.folded;
  if (work.family !== "flowchart") return [];
  const next = idMaker(new Set([...usedIds(work), ...view.stubs.map((s) => s.id)]), "s");
  return [...stubsByGroup(work, part, view)]
    .sort((x, y) => byText(x[0], y[0]))
    .flatMap(([k, stubs]) => {
      const box = boxFor(a, k, stubs, texts);
      if (!box) return [];
      const { on, ...rest } = box;
      return [{ id: on ?? next(), ...rest }];
    })
    .sort((x, y) => y.inner.length - x.inner.length);
};

// A detail's shape with its boxes: a box standing for a region's stub is a
// subgraph instead of a node, and every box is a subgraph at the top level.
const boxedShape = (work: WorkGraph, view: DetailView, boxes: readonly Box[]): Shape => {
  const shape = detailShape(work, view);
  const stubIds = new Set(view.stubs.map((s) => s.id));
  return {
    nodes: shape.nodes - boxes.filter((b) => stubIds.has(b.id)).length,
    edges: shape.edges,
    subgraphs: shape.subgraphs + boxes.length,
    depth: boxes.length > 0 ? Math.max(shape.depth, 1) : shape.depth,
  };
};

// The boxes a detail draws: each, most stubs first, while the detail still
// meets the target with it.
const boxesOf = (a: Assembly, view: DetailView, texts: Map<string, StubText>): Box[] => {
  const kept: Box[] = [];
  for (const b of boxChoices(a, view, texts)) {
    const shape = boxedShape(a.folded.work, view, [...kept, b]);
    if (meets(shape.nodes, scoreOf(shape, 0, a.config), a.config)) kept.push(b);
  }
  return kept;
};

// What a detail draws beside its view: each stub's text, whether members
// draw their rows, and its boxes of stubs.
interface Drawn {
  texts: Map<string, StubText>;
  rows: boolean;
  boxes: readonly Box[];
}

const detailGraph = (work: WorkGraph, view: DetailView, { texts, rows, boxes }: Drawn): DiagramGraph => {
  const drawn = new Set(view.regions);
  const inDrawn = (p: string | null | undefined): string | null => (p && drawn.has(p) ? p : null);
  const pseudo = detailPseudo(work, view);
  const boxOf = new Map(boxes.flatMap((b) => b.inner.map((id) => [id, b.id] as const)));
  const boxIds = new Set(boxes.map((b) => b.id));
  const endOf = new Map(view.stubs.map((s) => [s.id, s.endpoint]));
  return {
    diagram_type: work.type,
    nodes: [
      ...view.members.map((id) => {
        const n = work.nodes.get(id) as WNode;
        return graphNode(n, inDrawn(n.owns ?? n.parent), rows);
      }),
      ...view.stubs
        .filter((s) => !boxIds.has(s.id))
        .map((s) => {
          const text = texts.get(s.id);
          const box = boxOf.get(s.id);
          const end = endOf.get(s.id) ?? s.id;
          return {
            id: s.id,
            label: box === undefined ? (text?.label ?? s.id) : endpointLabel(work, end),
            parent: box ?? null,
            ...(work.family === "flowchart" ? { shape: "stadium" } : {}),
            ...(text?.markdown ? { markdown: true as const } : {}),
          };
        }),
    ],
    edges: sortEdges(view.edges),
    subgraphs: [
      ...view.regions.map((r) => regionNode(work, r, inDrawn(work.regions.get(r)?.parent))),
      ...boxes.map((b) => ({
        id: b.id,
        label: b.label,
        parent: null,
        ...(b.markdown ? { markdown: b.markdown } : {}),
      })),
    ],
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
  // The keys of the groups whose details are split again (exactSide).
  nested: ReadonlySet<string>;
}

// A detail's view and its stubs' texts, a whole-group stub that reads alike
// another named by the member its edges leave where it can be (namedStubs).
// A stub's sources are every member of its group with an edge into this one,
// including those whose edges it draws once for several.
const viewOf = (a: Assembly, group: Group): { view: DetailView; texts: Map<string, StubText> } => {
  const { work, part } = a.folded;
  const view = detailView(work, part, group, { nested: a.nested, config: a.config });
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
  const plain = detailShape(work, view);
  const boxes = meets(plain.nodes, scoreOf(plain, 0, a.config), a.config) ? boxesOf(a, view, texts) : [];
  const shape = boxedShape(work, view, boxes);
  const rowsHere = rowCount(work, view.members);
  const rows = rowsHere > 0 && meets(shape.nodes, scoreOf(shape, rowsHere, a.config), a.config);
  const score = scoreOf(shape, rows ? rowsHere : 0, a.config);
  const graph = detailGraph(work, view, { texts, rows, boxes });
  const stubs = Object.fromEntries([
    ...view.stubs.map((s) => [s.id, texts.get(s.id)?.endpoint ?? s.endpoint]),
    ...boxes.map((b) => [b.id, b.endpoint]),
  ]);
  const source = emitSource(work, { graph, stubs: new Set(Object.keys(stubs)) });
  const detail = { group: g.id, graph, stubs, rows, source, nodes: shape.nodes, score, split: null };
  if (meets(shape.nodes, score, a.config)) return { detail, nested: null };
  const measured = { nodes: shape.nodes, edges: shape.edges, subgraphs: shape.subgraphs, depth: shape.depth };
  const nested = a.split(
    buildWorkGraph(graph, { direction: work.direction, rows: 0, stubs: Object.keys(stubs), measured }),
  );
  if (typeof nested === "string") return `the detail of ${g.label} exceeds the target and does not split: ${nested}`;
  return { detail: { ...detail, split: nested.plan }, nested };
};

const labelOf = (work: WorkGraph, id: string): string => work.nodes.get(id)?.label ?? id;

// How a group may be named beyond its region and head: the dotted family it
// holds whole, or its twin chains by their stages; the range of its
// members' labels, for twins and sibling leaves or for members whose labels
// all lead with an id, when no other group's member falls in it; and, for
// id-led labels, its members in natural order of their labels, so a group
// with no honest range is named by its first id.
const namingOf = (work: WorkGraph, part: Partition, g: Group): Naming => {
  const labels = g.members.map((m) => labelOf(work, m));
  const markdown = g.members.some((m) => work.nodes.get(m)?.markdown);
  const whole = markdown ? { family: null, lane: null } : wholeNaming(work, g);
  const idLed = labels.every((l) => ID_LEAD.test(l));
  // Twin chains are named by an entry, so a range never spans two stages of them.
  const runs = (g.reason === "twins" || g.reason === "sibling leaves") && chainEntries(work, g.members) === null;
  if (markdown || !(runs || idLed)) return { range: null, byLabel: false, ...whole };
  const hidden = part.groups.filter((x) => x !== g).flatMap((x) => x.members.map((m) => labelOf(work, m)));
  return { range: rangeLabel(labels, hidden), byLabel: idLed, ...whole };
};

// The labels a group may show, preferred first. A region's label qualified
// by the region around it comes first when another group is named after a
// region of the same label, so echoing regions read apart by where they sit
// rather than by an id; else it comes after the region's own label, before
// any label tagged with an id.
const optionsOf = (choices: LabelParts[], id: string, shared: boolean): Array<LabelParts & { label: string }> => {
  const all = choices.flatMap((c) => groupLabels(c, id).map((label) => ({ ...c, label })));
  // A qualified label is offered only whole: cut, it would hide where the region sits.
  const qualified = all.filter((o) => o.qualified && shorten(o.base) === o.base && !o.label.endsWith(`[${id}]`));
  if (qualified.length === 0) return all;
  const rest = all.filter((o) => !o.qualified);
  const plain = rest.filter((o) => o.base === choices[0]?.base && !o.label.endsWith(`[${id}]`));
  const others = rest.filter((o) => !plain.includes(o));
  return shared ? [...qualified, ...plain, ...others] : [...plain, ...qualified, ...others];
};

// Groups of two or three members folded alike, by tier and reason, take pair
// or list labels only when every one of them can, so groups folded alike read
// alike (MJL-0038, MJL-0039): the choice is dropped from all of them otherwise.
const alikePairs = (part: Partition, choices: LabelParts[][]): LabelParts[][] => {
  const kind = (g: Group): string => `${g.tier}\u0000${g.reason}`;
  const blocked = new Set(
    part.groups
      .filter((g, i) => g.members.length <= MAX_LISTED && !(choices[i] ?? []).some((c) => c.pair !== undefined))
      .map(kind),
  );
  return choices.map((cs, i) => {
    const g = part.groups[i];
    return g && blocked.has(kind(g)) ? cs.filter((c) => c.pair === undefined) : cs;
  });
};

// The label a group of leaves hanging from one overview node may take from
// the label that node shows, once every other group is named (MJL-0038).
const fanChoices = (
  work: WorkGraph,
  part: Partition,
  i: number,
  known: { namings: Naming[]; choices: LabelParts[][]; picks: Array<LabelParts | undefined> },
): LabelParts[] => {
  const g = part.groups[i] as Group;
  const fan = fanOf(work, part, g);
  if (!fan) return known.choices[i] ?? [];
  const at = isGroupKey(fan.node) ? part.groupOf.get(fan.node.slice(1)) : undefined;
  const name = at === undefined ? labelOf(work, fan.node) : known.picks[at]?.base;
  const label = name === undefined ? null : fanLabel(name, fan.out);
  const naming = known.namings[i] ?? { range: null, byLabel: false };
  const paired = (known.choices[i] ?? []).some((c) => c.pair !== undefined);
  return labelChoices(work, g, { ...naming, fan: label }).filter((c) => paired || c.pair === undefined);
};

const splitGroupOf = (work: WorkGraph, g: Group, id: string, pick: (LabelParts & { label: string }) | undefined) => {
  const { base, n, markdown, label, pair } = pick ?? { base: "", n: 0, label: "" };
  const shape = agreedShape(work, g);
  return {
    id,
    label,
    labelBase: base,
    hidden: n,
    ...(pair !== undefined ? { paired: pair } : {}),
    ...(markdown ? { markdown } : {}),
    members: g.members,
    regions: g.regions,
    parent: g.parent,
    tier: g.tier,
    reason: g.reason,
    ...(shape !== undefined ? { shape } : {}),
  };
};

// Each group's label: the first of its choices no original node, region or
// earlier group already shows, so a group never reads as another node. A
// group of leaves hanging from one overview node is named after the others,
// so its fan label takes the name that node shows.
const groupsOf = (work: WorkGraph, part: Partition): SplitGroup[] => {
  const next = idMaker(usedIds(work), "g");
  const taken = new Set([...work.nodes.values()].map((n) => n.label));
  for (const r of work.regions.values()) taken.add(r.label);
  const namings = part.groups.map((g) => namingOf(work, part, g));
  const choices = alikePairs(
    part,
    part.groups.map((g, i) => labelChoices(work, g, namings[i])),
  );
  const regionBase = (cs: LabelParts[]): string | undefined => (cs[1]?.qualified ? cs[0]?.base : undefined);
  const bases = choices.map(regionBase);
  const ids = part.groups.map(() => next());
  const picks: Array<(LabelParts & { label: string }) | undefined> = [];
  const pickFor = (i: number, mine: LabelParts[]): void => {
    const named = regionBase(mine);
    const shared = named !== undefined && bases.filter((b) => b === named).length > 1;
    const options = optionsOf(mine, ids[i] ?? "", shared);
    const pick = options.find((o) => !taken.has(o.label)) ?? options[0];
    taken.add(pick?.label ?? "");
    picks[i] = pick;
  };
  const leaves = part.groups.map((g) => fanOf(work, part, g) !== null);
  part.groups.forEach((_, i) => {
    if (!leaves[i]) pickFor(i, choices[i] ?? []);
  });
  part.groups.forEach((_, i) => {
    if (leaves[i]) pickFor(i, fanChoices(work, part, i, { namings, choices, picks }));
  });
  return part.groups.map((g, i) => splitGroupOf(work, g, ids[i] ?? "", picks[i]));
};

const labelContext = (work: WorkGraph, part: Partition, groups: SplitGroup[]): LabelContext => ({
  work,
  part,
  groups: new Map(
    part.groups.map((g, i) => {
      const s = groups[i] as SplitGroup;
      return [
        keyOf(g),
        {
          id: s.id,
          base: s.labelBase,
          label: s.label,
          ...(s.markdown ? { markdown: s.markdown } : {}),
          ...(s.paired !== undefined ? { paired: true as const } : {}),
        },
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

// The keys of the groups whose details exceed the target, so are split again.
const splitAgain = (work: WorkGraph, part: Partition, config: ThresholdConfig): Set<string> =>
  new Set(
    part.groups
      .filter((g) => {
        const shape = detailShape(work, detailView(work, part, g));
        return !meets(shape.nodes, scoreOf(shape, 0, config), config);
      })
      .map(keyOf),
  );

export const assemble = (folded: Folded, config: ThresholdConfig, split: SplitDetailFn): Build | string => {
  const { work, part } = folded;
  const groups = groupsOf(work, part);
  const { graph: overview, covers } = overviewGraph(work, part, groups);
  const nested = splitAgain(work, part, config);
  const a: Assembly = { folded, config, split, labels: labelContext(work, part, groups), nested };
  const details: SplitDetail[] = [];
  const builds: Record<string, Build> = {};
  for (const g of groups) {
    const built = buildDetail(a, g);
    if (typeof built === "string") return built;
    details.push(built.detail);
    if (built.nested) builds[g.id] = built.nested;
  }
  const rowDetails = rowDetailsOf(work, part, config);
  const shape = overviewShape(work, part, quotientEdges(work, part));
  const ladder = ladderOf(work, folded.snapshots, config);
  const stubs = new Set(overview.nodes.filter((n) => work.stubs.has(n.id)).map((n) => n.id));
  const plan: SplitPlan = {
    diagram_type: work.type,
    tier: folded.tier,
    flagged: flaggedText(work, config, ladder, folded.tier),
    groups,
    overview,
    overviewSource: emitSource(work, { graph: overview, stubs, groups: new Set(groups.map((g) => g.id)) }),
    overviewNodes: shape.nodes,
    overviewScore: scoreOf(shape, 0, config),
    details,
    rowDetails,
    loss: lossOf(work, folded, drawnRows(work, details, rowDetails)),
    ladder,
  };
  return { plan, work, covers, snapshots: folded.snapshots, nested: builds };
};
