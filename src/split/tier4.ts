// T4, erDiagram aggregates. Each entity has an owner when it depends on one
// other entity alone: its single identifying parent (an identifying
// relationship with exactly one at the parent's end), or, with no
// identifying parent, the one entity a leaf entity relates to, exactly one at
// that end. Owners chain to an aggregate root, and an aggregate is a root with
// everything it owns, directly or through a chain. The largest aggregate whose
// detail fits folds whole and is named after its root, so the overview's
// edges run between roots. A junction, an entity identified by two entities
// or more, is owned by none: it stays in view or folds with neither side.
// Cardinalities are never merged: quotient.ts keeps each distinct
// cardinality and label as its own overview edge, so an aggregate folds only
// where it draws no two relationships side by side that the original draws
// between other ends (plan.ts), and a root's aggregate that would is offered
// trimmed too, adding no new reachable pair (MJL-0034).

import { aggregateOf, ownersOf } from "./aggregate.ts";
import { byNatural, byText } from "./graph.ts";
import { foldedParallels, isGroupKey, membersOfKey, merge, over, quotientEdges } from "./quotient.ts";
import { type Candidate, groupFits, mergeFits, type TierContext } from "./tier.ts";

// The aggregate folded whole, or trimmed, or null when it holds a stub, an
// earlier group straddles it, it is already one group, or, held to fit, its
// detail does not fit.
const candidateOf = (ctx: TierContext, head: string, fit = true, trim = false): Candidate | null => {
  const members = trim ? trimmed(ctx, head) : aggregateOf(ctx.work, head);
  if (members.some((m) => ctx.work.protectedIds.has(m))) return null;
  const inside = new Set(members);
  const keys = [...new Set(members.map((m) => over(ctx.work, ctx.part, m)))].sort(byText);
  if (keys.length < 2 || !keys.every((k) => membersOfKey(ctx.part, k).every((m) => inside.has(m)))) return null;
  const c: Candidate = {
    keys,
    parent: null,
    tier: "T4",
    reason: "aggregate root",
    head,
    ...(trim ? { lossless: true as const } : {}),
  };
  if (fit) return mergeFits(ctx, c) ? c : null;
  // Held to no target, an aggregate still never swallows a group already
  // over it, so no one group grows to most of the diagram.
  return keys.some((k) => isGroupKey(k) && !groupFits(ctx, k)) ? null : c;
};

// An aggregate without each part an outside entity also relates to through
// the rest: an owned entity, with all it owns, sharing an outside neighbour
// with the members left. Folded whole, the aggregate would draw two
// relationships between its group and that neighbour, as an address chain
// folded with a STORE it locates draws CUSTOMER twice; trimmed, the chain
// folds alone and the part stays in view (MJL-0034).
const trimmed = (ctx: TierContext, head: string): string[] => {
  const { work } = ctx;
  const owners = ownersOf(work);
  let members = aggregateOf(work, head);
  const around = (set: ReadonlySet<string>): Set<string> => {
    const out = new Set<string>();
    for (const e of work.edges) {
      if (set.has(e.source) && !set.has(e.target)) out.add(e.target);
      if (set.has(e.target) && !set.has(e.source)) out.add(e.source);
    }
    return out;
  };
  const queue = members.filter((m) => owners.get(m) === head).sort(byNatural);
  while (queue.length > 0) {
    const part = queue.shift() as string;
    const inside = new Set(aggregateOf(work, part));
    const rest = new Set(members.filter((m) => !inside.has(m)));
    const all = new Set(members);
    const shared = [...around(inside)].some((x) => !all.has(x) && around(rest).has(x));
    if (shared) members = [...rest];
    else queue.push(...members.filter((m) => owners.get(m) === part).sort(byNatural));
  }
  return members;
};

// Whether a root's whole aggregate, folded, draws more relationships side by
// side between its group and another overview node than the original does.
const drawsParallels = (ctx: TierContext, head: string): boolean => {
  const whole = candidateOf(ctx, head, false);
  if (!whole) return false;
  return (
    foldedParallels(ctx.work, quotientEdges(ctx.work, merge(ctx.part, whole))) > foldedParallels(ctx.work, ctx.qedges)
  );
};

// The largest aggregates that fit: an entity's own aggregate, offered when it
// heads one and the aggregate of its owner does not fit or is not open. When
// none fits and the step may split a detail again, each root's aggregate.
export const proposeT4 = (ctx: TierContext): Candidate[] => {
  if (ctx.work.family !== "er") return [];
  const owners = ownersOf(ctx.work);
  const heads = [...new Set(owners.values())].sort(byNatural);
  const fitting = heads.flatMap((head) => {
    const c = candidateOf(ctx, head);
    const up = owners.get(head);
    const whole = c && (up === undefined || candidateOf(ctx, up) === null) ? [c] : [];
    // A root's aggregate trimmed of its shared parts, when the whole one
    // draws relationships side by side that the original does not.
    const cut = up === undefined && drawsParallels(ctx, head) ? candidateOf(ctx, head, true, true) : null;
    return cut && cut.keys.join() !== c?.keys.join() ? [...whole, cut] : whole;
  });
  if (fitting.length > 0 || !ctx.uncapped) return fitting;
  return heads.flatMap((h) => candidateOf(ctx, h, false) ?? []);
};
