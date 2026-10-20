// The contract a plan must pass before it is offered. Each check reads the
// plan as offered (its groups, overview, details and declared loss) against
// the graph it was planned from, and names every violation it finds. Check 9
// parses every emitted source again with the shipped parsers and compares
// what it reads back, element by element, with the planned graphs the other
// checks read: nodes with labels, markdown flags, shapes and rows, regions,
// edges with their attributes, and start and end transitions with theirs.
// So the other checks hold of the emitted text, not only of the plan.

import { type DiagramGraph, extractGraph, type GraphEdge } from "../parse/graph.ts";
import { calculateComplexity, type ThresholdConfig } from "../parse/metrics.ts";
import { extractStats } from "../parse/stats.ts";
import { type Build, ladderOf, overviewMarkers, partFromGroups } from "./assemble.ts";
import { flowRegionsOf } from "./flow.ts";
import { byOverviewEdge, byText, byTuple, edgeKey, homeOf, regionWithin, sorted, type WorkGraph } from "./graph.ts";
import { FROM, fromMembers, groupLabels, IN, rangeLabel, readerOf, readingsOf, shorten, wholeNaming } from "./label.ts";
import { floorOf } from "./plan.ts";
import {
  endpointLabel,
  idMaker,
  isGroupKey,
  over,
  type Partition,
  qualifiedLabel,
  reversible,
  soleRegion,
  usedIds,
} from "./quotient.ts";
import { newReachablePairs } from "./reach.ts";
import { joined } from "./tier.ts";

export { joined };

import type { SplitGroup, SplitPlan } from "./types.ts";

type Violations = string[];

// The overview node id an original endpoint is drawn in, read from the plan.
const overOf = (build: Build): ((id: string) => string) => {
  const part: Partition = partFromGroups(build.plan.groups);
  const idOfFirst = new Map(build.plan.groups.map((g) => [g.members[0] ?? "", g.id]));
  return (id) => {
    const k = over(build.work, part, id);
    return isGroupKey(k) ? (idOfFirst.get(k.slice(1)) ?? k) : k;
  };
};

const groupIds = (plan: SplitPlan): Set<string> => new Set(plan.groups.map((g) => g.id));

// 1. Every original node is in exactly one overview node, groups are
// disjoint, and each group folds whole regions inside the region it sits in.
const checkPartition = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = [];
  const kept = plan.overview.nodes.map((n) => n.id).filter((id) => !groupIds(plan).has(id));
  const seen = [...kept, ...plan.groups.flatMap((g) => g.members)];
  const counts = new Map<string, number>();
  for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of work.ids)
    if (counts.get(id) !== 1) out.push(`1: node ${id} is in ${counts.get(id) ?? 0} overview nodes`);
  for (const id of counts.keys()) if (!work.nodes.has(id)) out.push(`1: ${id} is not an original node`);
  for (const g of plan.groups) out.push(...laminar(work, g));
  for (const g of plan.groups.filter((x) => x.tier === "T6" && !joined(work, x)))
    out.push(`1: suggested group ${g.id} is not connected`);
  return out;
};

const laminar = (work: WorkGraph, g: SplitGroup): Violations => {
  const regions = new Set(g.regions);
  const fits = (r: string | null): boolean => (r !== null && regions.has(r)) || r === g.parent;
  const inside = (r: string | null): boolean => g.regions.some((x) => regionWithin(work, r, x));
  return [
    ...(g.members.length === 0 ? [`1: group ${g.id} is empty`] : []),
    ...(g.parent !== null && regions.has(g.parent) ? [`1: group ${g.id} sits inside a region it folds`] : []),
    ...g.members.filter((m) => !fits(homeOf(work, m))).map((m) => `1: ${m} crosses the regions of group ${g.id}`),
    ...g.regions
      .filter((r) => !fits(work.regions.get(r)?.parent ?? null))
      .map((r) => `1: region ${r} crosses group ${g.id}`),
    ...work.ids
      .filter((id) => inside(homeOf(work, id)) && !g.members.includes(id))
      .map((id) => `1: ${id} is left out of a region group ${g.id} folds`),
    ...work.regionIds
      .filter((r) => inside(r) && !regions.has(r))
      .map((r) => `1: region ${r} is left out of group ${g.id}`),
  ];
};

const edgeOf = (work: WorkGraph): Map<string, GraphEdge> => new Map(work.edges.map((e) => [e.id, e]));

