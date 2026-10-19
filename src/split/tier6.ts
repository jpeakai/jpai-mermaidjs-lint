// T6, suggested grouping: greedy modularity agglomeration in the style of
// Clauset, Newman and Moore. Each step proposes merging two overview nodes in
// the same region that an original edge joins, ranked by modularity gain;
// label similarity from stem.ts only breaks a tie between equal gains, and a
// pair that would mix two pipeline stages (stageOf) loses such a tie. Two
// nodes no edge joins never pair, so a suggested group is always connected.
// Never crosses an author region, and under the strict rules never folds a
// hub or joins a decision's branches that do not rejoin (rules.ts).

import { maximalCliques } from "./clique.ts";
import { byNatural, byText, sorted } from "./graph.ts";
import { ID_LEAD } from "./label.ts";
import { isGroupKey, membersOfKey, over, overviewKeys, parentOfKey } from "./quotient.ts";
import { crossesStages, labelBag, oneFamily, STATUS_MARK, similarity } from "./stem.ts";
import {
  adjacencyOf,
  type Candidate,
  chunksThatFit,
  familiesOf,
  familyOf,
  foldable,
  joined,
  keepsBranches,
  keepsFamilies,
  mergeFits,
  neighboursOf,
  type TierContext,
  together,
} from "./tier.ts";
import { evenRuns } from "./tier2.ts";

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

// What a pair mixing two pipeline stages loses in a tie: more than any label
// similarity gains, so a tie goes to a pair within one stage first.
const STAGE_PENALTY = 1;

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
      .filter((c) => keepsBranches(ctx, c.keys) && keepsFamilies(ctx, c.keys))
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
  const stagesOf = (k: string): Array<string | null> => familiesOf(ctx, [k]);
  const groupableKeys = new Set(overviewKeys(work, part).filter((k) => foldable(ctx, k)));
  const align = aligner(ctx);
  const out: Candidate[] = [...idFamilies(ctx), ...cliques(ctx, w, gain)];
  const pairs = [...w].map(([pair, wab]) => [...(pair.split("\u0002") as [string, string]), wab] as const);
  for (const [a, b, wab] of [...pairs, ...stagePairs(ctx, w)].sort(
    (x, y) => byText(x[0], y[0]) || byText(x[1], y[1]),
  )) {
    if (!(groupableKeys.has(a) && groupableKeys.has(b))) continue;
    const parent = parentOfKey(work, part, a);
    if (parent !== parentOfKey(work, part, b) || !keepsBranches(ctx, [a, b]) || !keepsFamilies(ctx, [a, b])) continue;
    const kin = oneFamily(stagesOf(a), stagesOf(b)) ? 1 : 0;
    if (wab === 0 && kin === 0) continue;
    const priority = wab / m - (degree(a) * degree(b)) / (2 * m * m);
    const tie = labelSimilarity(ctx, bags, a, b) - (crossesStages(stagesOf(a), stagesOf(b)) ? STAGE_PENALTY : 0);
    out.push({
      keys: [a, b],
      parent,
      tier: "T6",
      reason: "suggested grouping",
      priority,
      tie,
      kin,
      align: align(a, b, kin),
    });
  }
  return out;
};

// The share of two overview nodes' neighbours, each other left out, that
// both have: one when every neighbour is shared.
const overlap = (na: ReadonlySet<string>, nb: ReadonlySet<string>, a: string, b: string): number => {
  const union = new Set([...na, ...nb].filter((k) => k !== a && k !== b));
  const shared = [...union].filter((k) => na.has(k) && nb.has(k)).length;
  return union.size === 0 ? 0 : shared / union.size;
};

// A pair's alignment: for a pair of one prefix family, the share of their
// overview neighbours they share, else none.
const aligner = (ctx: TierContext): ((a: string, b: string, kin: number) => number) => {
  const adj = adjacencyOf(ctx.qedges);
  return (a, b, kin) => (kin === 1 ? overlap(neighboursOf(adj, a), neighboursOf(adj, b), a, b) : 0);
};

