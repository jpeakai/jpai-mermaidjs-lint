// T2, lossless structure. Twins share every neighbour, edge label and kind,
// and a shape, so one node stands for them without changing what reaches
// what; a bundle of sibling leaves is the case of twins with one neighbour.
// A chain of single-in single-out nodes folds in stages sized to the target,
// never a long chain into one node. A stage may join prefix families: an
// extract and the bronze table it lands in fold as one lane (MJL-0035).

import { type FlowRegion, flowRegionsOf } from "./flow.ts";
import { byNatural, byText, type WorkGraph } from "./graph.ts";
import {
  chainsOf,
  groupOfKey,
  isGroupKey,
  membersOfKey,
  over,
  overviewKeys,
  parentOfKey,
  type QEdge,
  rankedMembers,
} from "./quotient.ts";
import {
  type Adjacency,
  adjacencyOf,
  type Candidate,
  chunksThatFit,
  groupable,
  mergeFits,
  shapeOfKey,
  type TierContext,
  together,
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

// Each class of twins in natural order of their labels, then ids, so runs cut
// from it read as alphabetical ranges, as an index is cut into volumes.
const twinClasses = (ctx: TierContext, adj: Adjacency): string[][] => {
  const classes = new Map<string, string[]>();
  for (const key of overviewKeys(ctx.work, ctx.part)) {
    if (!groupable(ctx, key)) continue;
    const sig = signature(adj, key);
    if (sig === null) continue;
    const k = [parentOfKey(ctx.work, ctx.part, key) ?? "", shapeOfKey(ctx, key), sig].join("\u0002");
    classes.set(k, [...(classes.get(k) ?? []), key]);
  }
  // A group by the label it is named after, so twin chains sort by their entries.
  const labelOf = (key: string): string => {
    const g = groupOfKey(ctx.part, key);
    const named = g ? rankedMembers(ctx.work, g)[0] : key;
    return ctx.work.nodes.get(named ?? key)?.label ?? key;
  };
  return [...classes.values()]
    .filter((c) => c.length > 1)
    .map((c) => c.sort((a, b) => byNatural(labelOf(a), labelOf(b)) || byNatural(a, b)));
};

const isLeaf = (adj: Adjacency, key: string): boolean =>
  (adj.in.get(key)?.length ?? 0) + (adj.out.get(key)?.length ?? 0) === 1;

// The runs cut again to sizes that differ by one at most, as many runs as
// before, when every run still fits; else the runs as they were.
export const evenRuns = (ctx: TierContext, runs: Candidate[]): Candidate[] => {
  const keys = runs.flatMap((r) => r.keys);
  const [first] = runs;
  if (!first || runs.length < 2 || keys.length !== runs.reduce((n, r) => n + r.keys.length, 0)) return runs;
  const even = runs.map((r, i) => ({
    ...r,
    keys: keys.slice(Math.round((i * keys.length) / runs.length), Math.round(((i + 1) * keys.length) / runs.length)),
  }));
  return even.every((r) => r.keys.length >= 2 && mergeFits(ctx, r)) ? even : runs;
};

// Whether a twin class is twin chains: every key a group holding whole paths,
// the members of all of them forming paths of one length, two or more, as
// extracts each feeding the bronze table it lands in.
const isLanes = (ctx: TierContext, keys: readonly string[]): boolean => {
  if (!keys.every(isGroupKey)) return false;
  const all = chainsOf(
    ctx.work,
    keys.flatMap((k) => membersOfKey(ctx.part, k)),
  );
  const each = keys.map((k) => chainsOf(ctx.work, membersOfKey(ctx.part, k))?.length ?? 0);
  const length = all?.[0]?.length ?? 0;
  return (
    all !== null &&
    length >= 2 &&
    all.every((c) => c.length === length) &&
    each.every((n) => n > 0) &&
    each.reduce((a, b) => a + b, 0) === all.length
  );
};

// The working graphs a walk folding twin chains whole met them in, so the
// planner walks again cutting them into runs only where it did.
const metLanes = new WeakSet<WorkGraph>();

export const hasLanes = (work: WorkGraph): boolean => metLanes.has(work);

// Twin chains folded whole, never cut into runs, since no label sorts lanes
// (MJL-0038): split again when the walk lets a detail be, else only when the
// detail fits.
const wholeLanes = (ctx: TierContext, keys: string[]): Candidate[] => {
  metLanes.add(ctx.work);
  const c: Candidate = { keys, parent: parentOfKey(ctx.work, ctx.part, keys[0] ?? ""), tier: "T2", reason: "twins" };
  if (ctx.nestLanes) return [{ ...c, splits: true }];
  return mergeFits(ctx, c) ? [c] : [];
};

// Every run of one twin class folds in one step, so the class folds evenly.
// On a walk folding twin chains whole, they fold as one group (wholeLanes).
export const proposeTwins = (ctx: TierContext): Candidate[] => {
  const adj = adjacencyOf(ctx.qedges);
  return twinClasses(ctx, adj).flatMap((keys) =>
    ctx.wholeLanes && isLanes(ctx, keys)
      ? wholeLanes(ctx, keys)
      : together(
          evenRuns(
            ctx,
            chunksThatFit(ctx, keys, {
              parent: parentOfKey(ctx.work, ctx.part, keys[0] ?? ""),
              tier: "T2",
              reason: keys.every((k) => isLeaf(adj, k)) ? "sibling leaves" : "twins",
            }),
          ),
        ),
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

// Chain runs by where they sit: the node before the first, the node after
// the last, the region and the length. Runs alike are twin chains.
const placeOf = (ctx: TierContext, adj: Adjacency, run: string[]): string =>
  JSON.stringify([
    adj.in.get(run[0] ?? "")?.[0]?.source,
    adj.out.get(run.at(-1) ?? "")?.[0]?.target,
    parentOfKey(ctx.work, ctx.part, run[0] ?? ""),
    run.length,
  ]);

// Every stage of one chain folds in one step, so the chain is cut evenly. On
// a walk folding twin chains whole, every stage of twin chains folds in one
// step, so each lane folds alike (MJL-0038).
export const proposeChains = (ctx: TierContext): Candidate[] => {
  const adj = adjacencyOf(ctx.qedges);
  const runs = chainRuns(ctx, adj);
  const places = new Map<string, string[][]>();
  for (const run of runs) {
    const k = ctx.wholeLanes ? placeOf(ctx, adj, run) : JSON.stringify(run);
    places.set(k, [...(places.get(k) ?? []), run]);
  }
  return [...places.values()].flatMap((alike) => together(alike.flatMap((run) => stagesOf(ctx, run))));
};

const stagesOf = (ctx: TierContext, run: string[]): Candidate[] =>
  stages(ctx, run)
    .map((keys): Candidate => {
      const parent = parentOfKey(ctx.work, ctx.part, keys[0] ?? "");
      return { keys: [...keys].sort(byText), parent, tier: "T2", reason: "chain stage" };
    })
    .filter((c) => mergeFits(ctx, c));

// A decision region folded whole: every overview node inside it, none
// straddling its boundary. Null when it is already one group.
const regionCandidate = (ctx: TierContext, r: FlowRegion): Candidate | null => {
  const inside = new Set(r.members);
  const keys = [...new Set(r.members.map((m) => over(ctx.work, ctx.part, m)))].sort(byText);
  if (keys.length < 2 || !keys.every((k) => membersOfKey(ctx.part, k).every((m) => inside.has(m)))) return null;
  const parent = ctx.work.nodes.get(r.head)?.parent ?? null;
  const c: Candidate = { keys, parent, tier: "T2", reason: "decision region", head: r.head };
  return mergeFits(ctx, c) ? c : null;
};

const within = (inner: FlowRegion, outer: FlowRegion): boolean =>
  inner.members.length < outer.members.length && inner.members.every((m) => outer.members.includes(m));

// Decision regions, innermost first: a region is offered once every region
// inside it has folded or cannot fold.
export const proposeRegions = (ctx: TierContext): Candidate[] => {
  const regions = flowRegionsOf(ctx.work);
  const open = new Map(regions.map((r) => [r, regionCandidate(ctx, r)]));
  return regions.flatMap((r) => {
    const c = open.get(r);
    return c && !regions.some((x) => within(x, r) && open.get(x)) ? [c] : [];
  });
};

export const proposeT2 = (ctx: TierContext): Candidate[] => [
  ...proposeTwins(ctx),
  ...proposeChains(ctx),
  ...proposeRegions(ctx),
];
