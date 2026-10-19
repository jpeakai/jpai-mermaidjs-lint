// The tier ladder. T1 always applies (rows dropped from the overview); then
// each tier in turn proposes groups, and the best one applies, by score saved
// per node hidden, then, for aggregates, by fewer overview edges, then by
// member ids in natural order. After each the
// overview is measured again, and the walk stops at the first state that
// meets node_target and vcs_target. A detail diagram must meet them too. A
// diagram with author regions is walked with T3 first, since a reader finds
// the author's own boundaries first; the default ladder is the fallback.

import type { ThresholdConfig } from "../parse/metrics.ts";
import { assemble, type Build, type Folded, type Snapshot, snapshotOf } from "./assemble.ts";
import { byNaturalTuple, byText, type WorkGraph } from "./graph.ts";
import {
  detailShape,
  detailView,
  EMPTY_PARTITION,
  type Group,
  groupOfKey,
  isGroupKey,
  keyOf,
  type Merge,
  meets,
  membersOfKey,
  merge,
  overviewShape,
  type Partition,
  parentOfKey,
  partitionOf,
  type QEdge,
  quotientEdges,
  scoreOf,
} from "./quotient.ts";
import { newReachablePairs } from "./reach.ts";
import { type FoldRules, RELAXED } from "./rules.ts";
import {
  adjacencyOf,
  type Candidate,
  foldable,
  keepsBranches,
  keepsFamilies,
  mergedGroup,
  neighboursOf,
  type TierContext,
} from "./tier.ts";
import { proposeT2 } from "./tier2.ts";
import { proposeT3 } from "./tier3.ts";
import { proposeT4 } from "./tier4.ts";
import { proposeT5 } from "./tier5.ts";
import { ID_FAMILY, proposeT6 } from "./tier6.ts";
import { FOLD_TIERS, type Tier } from "./types.ts";

// A detail may be split once more; one at the second level must fit.
export const MAX_DEPTH = 2;

// The ladder for a diagram with author regions: regions first.
export const REGIONS_FIRST: readonly Tier[] = ["T3", "T2", "T4", "T5", "T6"];

const PROPOSE: Record<Tier, (ctx: TierContext) => Candidate[]> = {
  T1: () => [],
  T2: proposeT2,
  T3: proposeT3,
  T4: proposeT4,
  T5: proposeT5,
  T6: proposeT6,
};

interface Scored {
  part: Partition;
  ratio: number;
  priority: number;
  tie: number;
  kin: number;
  members: string[];
  // The overview edges left, so at an equal saving the aggregate with fewer
  // edges between overview nodes goes first.
  edges: number;
  // The overview edges left beside another between the same two nodes, at
  // least one a group: what a reader sees as parallel lines.
  parallel: number;
}

const EPSILON = 1e-9;

const detailFits = (ctx: TierContext, part: Partition, g: Group): boolean => {
  const d = detailShape(ctx.work, detailView(ctx.work, part, g));
  return meets(d.nodes, scoreOf(d, 0, ctx.config), ctx.config);
};

// Whether every group a merge left alone, whose detail fitted, still fits:
// a merge can add a stub for a whole group to the details beside it.
const othersFit = (ctx: TierContext, part: Partition): boolean =>
  ctx.part.groups.every((g) => !(part.groups.includes(g) && detailFits(ctx, ctx.part, g)) || detailFits(ctx, part, g));

// Applies each merge of a candidate in turn, with the group each one made;
// null when a merge makes no group or, capped, a detail over the target.
const applyAll = (ctx: TierContext, merges: Merge[], capped: boolean): { part: Partition; groups: Group[] } | null => {
  let part = ctx.part;
  const groups: Group[] = [];
  for (const m of merges) {
    const next = merge(part, m);
    const g = mergedGroup(part, next, m.keys);
    if (!g) return null;
    if (capped && !detailFits(ctx, next, g)) return null;
    part = next;
    groups.push(g);
  }
  return capped && !othersFit(ctx, part) ? null : { part, groups };
};

// The fewest nodes an overview may keep: four, a chunk count a reader holds
// at once, unless the diagram has fewer than eight nodes. A fold that would
// leave fewer is not taken, so a plan keeps the overview closest to the
// target rather than a handful of huge groups.
export const MIN_OVERVIEW = 4;
const SMALL_DIAGRAM = 8;
export const floorOf = (work: WorkGraph): number => (work.ids.length < SMALL_DIAGRAM ? 1 : MIN_OVERVIEW);