// 2. Each overview edge stands for original edges between its two ends, and
// each original edge between two overview nodes is stood for exactly once.
// Between two kept nodes an overview edge stands for exactly one. Only an
// undirected edge with a group at an end may stand for edges of its own kind
// written the other way, and the plan declares how many it stands for.
const checkEdges = (build: Build): Violations => {
  const { plan, work, covers } = build;
  const overId = overOf(build);
  const edges = edgeOf(work);
  const groups = groupIds(plan);
  const covered = new Map<string, number>();
  let reversed = 0;
  const strays = plan.overview.edges.flatMap((o) => {
    const ids = covers[o.id] ?? [];
    for (const id of ids) covered.set(id, (covered.get(id) ?? 0) + 1);
    const kept = !(groups.has(o.source) || groups.has(o.target));
    // An undirected edge written the other way, of the overview edge's own kind.
    const back = (e: GraphEdge): boolean =>
      reversible(o, !kept) && e.kind === o.kind && overId(e.source) === o.target && overId(e.target) === o.source;
    const away = ids.filter((id) => {
      const e = edges.get(id);
      if (e && back(e)) reversed++;
      return !e || ((overId(e.source) !== o.source || overId(e.target) !== o.target) && !back(e));
    });
    return [
      ...(ids.length === 0 ? [`2: overview edge ${o.source} -> ${o.target} stands for no original edge`] : []),
      ...(kept && ids.length > 1 ? [`2: overview edge ${o.id} between kept nodes merges ${ids.length} edges`] : []),
      ...away.map((id) => `2: overview edge ${o.id} covers ${id} from elsewhere`),
    ];
  });
  const want = (e: GraphEdge): number =>
    overId(e.source) === overId(e.target) && groups.has(overId(e.source)) ? 0 : 1;
  return [
    ...strays,
    ...(reversed === plan.loss.reversedEdges ? [] : ["2: the declared edges drawn the other way are wrong"]),
    ...work.edges
      .filter((e) => (covered.get(e.id) ?? 0) !== want(e))
      .map((e) => `2: original edge ${e.source} -> ${e.target} is covered ${covered.get(e.id) ?? 0} times`),
  ];
};

const ATTRS = ["label", "markdown", "kind", "cardinality"] as const;

// 3. An overview edge carries an attribute only when every edge it covers
// agrees; between two kept nodes it is an exact copy; an erDiagram never
// merges two cardinalities or labels. A group shape is one all members share.
const checkAttributes = (build: Build): Violations => {
  const { plan, work, covers } = build;
  const edges = edgeOf(work);
  const groups = groupIds(plan);
  const edgeViolations = plan.overview.edges.flatMap((o) => {
    const covered = (covers[o.id] ?? []).flatMap((id) => edges.get(id) ?? []);
    const exact = work.family === "er" || !(groups.has(o.source) || groups.has(o.target));
    const claims = (a: (typeof ATTRS)[number]): boolean =>
      exact || o[a] !== undefined || (a === "markdown" && o.label !== undefined);
    return ATTRS.filter((a) => claims(a) && covered.some((e) => e[a] !== o[a])).map(
      (a) => `3: overview edge ${o.source} -> ${o.target} ${a} disagrees with an edge it covers`,
    );
  });
  const shapeViolations = plan.groups
    .filter((g) => g.shape !== undefined && g.members.some((m) => work.nodes.get(m)?.shape !== g.shape))
    .map((g) => `3: group ${g.id} claims a shape its members do not share`);
  return [...edgeViolations, ...shapeViolations];
};

const regionLabels = (work: WorkGraph, g: SplitGroup): string[] =>
  g.regions.map((r) => work.regions.get(r)?.label ?? "").filter((l) => l !== "");

// The labels of the regions a group folds whose parent the group node sits
// in, each qualified by that parent's label (quotient.ts qualifiedLabel).
const qualifiedLabels = (work: WorkGraph, g: SplitGroup): string[] =>
  g.regions
    .filter((r) => (work.regions.get(r)?.parent ?? null) === g.parent)
    .flatMap((r) => qualifiedLabel(work, r) ?? []);

