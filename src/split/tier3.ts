// T3, author regions, innermost first: a flowchart subgraph, a composite
// state or a class namespace folds to one group node carrying its own label.
// A region is ready once every region inside it holding a node has folded.

import { homeOf, regionWithin, type WorkGraph } from "./graph.ts";
import { overviewKeys, parentOfKey } from "./quotient.ts";
import type { Candidate, TierContext } from "./tier.ts";

const holdsNode = (work: WorkGraph, region: string): boolean =>
  work.ids.some((id) => regionWithin(work, homeOf(work, id), region));

const childrenOf = (work: WorkGraph, region: string): string[] =>
  work.regionIds.filter((r) => work.regions.get(r)?.parent === region);

const descendants = (work: WorkGraph, region: string): string[] =>
  work.regionIds.filter((r) => r !== region && regionWithin(work, r, region));

const ready = (ctx: TierContext, region: string): boolean =>
  !ctx.part.regionOf.has(region) &&
  holdsNode(ctx.work, region) &&
  childrenOf(ctx.work, region).every((c) => ctx.part.regionOf.has(c) || !holdsNode(ctx.work, c));

export const proposeT3 = (ctx: TierContext): Candidate[] => {
  const { work, part } = ctx;
  return work.regionIds
    .filter((r) => ready(ctx, r))
    .map((r) => {
      const region = work.regions.get(r);
      const owner = region?.owner;
      const keys = overviewKeys(work, part).filter((k) => k === owner || parentOfKey(work, part, k) === r);
      return {
        keys,
        regions: [r, ...descendants(work, r).filter((d) => !part.regionOf.has(d))],
        parent: region?.parent ?? null,
        tier: "T3",
        reason: "author region",
      };
    });
};