// The edges beyond the first between each pair of overview nodes, whichever
// way each is written, at least one end a group.
const parallelOf = (qedges: readonly QEdge[]): number => {
  const pairs = qedges
    .filter((e) => isGroupKey(e.source) || isGroupKey(e.target))
    .map((e) => [e.source, e.target].sort(byText).join("\u0000"));
  return pairs.length - new Set(pairs).size;
};

const evaluate = (ctx: TierContext, cand: Candidate, current: number, step: Step): Scored | null => {
  const { work, config } = ctx;
  const merges = [cand, ...(cand.also ?? [])];
  const applied = applyAll(ctx, merges, step.capped);
  if (!applied) return null;
  const qedges = quotientEdges(work, applied.part);
  const shape = overviewShape(work, applied.part, qedges);
  if (shape.nodes < (step.floor ?? floorOf(work))) return null;
  const saved = current - scoreOf(shape, 0, config);
  if (saved <= EPSILON) return null;
  const hidden = merges.reduce((s, m) => s + Math.max(1, m.keys.length - 1), 0);
  if (step.lossless && newReachablePairs(work, applied.part) > newReachablePairs(work, ctx.part)) return null;
  const { before } = step;
  if (before && (before.edges - shape.edges < hidden || newReachablePairs(work, applied.part) - before.loss > hidden))
    return null;
  return {
    part: applied.part,
    ratio: saved / hidden,
    priority: cand.priority ?? 0,
    tie: cand.tie ?? 0,
    kin: cand.kin ?? 0,
    members: applied.groups[0]?.members ?? [],
    edges: shape.edges,
    parallel: parallelOf(qedges),
  };
};

// Of two aggregates that save as much, the one leaving fewer overview edges
// goes first, so fewer relationships run between groups.
const better =
  (byPriority: boolean, byEdges = false) =>
  (a: Scored, b: Scored): number => {
    if (byPriority && a.kin !== b.kin) return b.kin - a.kin;
    if (byPriority && Math.abs(a.priority - b.priority) > EPSILON) return b.priority - a.priority;
    if (byPriority && Math.abs(a.tie - b.tie) > EPSILON) return b.tie - a.tie;
    if (Math.abs(a.ratio - b.ratio) > EPSILON) return b.ratio - a.ratio;
    if (byEdges && a.edges !== b.edges) return a.edges - b.edges;
    return byNaturalTuple(a.members, b.members);
  };

// How one tier is walked: whether its details are held to the target, and
// which of its candidates it may take.
interface Step {
  tier: Tier;
  capped: boolean;
  only?: (c: Candidate) => boolean;
  // The fewest overview nodes a fold may leave, floorOf by default.
  floor?: number;
  // The overview before the step, when a fold must take away at least one
  // overview edge for each node it hides, and add no more new reachable
  // pairs than nodes it hides.
  before?: { edges: number; loss: number };
  // Whether a fold may add no new reachable pair.
  lossless?: boolean;
}

const bestStep = (ctx: TierContext, step: Step, current: number): Scored | null => {
  const { tier, only = () => true } = step;
  const scored = PROPOSE[tier]({ ...ctx, uncapped: !step.capped })
    .filter(only)
    .map((c) => evaluate(ctx, c, current, step))
    .filter((s): s is Scored => s !== null);
  const ranked = scored.sort(better(tier === "T6", tier === "T4"));
  return NEAR_TIERS.has(tier) ? nearest(ranked, tier === "T6") : (ranked[0] ?? null);
};

// How near a candidate's saving (or, in T6, its gain) must come to the best
// one's, as a share of it, to count as nearly equal.
export const NEAR = 0.05;
const NEAR_TIERS: ReadonlySet<Tier> = new Set(["T4", "T5", "T6"]);

// Of the candidates nearly as good as the best, in T6 of the same kin, the
// first leaving the fewest parallel overview edges: a plan then draws fewer
// relationships side by side between groups at a saving nearly as large.
const nearest = (ranked: Scored[], byPriority: boolean): Scored | null => {
  const top = ranked[0];
  if (!top) return null;
  const primary = (x: Scored): number => (byPriority ? x.priority : x.ratio);
  const slack = Math.max(EPSILON, NEAR * Math.abs(primary(top)));
  const near = ranked.filter((x) => (!byPriority || x.kin === top.kin) && primary(top) - primary(x) <= slack);
  return near.reduce((best, x) => (x.parallel < best.parallel ? x : best), top);
};

interface Measure {
  ctx: TierContext;
  nodes: number;
  score: number;
}

