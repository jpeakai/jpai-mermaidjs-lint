// T6, suggested grouping: greedy modularity agglomeration in the style of
// Clauset, Newman and Moore. Each step proposes merging two overview nodes in
// the same region that an original edge joins, ranked by modularity gain;
// label similarity from stem.ts only breaks a tie between equal gains. Two
// nodes no edge joins never pair, so a suggested group is always connected.
// Never crosses an author region, and under the strict rules never folds a
// hub or joins a decision's branches that do not rejoin (rules.ts).

import { byText } from "./graph.ts";
import { membersOfKey, overviewKeys, parentOfKey } from "./quotient.ts";
import { labelBag, similarity } from "./stem.ts";
import { type Candidate, foldable, keepsBranches, type TierContext } from "./tier.ts";

const pairKey = (a: string, b: string): string => `${a}\u0002${b}`;

// Original edges between two overview nodes, both directions, keyed a < b.
const weights = (ctx: TierContext): Map<string, number> => {
  const w = new Map<string, number>();
  for (const e of ctx.qedges) {
    if (e.source === e.target) continue;
    const [a, b] = [e.source, e.target].sort(byText) as [string, string];
    w.set(pairKey(a, b), (w.get(pairKey(a, b)) ?? 0) + e.covers.length);
  }
  return w;
};

const labelSimilarity = (ctx: TierContext, bags: Map<string, Set<string>>, a: string, b: string): number => {
  let best = 0;
  for (const x of membersOfKey(ctx.part, a))
    for (const y of membersOfKey(ctx.part, b))
      best = Math.max(best, similarity(bags.get(x) ?? new Set(), bags.get(y) ?? new Set()));
  return best;
};

export const proposeT6 = (ctx: TierContext): Candidate[] => {
  const { work, part } = ctx;
  const bags = new Map(work.ids.map((id) => [id, labelBag(work.nodes.get(id)?.label ?? id, id)]));
  const w = weights(ctx);
  const m = work.edges.length;
  const degree = (k: string): number => membersOfKey(part, k).reduce((s, x) => s + (work.degree.get(x) ?? 0), 0);
  const groupableKeys = new Set(overviewKeys(work, part).filter((k) => foldable(ctx, k)));
  const out: Candidate[] = [];
  for (const [pair, wab] of [...w].sort((x, y) => byText(x[0], y[0]))) {
    const [a, b] = pair.split("\u0002") as [string, string];
    if (!(groupableKeys.has(a) && groupableKeys.has(b))) continue;
    const parent = parentOfKey(work, part, a);
    if (parent !== parentOfKey(work, part, b) || !keepsBranches(ctx, [a, b])) continue;
    const priority = wab / m - (degree(a) * degree(b)) / (2 * m * m);
    const tie = labelSimilarity(ctx, bags, a, b);
    out.push({ keys: [a, b], parent, tier: "T6", reason: "suggested grouping", priority, tie });
  }
  return out;
};
