// Maximal cliques, for folding a dense mesh into groups whose members all
// talk to each other. Bron and Kerbosch's algorithm with Tomita's pivot: the
// pivot is the candidate or excluded vertex with the most neighbours among
// the candidates, so each maximal clique is reported once. Vertices are taken
// in natural order and ties go to the first, so the cliques come out the same
// for the same graph, whatever order its lines were written in.

import { byNatural } from "./graph.ts";

// The most cliques reported, so a pathological graph stays bounded; the
// cliques are reported in a fixed order, so the cap keeps the result fixed.
export const MAX_CLIQUES = 256;

export const maximalCliques = (
  vertices: readonly string[],
  adjacent: (a: string, b: string) => boolean,
): string[][] => {
  const order = [...vertices].sort(byNatural);
  const neighbours = new Map(order.map((v) => [v, new Set(order.filter((w) => w !== v && adjacent(v, w)))]));
  const out: string[][] = [];
  const around = (v: string): Set<string> => neighbours.get(v) ?? new Set();
  const visit = (r: string[], p: string[], x: string[]): void => {
    if (out.length >= MAX_CLIQUES) return;
    if (p.length === 0 && x.length === 0) {
      out.push(r);
      return;
    }
    let pivot = "";
    let best = -1;
    for (const u of [...p, ...x]) {
      const n = p.filter((w) => around(u).has(w)).length;
      if (n > best) [pivot, best] = [u, n];
    }
    let rest = p;
    let done = x;
    for (const v of p.filter((w) => !around(pivot).has(w))) {
      visit(
        [...r, v],
        rest.filter((w) => around(v).has(w)),
        done.filter((w) => around(v).has(w)),
      );
      rest = rest.filter((w) => w !== v);
      done = [...done, v];
    }
  };
  visit([], order, []);
  return out.map((c) => c.sort(byNatural));
};
