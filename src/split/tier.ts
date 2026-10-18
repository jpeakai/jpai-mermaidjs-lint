// What every tier shares: the context a tier proposes from, the candidate it
// proposes, and the overview's adjacency read from the merged edges.

import type { ThresholdConfig } from "../parse/metrics.ts";
import { isJunction } from "./aggregate.ts";
import { byText, type WorkGraph } from "./graph.ts";
import {
  detailShape,
  detailView,
  type Group,
  groupOfKey,
  isGroupKey,
  type Merge,
  meets,
  membersOfKey,
  merge,
  type Partition,
  type QEdge,
  scoreOf,
} from "./quotient.ts";
import { type FoldRules, hubsOf, splitsBranches, terminalsOf } from "./rules.ts";
import { mixesFamilies, stageOf } from "./stem.ts";

export interface Candidate extends Merge {
  // T6 orders by modularity gain, not by score per node.
  priority?: number;
  // T6 breaks a tie between equal gains by label similarity.
  tie?: number;
  // T6 takes a pair naming one prefix family before any other: 1, else 0.
  kin?: number;
  // Merges of the same pattern applied in the same step: every stage of one
  // chain, every run of one twin class. A plan then folds the pattern evenly,
  // not one stage of it.
  also?: Merge[];
}

export interface TierContext {
  work: WorkGraph;
  part: Partition;
  config: ThresholdConfig;
  qedges: QEdge[];
  rules: FoldRules;
  // Whether the step may fold a group whose detail is over the target, to be
  // split again: author regions and aggregates on the first walk.
  uncapped?: boolean;
}

export interface Adjacency {
  out: Map<string, QEdge[]>;
  in: Map<string, QEdge[]>;
}

export const adjacencyOf = (qedges: QEdge[]): Adjacency => {
  const out = new Map<string, QEdge[]>();
  const inn = new Map<string, QEdge[]>();
  for (const e of qedges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e]);
    inn.set(e.target, [...(inn.get(e.target) ?? []), e]);
  }
  return { out, in: inn };
};

// The distinct overview nodes a node shares an edge with, itself left out.
export const neighboursOf = (adj: Adjacency, key: string): Set<string> => {
  const set = new Set<string>();
  for (const e of adj.out.get(key) ?? []) set.add(e.target);
  for (const e of adj.in.get(key) ?? []) set.add(e.source);
  set.delete(key);
  return set;
};

// A group, or a kept node that is not protected. A subgraph used as an edge
// end, or a lollipop, is never folded on its own.
export const groupable = (ctx: TierContext, key: string): boolean =>
  isGroupKey(key) || (ctx.work.nodes.has(key) && !ctx.work.protectedIds.has(key));

// A node the rules keep in view: a hub, an erDiagram junction between two
// aggregate roots, which folds into neither side, or a decision region
// holding a hub, which T2 folded and which T5 and T6 fold no further; and,
// under its own rule, a shared terminal many paths end at.
export const keptHub = (ctx: TierContext, key: string): boolean => {
  const g = groupOfKey(ctx.part, key);
  if (!g && ctx.rules.keepTerminals && terminalsOf(ctx.work).has(key)) return true;
  if (!ctx.rules.keepHubs) return false;
  if (!g) return hubsOf(ctx.work).has(key) || isJunction(ctx.work, key);
  return g.reason === "decision region" && g.members.some((m) => hubsOf(ctx.work).has(m));
};

// What T5 and T6 may fold: a groupable key that is no hub kept in view.
export const foldable = (ctx: TierContext, key: string): boolean => groupable(ctx, key) && !keptHub(ctx, key);

// Whether merging these keys keeps a decision's branches apart, as the rules ask.
export const keepsBranches = (ctx: TierContext, keys: readonly string[]): boolean =>
  !(
    ctx.rules.keepBranches &&
    splitsBranches(
      ctx.work,
      keys.flatMap((k) => groupOfKey(ctx.part, k)?.members ?? [k]),
    )
  );

const familyCache = new WeakMap<WorkGraph, Map<string, string | null>>();

// The prefix family of each original node (stem.ts), read once per graph.
export const familyOf = (work: WorkGraph, id: string): string | null => {
  let known = familyCache.get(work);
  if (!known) {
    known = new Map(work.ids.map((x) => [x, stageOf(work.nodes.get(x)?.label ?? x, x)]));
    familyCache.set(work, known);
  }
  return known.get(id) ?? null;
};

// The prefix families of the members behind each key.
export const familiesOf = (ctx: TierContext, keys: readonly string[]): Array<string | null> =>
  keys.flatMap((k) => membersOfKey(ctx.part, k)).map((m) => familyOf(ctx.work, m));

// Whether merging these keys keeps to one prefix family, as the rules ask.
export const keepsFamilies = (ctx: TierContext, keys: readonly string[]): boolean =>
  !(ctx.rules.keepFamilies && mixesFamilies(familiesOf(ctx, keys)));

const MIXED = "\u0001mixed";

export const shapeOfKey = (ctx: TierContext, key: string): string => {
  const g = groupOfKey(ctx.part, key);
  if (!g) return ctx.work.nodes.get(key)?.shape ?? "";
  const shapes = new Set(g.members.map((m) => ctx.work.nodes.get(m)?.shape ?? ""));
  return shapes.size === 1 ? ([...shapes][0] ?? "") : MIXED;
};

// One candidate applying every merge given, the first carrying the rest.
export const together = (merges: Candidate[]): Candidate[] => {
  const [first, ...rest] = merges;
  return first ? [rest.length > 0 ? { ...first, also: rest } : first] : [];
};

// The group a merge of these keys made in the next partition.
export const mergedGroup = (before: Partition, after: Partition, keys: readonly string[]): Group | undefined => {
  const first = keys.map((k) => groupOfKey(before, k)?.members[0] ?? k).sort(byText)[0] ?? "";
  return after.groups[after.groupOf.get(first) ?? -1];
};

// Whether the group a merge would make gets a detail diagram within target.
export const mergeFits = (ctx: TierContext, m: Merge): boolean => {
  const next = merge(ctx.part, m);
  const g = mergedGroup(ctx.part, next, m.keys);
  if (!g) return false;
  const shape = detailShape(ctx.work, detailView(ctx.work, next, g));
  return meets(shape.nodes, scoreOf(shape, 0, ctx.config), ctx.config);
};

// Whether a group already in the partition has a detail within target.
export const groupFits = (ctx: TierContext, key: string): boolean => {
  const g = groupOfKey(ctx.part, key);
  if (!g) return true;
  const shape = detailShape(ctx.work, detailView(ctx.work, ctx.part, g));
  return meets(shape.nodes, scoreOf(shape, 0, ctx.config), ctx.config);
};

// Splits keys, in the order given, into runs whose merged detail fits,
// keeping runs of two or more.
export const chunksThatFit = (ctx: TierContext, keys: string[], base: Omit<Merge, "keys">): Candidate[] => {
  const out: Candidate[] = [];
  let chunk: string[] = [];
  const flush = (): void => {
    if (chunk.length >= 2) out.push({ ...base, keys: chunk });
  };
  for (const k of keys) {
    if (chunk.length === 0 || mergeFits(ctx, { ...base, keys: [...chunk, k] })) {
      chunk = [...chunk, k];
      continue;
    }
    flush();
    chunk = [k];
  }
  flush();
  return out;
};