// 4. A group label is an author label (a folded region's label, alone or,
// never cut, qualified by the region around it), a member's label, the range of its
// members' labels, or the family or lane label of its members (label.ts), shown cut by the
// one rule in label.ts, then " (+N)", N counting the members it does not
// name, and the group's id when the label is taken. No two groups show one
// label, and no group shows a node's label.
const groupLabelViolations = (build: Build, g: SplitGroup): Violations => {
  const { plan, work } = build;
  const out: Violations = [];
  const memberLabels = (x: SplitGroup): string[] => x.members.map((m) => work.nodes.get(m)?.label ?? m);
  const [base, n] = [g.labelBase, g.hidden];
  if (!groupLabels(base, n, g.markdown, g.id).includes(g.label)) out.push(`4: group ${g.id} label is not its parts`);
  const hidden = plan.groups.filter((x) => x !== g).flatMap(memberLabels);
  const range = base === rangeLabel(memberLabels(g), hidden);
  const plain = regionLabels(work, g).includes(base) || memberLabels(g).includes(base);
  const qualified = !plain && qualifiedLabels(work, g).includes(base) && shorten(base) === base;
  const naming = wholeNaming(work, g);
  const whole = !plain && (base === naming.family || base === naming.lane) && !g.markdown;
  if (!(range || plain || qualified || whole)) out.push(`4: group ${g.id} label "${base}" is not from the data`);
  const all = g.members.length;
  const counts = range ? [all - 2] : qualified || whole ? [all] : [all, all - 1];
  if (!counts.includes(n)) out.push(`4: group ${g.id} counts ${n} hidden members`);
  return out;
};

const checkLabels = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = plan.groups.flatMap((g) => groupLabelViolations(build, g));
  const labels = plan.groups.map((g) => g.label);
  const nodeLabels = new Set([...work.nodes.values()].map((n) => n.label));
  if (new Set(labels).size !== labels.length) out.push("4: two groups show one label");
  for (const l of labels) if (nodeLabels.has(l)) out.push(`4: group label "${l}" is also a node's label`);
  return out;
};

const tuple = (e: Pick<GraphEdge, "source" | "target" | "label" | "kind" | "cardinality" | "markdown">): string =>
  edgeKey(e);

const multiset = (keys: string[]): string => sorted(keys).join("\n");

// The edges overview and details give back. Exact: an edge between two kept
// nodes from the overview, and from a detail every edge whose ends are
// members or stubs for single nodes, with the details drawing each. Halves:
// an edge from a stub standing for a whole group, read as that group and the
// member it enters, or from a member into such a stub, read as that member
// and the group.
const recovered = (build: Build): { exact: string[]; halves: string[]; drawnIn: Map<string, string[]> } => {
  const groups = groupIds(build.plan);
  const exact: string[] = build.plan.overview.edges
    .filter((o) => !(groups.has(o.source) || groups.has(o.target)))
    .map((o) => tuple(o));
  const halves: string[] = [];
  const drawnIn = new Map<string, string[]>();
  for (const d of build.plan.details) {
    for (const e of d.graph.edges) {
      const [s, t] = [d.stubs[e.source] ?? e.source, d.stubs[e.target] ?? e.target];
      const key = tuple({ ...e, source: s, target: t });
      if (groups.has(s) || groups.has(t)) halves.push(key);
      else {
        exact.push(key);
        drawnIn.set(key, [...(drawnIn.get(key) ?? []), d.group]);
      }
    }
  }
  return { exact, halves, drawnIn };
};

// The one value a set of edges agrees on, or none.
const agreedOn = (edges: GraphEdge[], pick: (e: GraphEdge) => string | undefined): string | undefined =>
  edges.every((e) => pick(e) === pick(edges[0] as GraphEdge)) ? pick(edges[0] as GraphEdge) : undefined;