// Runs cut from a family, one more when the runs leave a key out, so that
// evened they cover the whole family.
const spread = (ctx: TierContext, keys: string[], runs: Candidate[]): Candidate[] => {
  const [first] = runs;
  const covered = runs.reduce((n, r) => n + r.keys.length, 0);
  if (!first || covered === keys.length) return runs;
  const count = runs.length + 1;
  const cut = Array.from({ length: count }, (_, i) => ({
    ...first,
    keys: keys.slice(Math.round((i * keys.length) / count), Math.round(((i + 1) * keys.length) / count)),
  }));
  return cut.every((r) => r.keys.length >= 2 && mergeFits(ctx, r)) ? cut : runs;
};

// The reason an id family's group gives.
export const ID_FAMILY = "id family";

// What an id family ranks as among T6 candidates: before any pair.
export const ID_FAMILY_KIN = 2;

// Whether every node's label leads with an id naming a prefix family, as a
// ticket graph's PLAT-1201 and DATA-0381: the author grouped every node.
const allIdFamilies = (ctx: TierContext): boolean =>
  ctx.work.ids.every((id) => {
    const family = familyOf(ctx.work, id);
    return family !== null && !family.startsWith(STATUS_MARK) && ID_LEAD.test(ctx.work.nodes.get(id)?.label ?? "");
  });

// In a diagram whose every label leads with an id naming a family, each
// family folds whole, hubs and all, into one group when its detail fits, and
// else into runs in natural order of their labels, each fitting and
// connected, all in one step, so a family reads as one group or as
// contiguous ranges, never scattered. The author's ticket keys are the
// grouping, and a hub inside a family shows through its group's edges.
const idFamilies = (ctx: TierContext): Candidate[] => {
  const { work, part } = ctx;
  if (work.family === "er" || !allIdFamilies(ctx)) return [];
  const familyOfKey = (k: string): string | null => {
    const fs = new Set(membersOfKey(part, k).map((m) => familyOf(work, m)));
    return fs.size === 1 ? ([...fs][0] ?? null) : null;
  };
  const first = (k: string): string => work.nodes.get(sorted(membersOfKey(part, k))[0] ?? k)?.label ?? k;
  const byFamily = new Map<string, string[]>();
  for (const k of overviewKeys(work, part)) {
    const f = familyOfKey(k);
    if (f !== null && !work.protectedIds.has(k)) byFamily.set(f, [...(byFamily.get(f) ?? []), k]);
  }
  return [...byFamily.keys()].sort(byText).flatMap((f) => {
    const keys = (byFamily.get(f) ?? []).sort((a, b) => byNatural(first(a), first(b)) || byText(a, b));
    const parent = parentOfKey(work, part, keys[0] ?? "");
    if (keys.length < 2 || keys.some((k) => parentOfKey(work, part, k) !== parent)) return [];
    const base = { parent, tier: "T6" as const, reason: ID_FAMILY, kin: ID_FAMILY_KIN, priority: 0, tie: 0 };
    const whole: Candidate = { ...base, keys };
    const runs = mergeFits(ctx, whole) ? [whole] : evenRuns(ctx, spread(ctx, keys, chunksThatFit(ctx, keys, base)));
    const connected = runs.every((r) =>
      joined(work, { members: r.keys.flatMap((k) => membersOfKey(part, k)), regions: [] }),
    );
    return connected ? together(runs.map((r) => ({ ...r, ...base, keys: [...r.keys].sort(byText) }))) : [];
  });
};

// Two overview nodes no edge joins whose members share an original neighbour:
// the same stage of a pipeline, as silver.payments and silver.sessions both
// fed by one quality suite. Offered with no edge between them, so only a pair
// of one prefix family is taken (MJL-0032), and a group so made is connected
// through the neighbours its members share, as contract.ts joined reads it.
const stagePairs = (ctx: TierContext, w: Map<string, number>): Array<readonly [string, string, number]> => {
  const { work, part } = ctx;
  const around = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    around.set(a, new Set([...(around.get(a) ?? []), b]));
  };
  for (const e of work.edges.filter((x) => x.source !== x.target)) {
    link(e.source, e.target);
    link(e.target, e.source);
  }
  const keys = new Set<string>();
  for (const via of [...around.keys()].sort(byText)) {
    const ks = sorted(new Set([...(around.get(via) ?? [])].map((x) => over(work, part, x))));
    for (const [i, a] of ks.entries()) for (const b of ks.slice(i + 1)) keys.add(pairKey(a, b));
  }
  return [...keys]
    .filter((key) => !w.has(key))
    .map((key) => [...(key.split("\u0002") as [string, string]), 0] as const);
};
