// T6, suggested grouping: greedy modularity agglomeration in the style of
// Clauset, Newman and Moore. Each step proposes merging two overview nodes in
// the same region that an original edge joins, ranked by modularity gain;
// label similarity from stem.ts only breaks a tie between equal gains. Two
// nodes no edge joins never pair, so a suggested group is always connected.
// Never crosses an author region, and under the strict rules never folds a
// hub or joins a decision's branches that do not rejoin (rules.ts).

import { maximalCliques } from "./clique.ts";
import { byText } from "./graph.ts";
import { isGroupKey, membersOfKey, overviewKeys, parentOfKey } from "./quotient.ts";
import { labelBag, similarity } from "./stem.ts";
import { type Candidate, chunksThatFit, foldable, keepsBranches, type TierContext } from "./tier.ts";

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

// A mesh is dense when its overview joins at least half of all node pairs.
export const DENSE = 0.5;

// In a dense mesh, pairs say little: nearly every pair is joined. There T6
// also proposes tight cliques, maximal cliques of nodes not yet grouped, each
// cut into runs whose detail fits, so a group is a set of nodes that all talk
// to each other. Its priority is the modularity gain of merging the whole
// set, the sum of the gains of its pairs, so a larger clique ranks first.
const cliques = (ctx: TierContext, w: Map<string, number>, gain: (a: string, b: string) => number): Candidate[] => {
  const keys = overviewKeys(ctx.work, ctx.part);
  const pairs = new Set([...w.keys()]);
  if (keys.length < 4 || pairs.size < DENSE * ((keys.length * (keys.length - 1)) / 2)) return [];
  const joined = (a: string, b: string): boolean => pairs.has(pairKey(...([a, b].sort(byText) as [string, string])));
  const open = keys.filter((k) => !isGroupKey(k) && foldable(ctx, k));
  const byParent = new Map<string, string[]>();
  for (const k of open) {
    const p = parentOfKey(ctx.work, ctx.part, k) ?? "";
    byParent.set(p, [...(byParent.get(p) ?? []), k]);
  }
  return [...byParent.values()].flatMap((ks) =>
    maximalCliques(ks, joined)
      .filter((c) => c.length >= 3)
      .flatMap((c) =>
        chunksThatFit(ctx, c, {
          parent: parentOfKey(ctx.work, ctx.part, c[0] ?? ""),
          tier: "T6",
          reason: "tight clique",
        }),
      )
      .filter((c) => keepsBranches(ctx, c.keys))
      .map((c) => ({
        ...c,
        priority: c.keys.reduce((s, a, i) => s + c.keys.slice(i + 1).reduce((t, b) => t + gain(a, b), 0), 0),
        tie: 0,
      })),
  );
};

export const proposeT6 = (ctx: TierContext): Candidate[] => {
  const { work, part } = ctx;
  const bags = new Map(work.ids.map((id) => [id, labelBag(work.nodes.get(id)?.label ?? id, id)]));
  const w = weights(ctx);
  const m = work.edges.length;
  const degree = (k: string): number => membersOfKey(part, k).reduce((s, x) => s + (work.degree.get(x) ?? 0), 0);
  const gain = (a: string, b: string): number => {
    const [x, y] = [a, b].sort(byText) as [string, string];
    return (w.get(pairKey(x, y)) ?? 0) / m - (degree(a) * degree(b)) / (2 * m * m);
  };
  const groupableKeys = new Set(overviewKeys(work, part).filter((k) => foldable(ctx, k)));
  const out: Candidate[] = cliques(ctx, w, gain);
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