// Each edge between two groups, read from the detail that does not draw it
// exactly: as its source's group and its target when its source's detail
// draws it, else as its source and its target's group. The edges of one kind
// one way between one group and one member are one half, keeping the label
// and cardinality all agree on, and in an erDiagram one half per label and
// cardinality, as the overview draws one edge per pair.
const wantedHalves = (build: Build, drawnIn: Map<string, string[]>): string[] => {
  const overId = overOf(build);
  const groups = groupIds(build.plan);
  const er = build.work.family === "er";
  const left = new Map([...drawnIn].map(([k, v]) => [k, [...v]]));
  const buckets = new Map<string, GraphEdge[]>();
  for (const e of build.work.edges) {
    const [a, b] = [overId(e.source), overId(e.target)];
    if (!(a !== b && groups.has(a) && groups.has(b))) continue;
    const half = left.get(tuple(e))?.shift() === b ? { ...e, target: b } : { ...e, source: a };
    const key = JSON.stringify([
      half.source,
      half.target,
      e.kind ?? "",
      er ? (e.label ?? "") : "",
      er ? (e.cardinality ?? "") : "",
    ]);
    buckets.set(key, [...(buckets.get(key) ?? []), half]);
  }
  return [...buckets.values()].map((edges) => {
    const { label: _l, markdown: _m, kind: _k, cardinality: _c, ...bare } = edges[0] as GraphEdge;
    const label = agreedOn(edges, (x) => (x.label === undefined ? undefined : `${x.markdown ? "m" : "s"}${x.label}`));
    const kind = agreedOn(edges, (x) => x.kind);
    const cardinality = agreedOn(edges, (x) => x.cardinality);
    return tuple({
      ...bare,
      ...(label !== undefined
        ? { label: label.slice(1), ...(label.startsWith("m") ? { markdown: true as const } : {}) }
        : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(cardinality !== undefined ? { cardinality } : {}),
    });
  });
};

const detailNodes = (build: Build): Violations => {
  const out: Violations = [];
  const byId = new Map(build.plan.groups.map((g) => [g.id, g]));
  const overId = overOf(build);
  const groups = groupIds(build.plan);
  for (const d of build.plan.details) {
    const g = byId.get(d.group);
    const ids = d.graph.nodes.map((n) => n.id).filter((id) => d.stubs[id] === undefined);
    if (!g || multiset(ids) !== multiset(g.members)) out.push(`5: detail ${d.group} does not hold exactly its members`);
    for (const [stub, end] of Object.entries(d.stubs)) {
      if ((groups.has(end) ? end : overId(end)) === d.group)
        out.push(`5: stub ${stub} of ${d.group} stands for itself`);
    }
    out.push(...drawnBothWays(build, d));
  }
  return out;
};

// A group is drawn whole or as stubs for its members, never both. A box of
// stubs for a group holds its members' stubs, so it does not draw it whole.
const drawnBothWays = (build: Build, d: SplitPlan["details"][number]): Violations => {
  const overId = overOf(build);
  const groups = groupIds(build.plan);
  const boxes = new Set(d.graph.subgraphs.map((b) => b.id));
  const ends = Object.entries(d.stubs)
    .filter(([id]) => !boxes.has(id))
    .map(([, end]) => end);
  return ends
    .filter((x) => groups.has(x) && ends.some((y) => !groups.has(y) && overId(y) === x))
    .map((end) => `5: detail ${d.group} draws ${end} whole beside a stub for one of its members`);
};

const fromSuffix = (work: WorkGraph, from: string[]): string =>
  `${FROM}${work.nodes.get(from[0] ?? "")?.label ?? from[0] ?? ""}`;

// A stub for a whole group that names a member its edges leave draws only
// edges that member has: each, read from that member, is an original edge.
const fromHolds = (build: Build, d: SplitPlan["details"][number], stub: string, from: string[]): Violations => {
  if (from.length === 0) return [];
  const original = new Set(build.work.edges.map(tuple));
  const drawn = d.graph.edges.filter((e) => e.source === stub);
  const held = drawn.every((e) => from.some((m) => original.has(tuple({ ...e, source: m }))));
  return drawn.length > 0 && held ? [] : [`5: stub ${stub} of ${d.group} names a member that does not draw its edges`];
};

type Detail = SplitPlan["details"][number];

// A box of stubs (MJL-0037) and the stubs inside it, read by their form. A
// box shows the label exactly one group shows, sits at the top level, and
// stands for the region that group stands for whole, else for the group,
// when it draws no edge. A stub inside it shows the own label of exactly one
// member of that group, and stands for that member. Each is given the text
// the plan writes for its endpoint outside a box, so stubs for one endpoint
// read alike across details.
interface Boxed {
  bases: Map<string, string>;
  groupOf: Map<string, SplitGroup>;
  out: Violations;
}

const readBox = (build: Build, d: Detail, b: DiagramGraph["subgraphs"][number], into: Boxed): void => {
  const { plan, work } = build;
  const [g, ...more] = plan.groups.filter((x) => x.label === b.label);
  if (!g || more.length > 0) {
    into.out.push(`5: box ${b.id} of ${d.group}, "${b.label}", shows no one group's label`);
    return;
  }
  const region = soleRegion(work, g);
  const end = d.stubs[b.id] ?? "";
  if (end !== (region ?? g.id)) into.out.push(`5: box ${b.id} of ${d.group} reads as ${region ?? g.id}, not ${end}`);
  if (b.parent !== null) into.out.push(`5: box ${b.id} of ${d.group} sits inside ${b.parent}`);
  if (region === null && d.graph.edges.some((e) => e.source === b.id || e.target === b.id))
    into.out.push(`5: box ${b.id} of ${d.group} draws an edge for a whole group`);
  into.groupOf.set(b.id, g);
  into.bases.set(b.id, region === null ? g.label : `${endpointLabel(work, region)}${IN}${g.label})`);
};

const readInBox = (build: Build, d: Detail, n: DiagramGraph["nodes"][number], into: Boxed): void => {
  const g = into.groupOf.get(n.parent ?? "");
  if (!g) return;
  const named = g.members.filter((m) => build.work.nodes.get(m)?.label === n.label);
  if (named.length !== 1 || named[0] !== d.stubs[n.id]) {
    const read = named.join(" or ") || "nothing";
    into.out.push(
      `5: stub ${n.id} in box ${n.parent} of ${d.group}, "${n.label}", reads as ${read}, not ${d.stubs[n.id]}`,
    );
  }
  into.bases.set(n.id, `${n.label}${IN}${g.label})`);
};

const boxNames = (build: Build, d: Detail): Boxed => {
  const into: Boxed = { bases: new Map(), groupOf: new Map(), out: [] };
  for (const b of d.graph.subgraphs.filter((x) => d.stubs[x.id] !== undefined)) readBox(build, d, b, into);
  for (const n of d.graph.nodes.filter((x) => x.parent !== null)) readInBox(build, d, n, into);
  return into;
};

// A stub's text names one thing: read by every form a plan writes, against
// every label the diagram and the plan's groups show, it has exactly one
// reading, the endpoint it stands for. One endpoint always reads one text,
// but for the member FROM names on a whole group's stub drawn apart, and
// that member draws every edge the stub draws.
// One detail's stubs read, each base text handed to seen with its endpoint.
const detailNames = (
  build: Build,
  reader: ReturnType<typeof readerOf>,
  d: Detail,
  seen: (end: string, base: string) => void,
): Violations => {
  const labelOf = new Map(d.graph.nodes.map((n) => [n.id, n.label]));
  const boxed = boxNames(build, d);
  const out = [...boxed.out];
  for (const [stub, end] of Object.entries(d.stubs)) {
    const inBox = boxed.bases.get(stub);
    if (inBox !== undefined) {
      seen(end, inBox);
      continue;
    }
    const label = labelOf.get(stub) ?? "";
    const from = fromMembers(reader, label, end);
    seen(end, from.length > 0 ? label.slice(0, label.length - fromSuffix(build.work, from).length) : label);
    const read = sorted(readingsOf(reader, label));
    if (read.join("\u0000") !== end)
      out.push(`5: stub ${stub} of ${d.group}, "${label}", reads as ${read.join(" or ") || "nothing"}, not ${end}`);
    out.push(...fromHolds(build, d, stub, from));
  }
  return out;
};

const stubNames = (build: Build): Violations => {
  const { plan, work } = build;
  const groupOf = new Map(plan.groups.flatMap((g) => [...g.members, ...g.regions].map((m) => [m, g.id] as const)));
  const reader = readerOf(
    work,
    plan.groups.map((g) => ({
      id: g.id,
      label: g.label,
      base: g.labelBase,
      ...(g.markdown ? { markdown: true as const } : {}),
    })),
    (id) => groupOf.get(id),
  );
  const byEnd = new Map<string, Set<string>>();
  const seen = (end: string, base: string): void => {
    byEnd.set(end, new Set([...(byEnd.get(end) ?? []), base]));
  };
  const out = plan.details.flatMap((d) => detailNames(build, reader, d, seen));
  for (const [end, labels] of byEnd) if (labels.size > 1) out.push(`5: the stubs for ${end} read differently`);
  return out;
};

// Each node drawn with rows, and how many diagrams draw them.
const rowsDrawn = (plan: SplitPlan): Map<string, DiagramGraph["nodes"]> => {
  const drawn = new Map<string, DiagramGraph["nodes"]>();
  const graphs = [...plan.details.filter((d) => d.rows).map((d) => d.graph), ...plan.rowDetails.map((r) => r.graph)];
  for (const n of graphs.flatMap((g) => g.nodes)) if (n.rows) drawn.set(n.id, [...(drawn.get(n.id) ?? []), n]);
  return drawn;
};

// Each original node's rows come back exactly where they are drawn, and the
// declared count is what no diagram draws.
const checkRows = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = [];
  const drawn = rowsDrawn(plan);
  for (const [id, copies] of drawn) {
    const want = JSON.stringify(work.nodes.get(id)?.rows ?? []);
    if (copies.some((n) => JSON.stringify(n.rows) !== want)) out.push(`5: the rows of ${id} are not its own`);
    if (copies.length > 1) out.push(`5: the rows of ${id} are drawn ${copies.length} times`);
  }
  const shown = [...drawn.keys()].reduce((s, id) => s + (work.nodes.get(id)?.rows?.length ?? 0), 0);
  const total = [...work.nodes.values()].reduce((s, n) => s + (n.rows?.length ?? 0), 0);
  if (total !== work.rows) out.push("5: the rows read are not the rows counted");
  if (plan.loss.droppedRows !== work.rows - shown) out.push("7: the dropped rows are wrong");
  return out;
};

