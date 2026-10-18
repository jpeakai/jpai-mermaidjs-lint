// T2, lossless structure. Twins share every neighbour, edge label and kind,
// and a shape, so one node stands for them without changing what reaches
// what; a bundle of sibling leaves is the case of twins with one neighbour.
// A chain of single-in single-out nodes folds in stages sized to the target,
// never a long chain into one node.

import { byText } from "./graph.ts";
import { membersOfKey, overviewKeys, parentOfKey, type QEdge } from "./quotient.ts";
import {
  type Adjacency,
  adjacencyOf,
  type Candidate,
  chunksThatFit,
  groupable,
  mergeFits,
  shapeOfKey,
  type TierContext,
} from "./tier.ts";

const end = (e: QEdge, other: string, self: string): string =>
  [other === self ? "\u0001self" : other, e.label ?? "", e.kind ?? "", e.cardinality ?? ""].join("|");

// A node's neighbourhood as text: each incoming and outgoing edge by the
// node at its other end and its attributes. Null for an isolated node.
const signature = (adj: Adjacency, key: string): string | null => {
  const ins = new Set((adj.in.get(key) ?? []).map((e) => end(e, e.source, key)));
  const outs = new Set((adj.out.get(key) ?? []).map((e) => end(e, e.target, key)));
  if (ins.size + outs.size === 0) return null;
  return `${[...ins].sort(byText).join(",")}>${[...outs].sort(byText).join(",")}`;
};

const twinClasses = (ctx: TierContext, adj: Adjacency): string[][] => {
  const classes = new Map<string, string[]>();
  for (const key of overviewKeys(ctx.work, ctx.part)) {
    if (!groupable(ctx, key)) continue;
    const sig = signature(adj, key);
    if (sig === null) continue;
    const k = [parentOfKey(ctx.work, ctx.part, key) ?? "", shapeOfKey(ctx, key), sig].join("\u0002");
    classes.set(k, [...(classes.get(k) ?? []), key]);
  }
  return [...classes.values()].filter((c) => c.length > 1).map((c) => c.sort(byText));
};

const isLeaf = (adj: Adjacency, key: string): boolean =>
  (adj.in.get(key)?.length ?? 0) + (adj.out.get(key)?.length ?? 0) === 1;

export const proposeTwins = (ctx: TierContext): Candidate[] => {
  const adj = adjacencyOf(ctx.qedges);
  return twinClasses(ctx, adj).flatMap((keys) =>
    chunksThatFit(ctx, keys, {
      parent: parentOfKey(ctx.work, ctx.part, keys[0] ?? ""),
      tier: "T2",
      reason: keys.every((k) => isLeaf(adj, k)) ? "sibling leaves" : "twins",
    }),
  );
};

const chainable = (ctx: TierContext, adj: Adjacency, key: string): boolean => {
  const [ins, outs] = [adj.in.get(key) ?? [], adj.out.get(key) ?? []];
  return groupable(ctx, key) && ins.length === 1 && outs.length === 1 && ins[0]?.source !== key;
};

const follows = (ctx: TierContext, adj: Adjacency, from: string, to: string | undefined): to is string =>
  to !== undefined &&
  to !== from &&
  chainable(ctx, adj, to) &&
  parentOfKey(ctx.work, ctx.part, to) === parentOfKey(ctx.work, ctx.part, from);

// Each maximal run of chainable nodes, in path order. A closed loop of
// chainable nodes has no start and is left alone.
const chainRuns = (ctx: TierContext, adj: Adjacency): string[][] => {
  const runs: string[][] = [];
  for (const key of overviewKeys(ctx.work, ctx.part)) {
    if (!chainable(ctx, adj, key)) continue;
    const pred = adj.in.get(key)?.[0]?.source;
    if (follows(ctx, adj, key, pred)) continue;
    const run = [key];
    const seen = new Set(run);
    for (let next = adj.out.get(key)?.[0]?.target; follows(ctx, adj, run.at(-1) ?? key, next) && !seen.has(next); ) {
      run.push(next);
      seen.add(next);
      next = adj.out.get(next)?.[0]?.target;
    }
    if (run.length > 1) runs.push(run);
  }
  return runs;
};

// The largest stage a chain detail holds: k members, two stubs, k + 1 edges.
const stageCap = (ctx: TierContext): number => {
  const { node_target, vcs_target, edge_weight } = ctx.config;
  const byScore = Math.floor((vcs_target - 2 - edge_weight) / (1 + edge_weight));
  return Math.max(2, Math.min(node_target - 2, byScore));
};

// Cuts a run into ceil(L / k) stages of about equal size, where L counts the
// run's original nodes; a run of four or more always gets two stages at least.
const stages = (ctx: TierContext, run: string[]): string[][] => {
  const sizes = run.map((k) => membersOfKey(ctx.part, k).length);
  const total = sizes.reduce((a, b) => a + b, 0);
  const count = Math.max(total >= 4 ? 2 : 1, Math.ceil(total / stageCap(ctx)));
  const size = Math.ceil(total / count);
  const windows: string[][] = [];
  let window: string[] = [];
  let sum = 0;
  for (let i = 0; i < run.length; i++) {
    const s = sizes[i] ?? 1;
    if (window.length > 0 && sum + s > size) {
      windows.push(window);
      [window, sum] = [[], 0];
    }
    window.push(run[i] as string);
    sum += s;
  }
  windows.push(window);
  return windows.filter((w) => w.length > 1);
};

export const proposeChains = (ctx: TierContext): Candidate[] => {
  const adj = adjacencyOf(ctx.qedges);
  return chainRuns(ctx, adj).flatMap((run) =>
    stages(ctx, run)
      .map((keys): Candidate => {
        const parent = parentOfKey(ctx.work, ctx.part, keys[0] ?? "");
        return { keys: [...keys].sort(byText), parent, tier: "T2", reason: "chain stage" };
      })
      .filter((c) => mergeFits(ctx, c)),
  );
};

export const proposeT2 = (ctx: TierContext): Candidate[] => [...proposeTwins(ctx), ...proposeChains(ctx)];
