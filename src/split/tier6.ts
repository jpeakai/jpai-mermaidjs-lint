// T6, suggested grouping: greedy modularity agglomeration in the style of
// Clauset, Newman and Moore. Each step proposes merging two overview nodes in
// the same region, ranked by modularity gain plus a small label-similarity
// bonus from stem.ts. Pairs are neighbours, or, with no edge between them,
// labels at least half alike. Never crosses an author region.

import { byText } from "./graph.ts";
import { membersOfKey, overviewKeys, parentOfKey } from "./quotient.ts";
import { labelBag, similarity } from "./stem.ts";
import { type Candidate, groupable, type TierContext } from "./tier.ts";

const LABEL_ONLY = 0.5;

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

// Modularity gain of merging two overview nodes, plus half an edge's worth
// for alike labels; with no edges at all, label similarity alone.
const pairScorer = (ctx: TierContext): ((a: string, b: string) => { wab: number; sim: number; priority: number }) => {
  const { work, part } = ctx;
  const bags = new Map(work.ids.map((id) => [id, labelBag(work.nodes.get(id)?.label ?? id, id)]));
  const w = weights(ctx);
  const m = work.edges.length;
  const degree = (k: string): number => membersOfKey(part, k).reduce((s, x) => s + (work.degree.get(x) ?? 0), 0);
  return (a, b) => {
    const wab = w.get(pairKey(a, b)) ?? 0;
    const sim = labelSimilarity(ctx, bags, a, b);
    const gain = m > 0 ? wab / m - (degree(a) * degree(b)) / (2 * m * m) : 0;
    return { wab, sim, priority: gain + sim * (m > 0 ? 1 / (2 * m) : 1) };
  };
};

export const proposeT6 = (ctx: TierContext): Candidate[] => {
  const { work, part } = ctx;
  const score = pairScorer(ctx);
  const keys = overviewKeys(work, part)
    .filter((k) => groupable(ctx, k))
    .sort(byText);
  const out: Candidate[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const [a, b] = [keys[i] as string, keys[j] as string];
      const parent = parentOfKey(work, part, a);
      if (parent !== parentOfKey(work, part, b)) continue;
      const { wab, sim, priority } = score(a, b);
      if (wab > 0 || sim >= LABEL_ONLY)
        out.push({ keys: [a, b], parent, tier: "T6", reason: "suggested grouping", priority });
    }
  }
  return out;
};
