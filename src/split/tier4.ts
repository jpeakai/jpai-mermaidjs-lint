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
// cardinality and label as its own overview edge.

import { aggregateOf, ownersOf } from "./aggregate.ts";
import { byNatural, byText } from "./graph.ts";
import { isGroupKey, membersOfKey, over } from "./quotient.ts";
import { type Candidate, groupFits, mergeFits, type TierContext } from "./tier.ts";

// The aggregate folded whole, or null when it holds a stub, an earlier group
// straddles it, it
// is already one group, or, held to fit, its detail does not fit.
const candidateOf = (ctx: TierContext, head: string, fit = true): Candidate | null => {
  const members = aggregateOf(ctx.work, head);
  if (members.some((m) => ctx.work.protectedIds.has(m))) return null;
  const inside = new Set(members);
  const keys = [...new Set(members.map((m) => over(ctx.work, ctx.part, m)))].sort(byText);
  if (keys.length < 2 || !keys.every((k) => membersOfKey(ctx.part, k).every((m) => inside.has(m)))) return null;
  const c: Candidate = { keys, parent: null, tier: "T4", reason: "aggregate root", head };
  if (fit) return mergeFits(ctx, c) ? c : null;
  // Held to no target, an aggregate still never swallows a group already
  // over it, so no one group grows to most of the diagram.
  return keys.some((k) => isGroupKey(k) && !groupFits(ctx, k)) ? null : c;
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
    return c && (up === undefined || candidateOf(ctx, up) === null) ? [c] : [];
  });
  if (fitting.length > 0 || !ctx.uncapped) return fitting;
  return heads.flatMap((h) => candidateOf(ctx, h, false) ?? []);
};