// 5. Overview and details give back exactly the original node ids and the
// original edges; every edge between groups is drawn from both ends, in its
// target's detail once for all edges from its group drawing alike.
const checkRecoverable = (build: Build): Violations => {
  const { plan, work } = build;
  const out = [...detailNodes(build), ...stubNames(build), ...checkRows(build)];
  const kept = plan.overview.nodes.map((n) => n.id).filter((id) => !groupIds(plan).has(id));
  const members = plan.details.flatMap((d) => d.graph.nodes.map((n) => n.id).filter((id) => d.stubs[id] === undefined));
  if (multiset([...kept, ...members]) !== multiset(work.ids)) out.push("5: the node ids do not come back exactly");
  const { exact, halves, drawnIn } = recovered(build);
  if (multiset(exact) !== multiset(work.edges.map(tuple))) out.push("5: the edges do not come back exactly");
  // A half stands for every edge between its group and its member that draws
  // alike, so it is drawn exactly once, and only for such an edge, in the
  // detail that does not draw that edge exactly.
  if (new Set(halves).size !== halves.length) out.push("5: a detail draws one edge from a group twice");
  if (multiset([...new Set(halves)]) !== multiset([...new Set(wantedHalves(build, drawnIn))]))
    out.push("5: the edges between groups do not come back from their targets");
  return out;
};

