// Declared loss: how many overview node pairs the overview makes reachable
// that the original never connected. A pair (A, B) is new when B is reachable
// from A in the overview, yet no original endpoint in A reaches one in B.

import type { WorkGraph } from "./graph.ts";
import { over, type Partition, quotientEdges } from "./quotient.ts";

const adjacency = (pairs: Iterable<[string, string]>): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const [a, b] of pairs) out.set(a, [...(out.get(a) ?? []), b]);
  return out;
};

const reachFrom = (start: string, out: Map<string, string[]>): Set<string> => {
  const seen = new Set<string>();
  const stack = [...(out.get(start) ?? [])];
  while (stack.length > 0) {
    const v = stack.pop() as string;
    if (seen.has(v)) continue;
    seen.add(v);
    stack.push(...(out.get(v) ?? []));
  }
  return seen;
};

const endpoints = (work: WorkGraph): string[] => [
  ...new Set([...work.ids, ...work.edges.flatMap((e) => [e.source, e.target])]),
];

export const newReachablePairs = (work: WorkGraph, part: Partition): number => {
  const original = adjacency(work.edges.map((e) => [e.source, e.target]));
  const summary = adjacency(quotientEdges(work, part).map((e) => [e.source, e.target]));
  const inside = new Map<string, string[]>();
  for (const x of endpoints(work)) {
    const k = over(work, part, x);
    inside.set(k, [...(inside.get(k) ?? []), x]);
  }
  const reach = new Map<string, Set<string>>();
  const reachOf = (x: string): Set<string> => {
    const known = reach.get(x) ?? reachFrom(x, original);
    reach.set(x, known);
    return known;
  };
  let count = 0;
  for (const [a, from] of inside) {
    for (const b of reachFrom(a, summary)) {
      if (b === a) continue;
      const to = inside.get(b) ?? [];
      if (!from.some((u) => to.some((v) => u !== v && reachOf(u).has(v)))) count++;
    }
  }
  return count;
};
