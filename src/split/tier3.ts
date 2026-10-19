// T3, author regions, innermost first: a flowchart subgraph, a composite
// state or a class namespace folds to one group node carrying its own label.
// A region is ready once every region inside it holding a node has folded, or
// cannot fold on its own: it holds a state pinned to a region around it (a
// composite's start or end marker touches it), and folds with that region.

import { byText, homeOf, regionWithin, type WorkGraph } from "./graph.ts";
import { membersOfKey, overviewKeys } from "./quotient.ts";
import type { Candidate, TierContext } from "./tier.ts";

const holdsNode = (work: WorkGraph, region: string): boolean =>
  work.ids.some((id) => regionWithin(work, homeOf(work, id), region));

const childrenOf = (work: WorkGraph, region: string): string[] =>
  work.regionIds.filter((r) => work.regions.get(r)?.parent === region);

const descendants = (work: WorkGraph, region: string): string[] =>
  work.regionIds.filter((r) => r !== region && regionWithin(work, r, region));

// Whether every pinned member may fold with these regions.
const pinsHold = (work: WorkGraph, members: string[], regions: string[]): boolean =>
  members.every((m) => {
    if (!work.pins.has(m)) return true;
    const pin = work.pins.get(m) ?? null;
    return regions.some((r) => regionWithin(work, pin, r));
  });

// The region folded whole: every overview node inside it, and every region
// inside it not yet folded. Null when a pinned state forbids it, or when it
// holds one node, whose group's detail would show nothing new.
const candidateOf = (ctx: TierContext, r: string): Candidate | null => {
  const { work, part } = ctx;
  const within = (k: string): boolean => membersOfKey(part, k).every((m) => regionWithin(work, homeOf(work, m), r));
  const keys = overviewKeys(work, part).filter(within);
  const regions = [r, ...descendants(work, r).filter((d) => !part.regionOf.has(d))];
  const members = keys.flatMap((k) => membersOfKey(part, k));
  if (members.length < 2 || !pinsHold(work, members, regions)) return null;
  return { keys, regions, parent: work.regions.get(r)?.parent ?? null, tier: "T3", reason: "author region" };
};

const ready = (ctx: TierContext, region: string): boolean =>
  !ctx.part.regionOf.has(region) &&
  holdsNode(ctx.work, region) &&
  childrenOf(ctx.work, region).every(
    (c) => ctx.part.regionOf.has(c) || !holdsNode(ctx.work, c) || candidateOf(ctx, c) === null,
  );

// A region's shape: how many nodes it holds of its own, and each region
// inside it by its label and shape. Two regions of one shape were drawn from
// one template, as two cloud regions each with public, app and data subnets.
const shapeOf = (work: WorkGraph, r: string): string =>
  JSON.stringify([
    work.ids.filter((id) => homeOf(work, id) === r).length,
    childrenOf(work, r)
      .map((c) => [work.regions.get(c)?.label ?? "", shapeOf(work, c)])
      .sort((a, b) => byText(JSON.stringify(a), JSON.stringify(b))),
  ]);

// The regions that echo a region: its siblings of the same shape holding
// regions of their own, and in each region echoing its parent the child of
// the same label and shape. A reader compares echoing regions side by side,
// so they fold to the same depth.
export const echoesOf = (work: WorkGraph, r: string): string[] => {
  const region = work.regions.get(r);
  if (!region) return [];
  const shape = shapeOf(work, r);
  const parent = region.parent ?? null;
  const siblings = work.regionIds.filter((s) => s !== r && (work.regions.get(s)?.parent ?? null) === parent);
  const twins = childrenOf(work, r).length > 0 ? siblings.filter((s) => shapeOf(work, s) === shape) : [];
  const cousins =
    parent === null
      ? []
      : echoesOf(work, parent).flatMap((q) =>
          childrenOf(work, q).filter((c) => work.regions.get(c)?.label === region.label && shapeOf(work, c) === shape),
        );
  return [...new Set([...twins, ...cousins])].sort(byText);
};

// Each ready region folded whole, with every region echoing it in the same
// step, so echoing regions fold alike. A region whose echo is not yet ready
// waits for it; one whose echo cannot fold folds alone.
export const proposeT3 = (ctx: TierContext): Candidate[] =>
  ctx.work.regionIds
    .filter((r) => ready(ctx, r))
    .flatMap((r) => {
      const c = candidateOf(ctx, r);
      if (!c) return [];
      const echoes = echoesOf(ctx.work, r).filter((e) => !ctx.part.regionOf.has(e));
      if (echoes.some((e) => !ready(ctx, e) && candidateOf(ctx, e) !== null)) return [];
      const also = echoes.flatMap((e) => candidateOf(ctx, e) ?? []);
      return [also.length > 0 ? { ...c, also } : c];
    });