// 6. A protected node folds only inside a whole region the group folds: an
// author region, its own or, for a state a composite's marker touches, that
// composite; or a decision region holding it, single-entry single-exit in the
// original graph, every node of which the group holds.
const checkProtected = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = [];
  for (const g of plan.groups) {
    const held = new Set(g.members);
    const flows = flowRegionsOf(work).filter((r) => r.members.every((x) => held.has(x)));
    for (const m of g.members) {
      if (!work.protectedIds.has(m) || flows.some((r) => r.members.includes(m))) continue;
      const pin = work.pins.get(m) ?? homeOf(work, m);
      if (!g.regions.some((r) => regionWithin(work, pin, r))) out.push(`6: protected ${m} is folded in ${g.id}`);
    }
  }
  return out;
};

// A start or end transition the overview draws onto a group stands for
// transitions of that marker into the group's members, carries a label only
// when they all do, and every such transition is drawn onto its group.
const checkMarkers = (build: Build): Violations => {
  const { plan, work } = build;
  if (work.family !== "state") return [];
  const overId = overOf(build);
  const groups = groupIds(plan);
  const markers = new Set(work.markers.map((m) => m.id));
  const drawn = new Set((plan.overview.pseudo?.nodes ?? []).map((m) => m.id));
  const pairOf = (e: GraphEdge): [string, string] =>
    markers.has(e.source) ? [e.source, overId(e.target)] : [e.target, overId(e.source)];
  const onGroups = (plan.overview.pseudo?.edges ?? []).filter((o) => groups.has(o.source) || groups.has(o.target));
  const sound = onGroups.flatMap((o) => {
    const [m, g] = pairOf(o);
    const witnesses = work.markerEdges.filter((e) => pairOf(e).join("\u0000") === `${m}\u0000${g}`);
    if (witnesses.length === 0) return [`7: the transition of ${m} onto ${g} stands for none`];
    return o.label !== undefined && witnesses.some((e) => e.label !== o.label)
      ? [`7: the transition of ${m} onto ${g} carries a label not all of its transitions carry`]
      : [];
  });
  const shown = new Set(onGroups.map((o) => pairOf(o).join("\u0000")));
  const complete = work.markerEdges
    .map(pairOf)
    .filter(([m, g]) => drawn.has(m) && groups.has(g) && !shown.has(`${m}\u0000${g}`))
    .map(([m, g]) => `7: the transition of ${m} into ${g} is not drawn onto its group`);
  const declared =
    overviewMarkers(work, partFromGroups(plan.groups)).merged === plan.loss.mergedMarkers
      ? []
      : ["7: the declared merged start and end transitions are wrong"];
  return [...sound, ...complete, ...declared];
};

