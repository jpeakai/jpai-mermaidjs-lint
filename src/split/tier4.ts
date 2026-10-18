// T4, erDiagram aggregates. An aggregate root folds with the weak entities it
// alone identifies (an identifying relationship with exactly one at the root's
// end and many at the other). A junction table, an entity with exactly two
// relationships both many at its own end, folds into the smaller of the two
// entities it joins. Cardinalities are never merged: quotient.ts keeps each
// distinct cardinality and label as its own overview edge.

import type { GraphEdge } from "../parse/graph.ts";
import { byText, sorted, type WorkGraph } from "./graph.ts";
import { over } from "./quotient.ts";
import { type Candidate, groupable, mergeFits, type TierContext } from "./tier.ts";

// An erDiagram relationship as graph.ts reads it from erDb: each end by its
// Cardinality name (from beside the source, to beside the target), and
// whether the relationship is identifying.
type ErEdge = GraphEdge & { ends?: { from: string; to: string }; identifying?: boolean };

const MANY = new Set(["ONE_OR_MORE", "ZERO_OR_MORE"]);
const ONE = "ONLY_ONE";

const endAt = (e: ErEdge, id: string): string | undefined => (e.source === id ? e.ends?.from : e.ends?.to);

// The entity an edge makes the identifying parent of its other end, if any.
const identifies = (e: ErEdge): { parent: string; child: string } | null => {
  if (!(e.identifying && e.ends) || e.source === e.target) return null;
  const { from, to } = e.ends;
  if (from === ONE && MANY.has(to)) return { parent: e.source, child: e.target };
  if (to === ONE && MANY.has(from)) return { parent: e.target, child: e.source };
  return null;
};

const weakParents = (work: WorkGraph): Map<string, Set<string>> => {
  const parents = new Map<string, Set<string>>();
  for (const e of work.edges) {
    const link = identifies(e);
    if (link) parents.set(link.child, new Set([...(parents.get(link.child) ?? []), link.parent]));
  }
  return parents;
};

// The first id's node with as many of the rest as still fit one detail.
const candidate = (ctx: TierContext, ids: string[], reason: string): Candidate | null => {
  const [first = "", ...rest] = ids.map((id) => over(ctx.work, ctx.part, id));
  if (!groupable(ctx, first)) return null;
  let keys = [first];
  for (const k of sorted(new Set(rest))) {
    const next = [...keys, k];
    if (!keys.includes(k) && groupable(ctx, k) && mergeFits(ctx, { keys: next, parent: null, tier: "T4", reason })) {
      keys = next;
    }
  }
  return keys.length < 2 ? null : { keys: sorted(keys), parent: null, tier: "T4", reason };
};

const aggregates = (ctx: TierContext): Candidate[] => {
  const byRoot = new Map<string, string[]>();
  for (const [child, parents] of weakParents(ctx.work)) {
    const [root] = [...parents];
    if (parents.size === 1 && root !== undefined) byRoot.set(root, [...(byRoot.get(root) ?? []), child]);
  }
  return sorted(byRoot.keys()).flatMap((root) => {
    const c = candidate(ctx, [root, ...(byRoot.get(root) ?? [])], "aggregate root");
    return c ? [c] : [];
  });
};

const junctionInto = (work: WorkGraph, id: string): string | null => {
  const touching = work.edges.filter((e) => e.source === id || e.target === id);
  if (touching.length !== 2) return null;
  const others = touching.map((e) => (e.source === id ? e.target : e.source));
  const manyHere = touching.every((e) => MANY.has(endAt(e, id) ?? ""));
  if (!manyHere || others[0] === others[1] || others.includes(id)) return null;
  const degree = (x: string): number => work.degree.get(x) ?? 0;
  return [...others].sort((a, b) => degree(a) - degree(b) || byText(a, b))[0] ?? null;
};

const junctions = (ctx: TierContext): Candidate[] =>
  ctx.work.ids.flatMap((id) => {
    const into = junctionInto(ctx.work, id);
    const c = into === null ? null : candidate(ctx, [id, into], "junction table");
    return c ? [c] : [];
  });

export const proposeT4 = (ctx: TierContext): Candidate[] =>
  ctx.work.family === "er" ? [...aggregates(ctx), ...junctions(ctx)] : [];
