// The tier ladder. T1 always applies (rows dropped from the overview); then
// each tier in turn proposes groups, and the best one applies, by score saved
// per node hidden, ties by member ids in natural order. After each the
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
  type Merge,
  meets,
  membersOfKey,
  merge,
  overviewShape,
  type Partition,
  quotientEdges,
  scoreOf,
} from "./quotient.ts";
import { type Candidate, mergedGroup, type TierContext } from "./tier.ts";
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
  members: string[];
}

const EPSILON = 1e-9;

// Applies each merge of a candidate in turn, with the group each one made;
// null when a merge makes no group or, capped, a detail over the target.
const applyAll = (ctx: TierContext, merges: Merge[], capped: boolean): { part: Partition; groups: Group[] } | null => {
  let part = ctx.part;
  const groups: Group[] = [];
  for (const m of merges) {
    const next = merge(part, m);
    const g = mergedGroup(part, next, m.keys);
    if (!g) return null;
    if (capped) {
      const d = detailShape(ctx.work, detailView(ctx.work, next, g));
      if (!meets(d.nodes, scoreOf(d, 0, ctx.config), ctx.config)) return null;
    }
    part = next;
    groups.push(g);
  }
  return { part, groups };
};

const evaluate = (ctx: TierContext, cand: Candidate, current: number, capped: boolean): Scored | null => {
  const { work, config } = ctx;
  const merges = [cand, ...(cand.also ?? [])];
  const applied = applyAll(ctx, merges, capped);
  if (!applied) return null;
  const saved = current - scoreOf(overviewShape(work, applied.part, quotientEdges(work, applied.part)), 0, config);
  if (saved <= EPSILON) return null;
  const hidden = merges.reduce((s, m) => s + Math.max(1, m.keys.length - 1), 0);
  return {
    part: applied.part,
    ratio: saved / hidden,
    priority: cand.priority ?? 0,
    members: applied.groups[0]?.members ?? [],
  };
};

const better =
  (byPriority: boolean) =>
  (a: Scored, b: Scored): number => {
    if (byPriority && Math.abs(a.priority - b.priority) > EPSILON) return b.priority - a.priority;
    if (Math.abs(a.ratio - b.ratio) > EPSILON) return b.ratio - a.ratio;
    return byNaturalTuple(a.members, b.members);
  };

// How one tier is walked: whether its details are held to the target, and
// which of its candidates it may take.
interface Step {
  tier: Tier;
  capped: boolean;
  only?: (c: Candidate) => boolean;
}

const bestStep = (ctx: TierContext, step: Step, current: number): Scored | null => {
  const { tier, capped, only = () => true } = step;
  const scored = PROPOSE[tier](ctx)
    .filter(only)
    .map((c) => evaluate(ctx, c, current, capped))
    .filter((s): s is Scored => s !== null);
  return scored.sort(better(tier === "T6"))[0] ?? null;
};

interface Measure {
  ctx: TierContext;
  nodes: number;
  score: number;
}

const measure = (work: WorkGraph, part: Partition, config: ThresholdConfig): Measure => {
  const qedges = quotientEdges(work, part);
  const shape = overviewShape(work, part, qedges);
  return { ctx: { work, part, config, qedges }, nodes: shape.nodes, score: scoreOf(shape, 0, config) };
};

export interface Walk {
  order: readonly Tier[];
  // Holds author regions to details that fit, as every other tier is held.
  capT3: boolean;
}

// The candidates a tier may still take once the target is met, so the plan
// folds evenly. T3: the regions beside the ones folded, so every sibling
// region shows as one node, not some folded and some open. T5 and T6: merges
// no larger than the largest group, so the nodes left open gather into
// groups of the same size.
const evenOut = (part: Partition, tier: Tier): ((c: Candidate) => boolean) | null => {
  if (tier === "T3") {
    const parents = new Set(part.groups.filter((g) => g.tier === "T3").map((g) => g.parent));
    return (c) => parents.has(c.parent) && c.keys.length > 1;
  }
  if (tier !== "T5" && tier !== "T6") return null;
  const largest = Math.max(0, ...part.groups.map((g) => g.members.length));
  return (c) => c.keys.reduce((n, k) => n + membersOfKey(part, k).length, 0) <= largest;
};

// Takes what evenOut allows, one best step at a time.
const foldEvenly = (start: Measure, config: ThresholdConfig, step: Step): Measure => {
  let m = start;
  for (let only = evenOut(m.ctx.part, step.tier); only; only = evenOut(m.ctx.part, step.tier)) {
    const best = bestStep(m.ctx, { ...step, only }, m.score);
    if (!best) break;
    m = measure(m.ctx.work, best.part, config);
  }
  return m;
};

// Folds tier by tier until the overview meets the target, or returns why not.
export const foldToTarget = (work: WorkGraph, config: ThresholdConfig, walk: Walk): Folded | string => {
  let m = measure(work, EMPTY_PARTITION, config);
  const snapshots: Snapshot[] = [snapshotOf("T1", EMPTY_PARTITION)];
  if (meets(m.nodes, m.score, config)) return { work, part: EMPTY_PARTITION, snapshots, tier: "T1" };
  let tier: Tier = "T1";
  for (const t of walk.order) {
    const capped = t !== "T3" || walk.capT3;
    const step: Step = { tier: t, capped };
    for (let best = bestStep(m.ctx, step, m.score); best; ) {
      m = measure(work, best.part, config);
      tier = t;
      if (meets(m.nodes, m.score, config)) {
        m = foldEvenly(m, config, step);
        return { work, part: m.ctx.part, snapshots: [...snapshots, snapshotOf(t, m.ctx.part)], tier };
      }
      best = bestStep(m.ctx, step, m.score);
    }
    snapshots.push(snapshotOf(t, m.ctx.part));
  }
  return `no tier reaches the target: the overview stops at ${m.nodes} nodes and a score of ${m.score}`;
};

// Plans a working graph along one ladder: first letting author regions fold
// whatever their size, splitting a large detail again, then, if that fails,
// holding them to details that fit.
export const planWork = (
  work: WorkGraph,
  config: ThresholdConfig,
  depth: number,
  order: readonly Tier[] = FOLD_TIERS,
): Build | string => {
  const reasons: string[] = [];
  for (const capT3 of depth >= MAX_DEPTH ? [true] : [false, true]) {
    const folded = foldToTarget(work, config, { order, capT3 });
    const built =
      typeof folded === "string"
        ? folded
        : assemble(folded, config, (detail) =>
            depth >= MAX_DEPTH ? "the split depth is exhausted" : planWork(detail, config, depth + 1, order),
          );
    if (typeof built !== "string") return built;
    if (!reasons.includes(built)) reasons.push(built);
  }
  return reasons.join("; then, holding regions to details that fit, ");
};

// The ladders a diagram is walked along, preferred first.
export const laddersOf = (work: WorkGraph): Array<readonly Tier[]> =>
  work.regionIds.length > 0 ? [REGIONS_FIRST, FOLD_TIERS] : [FOLD_TIERS];
