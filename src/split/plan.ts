// The tier ladder. T1 always applies (rows dropped from the overview); then
// each tier in turn proposes groups, and the best one applies, by score saved
// per node hidden, then by fewer overview edges, then by member ids in
// natural order. After each the
// overview is measured again, and the walk stops at the first state that
// meets node_target and vcs_target. A detail diagram must meet them too. A
// diagram with author regions is walked with T3 first, since a reader finds
// the author's own boundaries first; the default ladder is the fallback.

import type { ThresholdConfig } from "../parse/metrics.ts";
import { assemble, type Build, type Folded, type Snapshot, snapshotOf } from "./assemble.ts";
import { byNaturalTuple, type WorkGraph } from "./graph.ts";
import {
  detailShape,
  detailView,
  EMPTY_PARTITION,
  type Group,
  groupOfKey,
  keyOf,
  type Merge,
  meets,
  membersOfKey,
  merge,
  overviewShape,
  type Partition,
  parentOfKey,
  partitionOf,
  quotientEdges,
  scoreOf,
} from "./quotient.ts";
import { type FoldRules, RELAXED } from "./rules.ts";
import {
  adjacencyOf,
  type Candidate,
  foldable,
  keepsBranches,
  mergedGroup,
  neighboursOf,
  type TierContext,
} from "./tier.ts";
import { proposeT2 } from "./tier2.ts";
import { proposeT3 } from "./tier3.ts";
import { proposeT4 } from "./tier4.ts";
import { proposeT5 } from "./tier5.ts";
import { proposeT6 } from "./tier6.ts";
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
  members: string[];
  // The overview edges left, so at an equal saving the fold with fewer edges
  // between overview nodes goes first.
  edges: number;
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

const evaluate = (ctx: TierContext, cand: Candidate, current: number, step: Step): Scored | null => {
  const { work, config } = ctx;
  const merges = [cand, ...(cand.also ?? [])];
  const applied = applyAll(ctx, merges, step.capped);
  if (!applied) return null;
  const shape = overviewShape(work, applied.part, quotientEdges(work, applied.part));
  if (shape.nodes < (step.floor ?? floorOf(work))) return null;
  const saved = current - scoreOf(shape, 0, config);
  if (saved <= EPSILON) return null;
  const hidden = merges.reduce((s, m) => s + Math.max(1, m.keys.length - 1), 0);
  return {
    part: applied.part,
    ratio: saved / hidden,
    priority: cand.priority ?? 0,
    tie: cand.tie ?? 0,
    members: applied.groups[0]?.members ?? [],
    edges: shape.edges,
  };
};

const better =
  (byPriority: boolean) =>
  (a: Scored, b: Scored): number => {
    if (byPriority && Math.abs(a.priority - b.priority) > EPSILON) return b.priority - a.priority;
    if (byPriority && Math.abs(a.tie - b.tie) > EPSILON) return b.tie - a.tie;
    if (Math.abs(a.ratio - b.ratio) > EPSILON) return b.ratio - a.ratio;
    if (a.edges !== b.edges) return a.edges - b.edges;
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
}

const bestStep = (ctx: TierContext, step: Step, current: number): Scored | null => {
  const { tier, only = () => true } = step;
  const scored = PROPOSE[tier]({ ...ctx, uncapped: !step.capped })
    .filter(only)
    .map((c) => evaluate(ctx, c, current, step))
    .filter((s): s is Scored => s !== null);
  return scored.sort(better(tier === "T6"))[0] ?? null;
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
const evenOut = (part: Partition, tier: Tier, rules: FoldRules): ((c: Candidate) => boolean) | null => {
  if (tier === "T2") {
    return part.groups.some((g) => g.reason === "decision region") ? (c) => c.reason === "decision region" : null;
  }
  if (tier === "T3") {
    const parents = new Set(part.groups.filter((g) => g.tier === "T3").map((g) => g.parent));
    return (c) => parents.has(c.parent) && c.keys.length > 1;
  }
  if (tier !== "T5" && tier !== "T6") return null;
  const largest = Math.max(0, ...part.groups.map((g) => g.members.length));
  return (c) => {
    const n = membersIn(part, c);
    return n <= largest && n > rules.minHidden;
  };
};

// Takes what evenOut allows, one best step at a time, while the overview
// keeps at least evenFloorOf nodes.
const foldEvenly = (start: Measure, step: Step, deep: boolean): Measure => {
  const { work, config, rules } = start.ctx;
  const floor = deep ? floorOf(work) : evenFloorOf(work, config);
  let m = start;
  for (let only = evenOut(m.ctx.part, step.tier, rules); only; only = evenOut(m.ctx.part, step.tier, rules)) {
    const best = bestStep(m.ctx, { ...step, only, floor }, m.score);
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
    return kind && parentOfKey(ctx.work, ctx.part, k) === g.parent && keepsBranches(ctx, [key, k]);
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

// Folds tier by tier until the overview meets the target, or returns why not.
export const foldToTarget = (work: WorkGraph, config: ThresholdConfig, walk: Walk): Folded | string => {
  let m = measure(work, EMPTY_PARTITION, config, walk.rules);
  const snapshots: Snapshot[] = [snapshotOf("T1", EMPTY_PARTITION)];
  if (meets(m.nodes, m.score, config)) return { work, part: EMPTY_PARTITION, snapshots, tier: "T1" };
  let tier: Tier = "T1";
  for (const t of walk.order) {
    const capped = (t !== "T3" && t !== "T4") || walk.capT3;
    const step: Step = { tier: t, capped };
    for (let best = bestStep(m.ctx, step, m.score); best; ) {
      m = measure(work, best.part, config, walk.rules);
      tier = t;
      if (meets(m.nodes, m.score, config)) {
        m = tidy(foldEvenly(m, step, walk.deep === true));
        return { work, part: m.ctx.part, snapshots: [...snapshots, snapshotOf(t, m.ctx.part)], tier };
      }
      best = bestStep(m.ctx, step, m.score);
    }
    snapshots.push(snapshotOf(t, m.ctx.part));
  }
  return `no tier reaches the target: the overview stops at ${m.nodes} nodes and a score of ${m.score}`;
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
  const build = (capT3: boolean, deep: boolean): Build | string => {
    const folded = foldToTarget(work, config, { ...walk, capT3, deep });
    return typeof folded === "string"
      ? folded
      : assemble(folded, config, (detail) =>
          depth >= MAX_DEPTH ? "the split depth is exhausted" : planWork(detail, config, depth + 1, order),
        );
  };
  for (const capT3 of depth >= MAX_DEPTH ? [true] : [false, true]) {
    const built = build(capT3, false);
    if (typeof built !== "string") return built;
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