// 7. The declared loss is the loss: new reachable pairs recounted for the
// final partition and after each tier, zero after T2.
const checkLoss = (build: Build): Violations => {
  const { plan, work, snapshots } = build;
  const out: Violations = [...checkMarkers(build)];
  if (newReachablePairs(work, partFromGroups(plan.groups)) !== plan.loss.newReachablePairs)
    out.push("7: the declared new reachable pairs are wrong");
  for (const s of snapshots) {
    const n = newReachablePairs(work, partFromGroups(s.groups));
    if (plan.loss.byTier[s.tier] !== n) out.push(`7: the declared loss after ${s.tier} is wrong`);
    if (s.tier === "T2" && n !== 0) out.push("7: T2 made new reachable pairs");
  }
  return out;
};

const isSorted = <T>(xs: readonly T[], compare: (a: T, b: T) => number): boolean =>
  xs.every((x, i) => i === 0 || compare(xs[i - 1] as T, x) < 0);

// 8. The plan is in canonical order: members sorted, groups by member tuple
// and numbered in that order, kept nodes by id, edges by their ends and
// attributes, the edges between one pair of nodes side by side whichever
// way each is written, details in group order.
const checkCanonical = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = [];
  const next = idMaker(usedIds(work), "g");
  if (!plan.groups.every((g) => isSorted(g.members, byText) && isSorted(g.regions, byText)))
    out.push("8: members are not sorted");
  if (
    !isSorted(
      plan.groups.map((g) => g.members),
      byTuple,
    )
  )
    out.push("8: groups are not in member order");
  if (!plan.groups.every((g) => g.id === next())) out.push("8: group ids are not numbered in order");
  const kept = plan.overview.nodes.filter((n) => !groupIds(plan).has(n.id)).map((n) => n.id);
  if (!isSorted(kept, byText)) out.push("8: overview nodes are not sorted");
  // An edge written twice between kept nodes is drawn twice, so equal keys sit side by side.
  const edges = plan.overview.edges;
  if (!edges.every((e, i) => i === 0 || byOverviewEdge(edges[i - 1] ?? e, e) <= 0))
    out.push("8: overview edges are not sorted");
  if (plan.details.some((d, i) => d.group !== plan.groups[i]?.id)) out.push("8: details are not in group order");
  return out;
};

// A start or end transition by its marker's shape and box, the state at its
// other end and its label; mermaid names markers afresh, so not by id.
const markerElements = (graph: DiagramGraph): string[] => {
  const markers = new Map((graph.pseudo?.nodes ?? []).filter((m) => m.shape !== "lollipop").map((m) => [m.id, m]));
  return (graph.pseudo?.edges ?? []).flatMap((e) => {
    const m = markers.get(e.source) ?? markers.get(e.target);
    if (!m) return [];
    const end = markers.has(e.source) ? e.target : e.source;
    return [JSON.stringify(["marker", m.shape, m.parent, end, e.label ?? null])];
  });
};

// A graph's elements as sorted text, for comparing what an emitted source
// parses to with what was planned. A shape or kind the plan leaves to the
// type's default is not compared; a lollipop is named by its label, since
// mermaid numbers interfaces afresh.
const elements = (graph: DiagramGraph, plan: DiagramGraph): string[] => {
  const shaped = new Map(plan.nodes.map((n) => [n.id, n.shape !== undefined]));
  const kinded = new Set(plan.edges.filter((e) => e.kind !== undefined).map((e) => edgeKey({ ...e, kind: "" })));
  const named = new Map((graph.pseudo?.nodes ?? []).map((p) => [p.id, `()${p.label}`]));
  const end = (x: string): string => named.get(x) ?? x;
  return sorted([
    ...graph.nodes.map((n) =>
      JSON.stringify([
        "node",
        n.id,
        n.label,
        n.markdown ?? false,
        n.parent,
        shaped.get(n.id) ? n.shape : null,
        n.rows ?? [],
        n.descriptions ?? [],
      ]),
    ),
    ...graph.subgraphs.map((s) => JSON.stringify(["subgraph", s.id, s.label, s.markdown ?? false, s.parent])),
    ...graph.edges.map((e) => {
      const ends = { ...e, source: end(e.source), target: end(e.target) };
      const kind = kinded.has(edgeKey({ ...ends, kind: "" })) ? (e.kind ?? null) : null;
      return JSON.stringify([
        "edge",
        ends.source,
        ends.target,
        e.label ?? null,
        e.markdown ?? false,
        kind,
        e.cardinality ?? null,
      ]);
    }),
    ...markerElements(graph),
  ]);
};

