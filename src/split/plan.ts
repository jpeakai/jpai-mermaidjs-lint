// The tier ladder. T1 always applies (rows dropped, exact duplicate edges
// merged); then each tier in turn proposes groups, and the best one applies,
// by score saved per node hidden, ties by sorted member ids. After each the
// overview is measured again, and the walk stops at the first state that
// meets node_target and vcs_target. A detail diagram must meet them too.

import type { ThresholdConfig } from "../parse/metrics.ts";
import { assemble, type Build, type Folded, type Snapshot, snapshotOf } from "./assemble.ts";
import { byTuple, type WorkGraph } from "./graph.ts";
import {
  detailShape,
  detailView,
  EMPTY_PARTITION,
  meets,
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

const evaluate = (ctx: TierContext, cand: Candidate, current: number, capped: boolean): Scored | null => {
  const { work, config } = ctx;
  const next = merge(ctx.part, cand);
  const g = mergedGroup(ctx.part, next, cand.keys);
  if (!g) return null;
  if (capped) {
    const d = detailShape(work, detailView(work, next, g));
    if (!meets(d.nodes, scoreOf(d, 0, config), config)) return null;
  }
  const saved = current - scoreOf(overviewShape(work, next, quotientEdges(work, next)), 0, config);
  if (saved <= EPSILON) return null;
  return {
    part: next,
    ratio: saved / Math.max(1, cand.keys.length - 1),
    priority: cand.priority ?? 0,
    members: g.members,
  };
};

const better =
  (byPriority: boolean) =>
  (a: Scored, b: Scored): number => {
    if (byPriority && Math.abs(a.priority - b.priority) > EPSILON) return b.priority - a.priority;
    if (Math.abs(a.ratio - b.ratio) > EPSILON) return b.ratio - a.ratio;
    return byTuple(a.members, b.members);
  };

const bestStep = (ctx: TierContext, tier: Tier, current: number, capped: boolean): Scored | null => {
  const scored = PROPOSE[tier](ctx)
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

// Folds tier by tier until the overview meets the target, or returns why not.
// capT3 holds author regions to details that fit, as every other tier is held.
export const foldToTarget = (work: WorkGraph, config: ThresholdConfig, capT3: boolean): Folded | string => {
  let m = measure(work, EMPTY_PARTITION, config);
  const snapshots: Snapshot[] = [snapshotOf("T1", EMPTY_PARTITION)];
  if (meets(m.nodes, m.score, config)) return { work, part: EMPTY_PARTITION, snapshots, tier: "T1" };
  let tier: Tier = "T1";
  for (const t of FOLD_TIERS) {
    for (let best = bestStep(m.ctx, t, m.score, t !== "T3" || capT3); best; ) {
      m = measure(work, best.part, config);
      tier = t;
      if (meets(m.nodes, m.score, config))
        return { work, part: m.ctx.part, snapshots: [...snapshots, snapshotOf(t, m.ctx.part)], tier };
      best = bestStep(m.ctx, t, m.score, t !== "T3" || capT3);
    }
    snapshots.push(snapshotOf(t, m.ctx.part));
  }
  return `no tier reaches the target: the overview stops at ${m.nodes} nodes and a score of ${m.score}`;
};

// Plans a working graph: first letting author regions fold whatever their
// size, splitting a large detail again, then, if that fails, holding them to
// details that fit.
export const planWork = (work: WorkGraph, config: ThresholdConfig, depth: number): Build | string => {
  const capAlways = depth >= MAX_DEPTH;
  const reasons: string[] = [];
  for (const capT3 of capAlways ? [true] : [false, true]) {
    const folded = foldToTarget(work, config, capT3);
    const built =
      typeof folded === "string"
        ? folded
        : assemble(folded, config, (detail) =>
            depth >= MAX_DEPTH ? "the split depth is exhausted" : planWork(detail, config, depth + 1),
          );
    if (typeof built !== "string") return built;
    if (!reasons.includes(built)) reasons.push(built);
  }
  return reasons.join("; then, holding regions to details that fit, ");
};
