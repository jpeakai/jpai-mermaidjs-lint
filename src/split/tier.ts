// What every tier shares: the context a tier proposes from, the candidate it
// proposes, and the overview's adjacency read from the merged edges.

import type { ThresholdConfig } from "../parse/metrics.ts";
import { byText, type WorkGraph } from "./graph.ts";
import {
  detailShape,
  detailView,
  type Group,
  groupOfKey,
  isGroupKey,
  type Merge,
  meets,
  merge,
  type Partition,
  type QEdge,
  scoreOf,
} from "./quotient.ts";

export interface Candidate extends Merge {
  // T6 orders by modularity gain plus a label bonus, not by score per node.
  priority?: number;
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
