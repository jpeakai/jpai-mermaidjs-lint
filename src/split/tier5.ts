// T5, iterated leaf folding: a node whose only neighbour is one other node
// folds into that attachment node, with as many such leaves as fit one detail.
// Run again on the result, it peels the graph toward its 2-core. A hub the
// rules keep in view stays its own node, and its leaves fold beside it.

import { byNatural } from "./graph.ts";
import { isGroupKey, overviewKeys, parentOfKey } from "./quotient.ts";
import {
  adjacencyOf,
  type Candidate,
  chunksThatFit,
  familyOf,
  foldable,
  groupable,
  keepsBranches,
  keepsFamilies,
  keptHub,
  neighboursOf,
  type TierContext,
} from "./tier.ts";

// The leaves that keep to the anchor's prefix family, when the rules ask:
// the anchor's own, or for a hub or an anchor naming none, the first leaf's.
const kin = (ctx: TierContext, anchor: string | null, leaves: string[]): string[] => {
  if (!ctx.rules.keepFamilies) return leaves;
  const of = (k: string): string | null => (isGroupKey(k) ? null : familyOf(ctx.work, k));
  const family = (anchor === null ? null : of(anchor)) ?? leaves.map(of).find((f) => f !== null) ?? null;
  return leaves.filter(
    (k) => keepsFamilies(ctx, anchor === null ? [k] : [anchor, k]) && [null, family].includes(of(k)),
  );
};

export const proposeT5 = (ctx: TierContext): Candidate[] => {
  const adj = adjacencyOf(ctx.qedges);
  const leaves = new Map<string, string[]>();
  for (const key of overviewKeys(ctx.work, ctx.part)) {
    const around = [...neighboursOf(adj, key)];
    const anchor = around[0];
    if (around.length !== 1 || anchor === undefined || !foldable(ctx, key) || !groupable(ctx, anchor)) continue;
    if (parentOfKey(ctx.work, ctx.part, key) !== parentOfKey(ctx.work, ctx.part, anchor)) continue;
    leaves.set(anchor, [...(leaves.get(anchor) ?? []), key]);
  }
  return [...leaves.keys()].sort(byNatural).flatMap((anchor) => {
    const hub = keptHub(ctx, anchor);
    const own = kin(ctx, hub ? null : anchor, (leaves.get(anchor) ?? []).filter((k) => k !== anchor).sort(byNatural));
    // An erDiagram never merges two labels, so leaves folded beside a hub
    // would draw every edge again between the hub and the group.
    if (hub && ctx.work.family === "er") return [];
    const keys = hub ? own : [anchor, ...own];
    const parent = parentOfKey(ctx.work, ctx.part, anchor);
    return chunksThatFit(ctx, keys, { parent, tier: "T5", reason: "leaf fold" })
      .slice(0, 1)
      .filter((c) => (hub || c.keys[0] === anchor) && keepsBranches(ctx, c.keys));
  });
};