const measure = (work: WorkGraph, part: Partition, config: ThresholdConfig, rules: FoldRules): Measure => {
  const qedges = quotientEdges(work, part);
  const shape = overviewShape(work, part, qedges);
  return { ctx: { work, part, config, qedges, rules }, nodes: shape.nodes, score: scoreOf(shape, 0, config) };
};

export interface Walk {
  order: readonly Tier[];
  // Holds author regions to details that fit, as every other tier is held.
  capT3: boolean;
  // What T5 and T6 may not fold.
  rules: FoldRules;
  // Lets the evening steps go below evenFloorOf, down to floorOf, for a
  // diagram whose details fit only when more of it folds.
  deep?: boolean;
  // Folds an author region only when that adds no new reachable pair.
  lossless?: boolean;
}

// The share of node_target an evening step must leave in the overview, so a
// plan lands near its target rather than far below it.
export const EVEN_SHARE = 0.6;

export const evenFloorOf = (work: WorkGraph, config: ThresholdConfig): number =>
  Math.max(floorOf(work), Math.ceil(EVEN_SHARE * config.node_target));

const membersIn = (part: Partition, c: Candidate): number =>
  c.keys.reduce((n, k) => n + membersOfKey(part, k).length, 0);

// The candidates a tier may still take once the target is met, so the plan
// folds evenly. T3: the regions beside the ones folded, so sibling regions
// show alike. T5 and T6: merges no larger than the largest group and hiding
// as many nodes as the rules ask, so the nodes left open gather into groups
// of about the same size.
const evenOut = (
  part: Partition,
  tier: Tier,
  rules: FoldRules,
  work: WorkGraph,
): ((c: Candidate) => boolean) | null => {
  if (tier === "T4") return tangled(work, part) ? () => true : null;
  if (tier === "T2") {
    return part.groups.some((g) => g.reason === "decision region") ? (c) => c.reason === "decision region" : null;
  }
  if (tier === "T3") {
    const parents = new Set(part.groups.filter((g) => g.tier === "T3").map((g) => g.parent));
    return (c) => parents.has(c.parent) && c.keys.length > 1;
  }
  if (tier !== "T5" && tier !== "T6") return null;
  if (byFamilies(part)) return (c) => c.reason === ID_FAMILY;
  const largest = Math.max(0, ...part.groups.map((g) => g.members.length));
  return (c) => {
    const n = membersIn(part, c);
    return n <= largest && n > rules.minHidden;
  };
};

// Whether the plan folds id families, which then fold whole or not at all:
// the evening takes only the families still open, down to floorOf, since a
// family half folded or left open reads as scattered.
const byFamilies = (part: Partition): boolean => part.groups.some((g) => g.reason === ID_FAMILY);

// An overview a reader meets a cycle in for every MIN_OVERVIEW nodes, a
// chunk held at once: its independent cycles, edges less nodes plus one,
// number at least a quarter of its nodes. A tree-like overview is read as it
// is; a tangled one still reads better with its aggregates folded.
export const tangled = (work: WorkGraph, part: Partition): boolean => {
  const shape = overviewShape(work, part, quotientEdges(work, part));
  return MIN_OVERVIEW * (shape.edges - shape.nodes + 1) >= shape.nodes;
};

// Takes what evenOut allows, one best step at a time, while the overview
// keeps at least evenFloorOf nodes.
const foldEvenly = (start: Measure, step: Step, deep: boolean): Measure => {
  const { work, config, rules } = start.ctx;
  const floor = deep || byFamilies(start.ctx.part) ? floorOf(work) : evenFloorOf(work, config);
  let m = start;
  for (
    let only = evenOut(m.ctx.part, step.tier, rules, work);
    only;
    only = evenOut(m.ctx.part, step.tier, rules, work)
  ) {
    const before =
      step.tier === "T4" ? { edges: m.ctx.qedges.length, loss: newReachablePairs(work, m.ctx.part) } : undefined;
    const best = bestStep(m.ctx, { ...step, only, floor, ...(before ? { before } : {}) }, m.score);
    if (!best) break;
    m = measure(work, best.part, config, rules);
  }
  return m;
};

const LEAF_TIERS: ReadonlySet<Tier> = new Set(["T5", "T6"]);

// A T5 or T6 group, or a decision region, hiding fewer nodes than the rules
// ask, not yet given up on.
const smallGroup = (m: Measure, stuck: Set<string>): Group | undefined =>
  m.ctx.part.groups.find(
    (g) =>
      (LEAF_TIERS.has(g.tier) || g.reason === "decision region") &&
      g.members.length - 1 < m.ctx.rules.minHidden &&
      !stuck.has(keyOf(g)),
  );

