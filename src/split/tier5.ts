// T5, iterated leaf folding: a node whose only neighbour is one other node
// folds into that attachment node, with as many such leaves as fit one detail.
// Run again on the result, it peels the graph toward its 2-core. A hub the
// rules keep in view stays its own node, and its leaves fold beside it.

import { byNatural } from "./graph.ts";
import { overviewKeys, parentOfKey } from "./quotient.ts";
import {
  adjacencyOf,
  type Candidate,
  chunksThatFit,
  foldable,
  groupable,
  keepsBranches,
  keptHub,
  neighboursOf,
  type TierContext,
} from "./tier.ts";

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
    const own = (leaves.get(anchor) ?? []).filter((k) => k !== anchor).sort(byNatural);
    const hub = keptHub(ctx, anchor);
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