const reparse = async (label: string, source: string, expect: DiagramGraph): Promise<Violations> => {
  const stats = await extractStats(source);
  if (stats.error !== null) return [`9: the ${label} does not parse: ${stats.error}`];
  const counts = [stats.nodes, stats.edges, stats.subgraphs].join("/");
  const want = [expect.nodes.length, expect.edges.length, expect.subgraphs.length].join("/");
  if (counts !== want) return [`9: the ${label} parses to ${counts} nodes/edges/subgraphs, not ${want}`];
  const got = elements(await extractGraph(source), expect);
  const planned = elements(expect, expect);
  if (got.join("\n") === planned.join("\n")) return [];
  const stray = [...got.filter((x) => !planned.includes(x)), ...planned.filter((x) => !got.includes(x))];
  return [`9: the ${label} parses to other elements than planned: ${stray.slice(0, 3).join(" ")}`];
};

const measured = async (source: string, config: ThresholdConfig): Promise<{ nodes: number; score: number }> => {
  const stats = await extractStats(source);
  return { nodes: stats.nodes, score: calculateComplexity(stats, config).visual_complexity_score };
};

const within = (m: { nodes: number; score: number }, config: ThresholdConfig): boolean =>
  m.nodes <= config.node_target && m.score <= config.vcs_target;

// One emitted source: it parses to the planned graph, measures what was
// planned, and meets the target unless it is split again.
const roundTrip = async (
  name: string,
  d: { source: string; graph: DiagramGraph; nodes: number; score: number; split?: unknown },
  config: ThresholdConfig,
): Promise<Violations> => {
  const out = await reparse(name, d.source, d.graph);
  const m = await measured(d.source, config);
  if (!(d.split || within(m, config)))
    out.push(`9: the ${name} measures ${m.nodes} nodes and ${m.score}, over the target`);
  if (m.score !== d.score || m.nodes !== d.nodes) out.push(`9: the ${name} score is not what was planned`);
  return out;
};

// 9. Every emitted source parses to the elements planned, and the overview,
// each detail and each row diagram, measured from that parse, meet the target.
const checkRoundTrip = async (build: Build, config: ThresholdConfig): Promise<Violations> => {
  const { plan } = build;
  const overview = {
    source: plan.overviewSource,
    graph: plan.overview,
    nodes: plan.overviewNodes,
    score: plan.overviewScore,
  };
  const out = await roundTrip("overview", overview, config);
  for (const d of plan.details) out.push(...(await roundTrip(`detail of ${d.group}`, d, config)));
  for (const [i, r] of plan.rowDetails.entries()) out.push(...(await roundTrip(`row diagram ${i + 1}`, r, config)));
  return out;
};

// Every check, on the plan and on each detail split again.
export const checkContract = async (build: Build, config: ThresholdConfig): Promise<Violations> => {
  const out = [
    ...(build.plan.overviewNodes < floorOf(build.work)
      ? [`9: the overview holds ${build.plan.overviewNodes} nodes, fewer than ${floorOf(build.work)}`]
      : []),
    ...checkPartition(build),
    ...checkEdges(build),
    ...checkAttributes(build),
    ...checkLabels(build),
    ...checkRecoverable(build),
    ...checkProtected(build),
    ...checkLoss(build),
    ...(JSON.stringify(ladderOf(build.work, build.snapshots, config)) === JSON.stringify(build.plan.ladder)
      ? []
      : ["7: the declared ladder is not the overview after each tier"]),
    ...checkCanonical(build),
    ...(await checkRoundTrip(build, config)),
  ];
  for (const [group, nested] of Object.entries(build.nested)) {
    const d = build.plan.details.find((x) => x.group === group);
    if (!d || d.split !== nested.plan) out.push(`5: the split of ${group} is not the plan checked`);
    out.push(...(await checkContract(nested, config)).map((v) => `${group}: ${v}`));
  }
  for (const d of build.plan.details)
    if (d.split && !build.nested[d.group]) out.push(`5: the split of ${d.group} was never checked`);
  return out;
};