// The overview without the group, when it still meets the target and every
// detail that fitted still fits, since the nodes given back become stubs.
const undo = (m: Measure, g: Group): Measure | null => {
  const { work, config, rules } = m.ctx;
  const next = measure(work, partitionOf(m.ctx.part.groups.filter((x) => x !== g)), config, rules);
  if (!meets(next.nodes, next.score, config)) return null;
  const broken = next.ctx.part.groups.some(
    (x) => detailFits(m.ctx, m.ctx.part, x) && !detailFits(next.ctx, next.ctx.part, x),
  );
  return broken ? null : next;
};

// The group merged with the neighbour that saves the most score per node
// hidden: a node T6 may fold, or another T5 or T6 group, in the same region.
const grow = (m: Measure, g: Group): Measure | null => {
  const { ctx } = m;
  const key = keyOf(g);
  const joinable = (k: string): boolean => {
    const other = groupOfKey(ctx.part, k);
    const kind = other ? LEAF_TIERS.has(other.tier) : foldable(ctx, k);
    const near = parentOfKey(ctx.work, ctx.part, k) === g.parent;
    return kind && near && keepsBranches(ctx, [key, k]) && keepsFamilies(ctx, [key, k]);
  };
  const step: Step = { tier: g.tier, capped: true };
  const best = [...neighboursOf(adjacencyOf(ctx.qedges), key)]
    .filter(joinable)
    .map((k) => evaluate(ctx, { keys: [key, k], parent: g.parent, tier: g.tier, reason: g.reason }, m.score, step))
    .filter((s): s is Scored => s !== null)
    .sort(better(false))[0];
  return best ? measure(ctx.work, best.part, ctx.config, ctx.rules) : null;
};

// Each T5 or T6 group hiding fewer nodes than the rules ask is undone when
// the overview meets the target without it, else grown into a neighbour. One
// that can be neither stays, since the target cannot be met otherwise. A
// decision region hiding one node is only undone: grown, it would no longer
// be a region.
const tidy = (start: Measure): Measure => {
  let m = start;
  const stuck = new Set<string>();
  for (let g = smallGroup(m, stuck); g; g = smallGroup(m, stuck)) {
    const next = undo(m, g) ?? (LEAF_TIERS.has(g.tier) ? grow(m, g) : null);
    if (next) m = next;
    else stuck.add(keyOf(g));
  }
  return m;
};

// A greedy walk can overshoot: an early fold that saved the most per node
// leaves a later one needed, and the two together leave the overview below
// evenFloorOf. While it is below, the group whose undoing gives back the most
// nodes and still meets the target, every fitting detail still fitting, is
// undone, so the overview lands nearest its target. A T2 group is one run of
// a pattern folded evenly (twins, sibling leaves, chain stages), so it stays:
// undone alone, it would leave its pattern half folded.
const loosen = (start: Measure): Measure => {
  const floor = evenFloorOf(start.ctx.work, start.ctx.config);
  let m = start;
  while (m.nodes < floor) {
    const best = m.ctx.part.groups
      .filter((g) => g.tier !== "T2" && g.reason !== ID_FAMILY)
      .flatMap((g) => {
        const next = undo(m, g);
        return next ? [{ next, members: g.members }] : [];
      })
      .sort((a, b) => b.next.nodes - a.next.nodes || byNaturalTuple(a.members, b.members))[0];
    if (!best) break;
    m = best.next;
  }
  return m;
};

// An erDiagram that meets the target with rows dropped alone still draws
// every entity and relationship: it folds aggregates evenly too, each fold
// taking away an overview edge for every entity it hides, so the overview
// gains the structure its aggregates give it. Any other diagram stays at T1.
const aggregatesToo = (start: Measure, snapshots: Snapshot[], walk: Walk): Folded => {
  const { work } = start.ctx;
  const done: Folded = { work, part: EMPTY_PARTITION, snapshots, tier: "T1" };
  if (work.family !== "er" || !walk.order.includes("T4")) return done;
  const m = foldEvenly(start, { tier: "T4", capped: true }, false);
  return m.ctx.part.groups.length === 0
    ? done
    : { work, part: m.ctx.part, snapshots: [...snapshots, snapshotOf("T4", m.ctx.part)], tier: "T4" };
};

// How a walk climbs one tier: held to details that fit but for author regions
// and aggregates on a walk letting them fold whatever their size, and in T3
// adding no new reachable pair when the walk asks.
const stepOf = (t: Tier, walk: Walk): Step => {
  const capped = (t !== "T3" && t !== "T4") || walk.capT3;
  return { tier: t, capped, ...(walk.lossless && t === "T3" ? { lossless: true } : {}) };
};

// Folds tier by tier until the overview meets the target, or returns why not.
export const foldToTarget = (work: WorkGraph, config: ThresholdConfig, walk: Walk): Folded | string => {
  let m = measure(work, EMPTY_PARTITION, config, walk.rules);
  const snapshots: Snapshot[] = [snapshotOf("T1", EMPTY_PARTITION)];
  if (meets(m.nodes, m.score, config)) return aggregatesToo(m, snapshots, walk);
  let tier: Tier = "T1";
  for (const t of walk.order) {
    const step = stepOf(t, walk);
    for (let best = bestStep(m.ctx, step, m.score); best; ) {
      m = measure(work, best.part, config, walk.rules);
      tier = t;
      if (meets(m.nodes, m.score, config)) {
        m = tidy(foldEvenly(m, step, walk.deep === true));
        if (walk.deep !== true) m = loosen(m);
        return { work, part: m.ctx.part, snapshots: [...snapshots, snapshotOf(t, m.ctx.part)], tier };
      }
      best = bestStep(m.ctx, step, m.score);
    }
    snapshots.push(snapshotOf(t, m.ctx.part));
  }
  return `no tier reaches the target: the overview stops at ${m.nodes} nodes and a score of ${m.score}`;
};

// The new reachable pairs a build's details split again declare, at every depth.
export const nestedLoss = (build: Build): number =>
  Object.values(build.nested).reduce((n, b) => n + b.plan.loss.newReachablePairs + nestedLoss(b), 0);

// The new reachable pairs a build declares, its own and its details'.
const totalLoss = (build: Build): number => build.plan.loss.newReachablePairs + nestedLoss(build);

// The plan holding author regions to details that fit, folding first only
// regions that add no new reachable pair, which a plan whose details split
// again with new reachable pairs gives way to when it declares fewer in all:
// a reader then finds every relationship of a region where it is drawn.
const fitting = (build: (capT3: boolean, deep: boolean, lossless?: boolean) => Build | string, split: Build): Build => {
  const held = [build(true, false, true), build(true, false)].find((b): b is Build => typeof b !== "string");
  return held && totalLoss(held) < totalLoss(split) ? held : split;
};

// Plans a working graph along one ladder under one set of rules: first
// letting author regions fold whatever their size, splitting a large detail
// again, then, if that fails, holding them to details that fit.
const planWith = (
  work: WorkGraph,
  config: ThresholdConfig,
  depth: number,
  walk: Pick<Walk, "order" | "rules">,
): Build | string => {
  const { order } = walk;
  const reasons: string[] = [];
  const build = (capT3: boolean, deep: boolean, lossless = false): Build | string => {
    const folded = foldToTarget(work, config, { ...walk, capT3, deep, lossless });
    return typeof folded === "string"
      ? folded
      : assemble(folded, config, (detail) =>
          depth >= MAX_DEPTH ? "the split depth is exhausted" : planWork(detail, config, depth + 1, order),
        );
  };
  for (const capT3 of depth >= MAX_DEPTH ? [true] : [false, true]) {
    const built = build(capT3, false);
    if (typeof built !== "string") return capT3 || nestedLoss(built) === 0 ? built : fitting(build, built);
    // A detail that fits only when more of the diagram folds: even out
    // further, below evenFloorOf, rather than offer no plan.
    const deeper = build(capT3, true);
    if (typeof deeper !== "string") return deeper;
    if (!reasons.includes(built)) reasons.push(built);
  }
  return reasons.join("; then, holding regions to details that fit, ");
};

// Plans a working graph along one ladder, holding T5 and T6 to the strict
// rules first and relaxing them only when that gives no plan.
export const planWork = (
  work: WorkGraph,
  config: ThresholdConfig,
  depth: number,
  order: readonly Tier[] = FOLD_TIERS,
): Build | string => {
  let reason = "";
  for (const rules of RELAXED) {
    const built = planWith(work, config, depth, { order, rules });
    if (typeof built !== "string") return built;
    reason = built;
  }
  return reason;
};

// The ladders a diagram is walked along, preferred first.
export const laddersOf = (work: WorkGraph): Array<readonly Tier[]> =>
  work.regionIds.length > 0 ? [REGIONS_FIRST, FOLD_TIERS] : [FOLD_TIERS];
