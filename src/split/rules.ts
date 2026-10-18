// What T5 and T6 may not fold, so an overview still tells the diagram's story:
// its hubs stay in view, a decision's branches stay apart, and no group hides
// a single node. A plan holds to these first and relaxes them, in order, only
// when the target cannot be met otherwise.

import { type Decision, decisionsOf, flowRegionsOf } from "./flow.ts";
import { byNatural, type WorkGraph } from "./graph.ts";

export interface FoldRules {
  // A hub keeps its own overview node.
  keepHubs: boolean;
  // Two targets of one decision's differently labelled branches never share
  // a group, unless the branches rejoin inside it.
  keepBranches: boolean;
  // The fewest nodes a T5 or T6 group hides.
  minHidden: number;
}

export const STRICT: FoldRules = { keepHubs: true, keepBranches: true, minHidden: 2 };

// Hubs and branches folded too. A group hiding one node is still undone or
// merged after the walk wherever that keeps the target.
export const LOOSE: FoldRules = { keepHubs: false, keepBranches: false, minHidden: 2 };

// The rules a plan is walked with: strict first, then loose, and last, for a
// diagram no other walk plans, with groups hiding one node allowed too.
export const RELAXED: readonly FoldRules[] = [STRICT, LOOSE, { ...LOOSE, minHidden: 1 }];

// A hub has degree at least four and at least the 90th percentile degree,
// by nearest rank over every node.
const HUB_DEGREE = 4;
const HUB_RANK = 0.9;

const hubCache = new WeakMap<WorkGraph, Set<string>>();

export const hubsOf = (work: WorkGraph): Set<string> => {
  const known = hubCache.get(work);
  if (known) return known;
  const degrees = work.ids.map((id) => work.degree.get(id) ?? 0).sort((a, b) => a - b);
  const rank = degrees[Math.max(0, Math.ceil(HUB_RANK * degrees.length) - 1)] ?? 0;
  const least = Math.max(HUB_DEGREE, rank);
  const hubs = new Set(work.ids.filter((id) => (work.degree.get(id) ?? 0) >= least));
  hubCache.set(work, hubs);
  return hubs;
};

// The members a member reaches along edges between members, itself included.
const reachInside = (work: WorkGraph, members: Set<string>, start: string): Set<string> => {
  const seen = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const v = stack.pop() as string;
    for (const e of work.edges) {
      if (e.source !== v || !members.has(e.target) || seen.has(e.target)) continue;
      seen.add(e.target);
      stack.push(e.target);
    }
  }
  return seen;
};

// Whether one label reaches one target and another label the other.
const apart = (a: Set<string>, b: Set<string>): boolean => [...a].some((x) => [...b].some((y) => x !== y));

// Whether a group of these members would hold two targets of one decision's
// differently labelled branches that do not rejoin inside the group. A group
// holding a whole decision region holds the decision's branches with it.
export const splitsBranches = (work: WorkGraph, members: readonly string[]): boolean => {
  const inside = new Set(members);
  const whole = new Set(
    flowRegionsOf(work)
      .filter((r) => r.members.every((m) => inside.has(m)))
      .map((r) => r.head),
  );
  return decisionsOf(work).some((d) => !whole.has(d.source) && splitsDecision(work, inside, d));
};

const splitsDecision = (work: WorkGraph, inside: Set<string>, d: Decision): boolean => {
  const held = [...d.targets.keys()].filter((t) => inside.has(t)).sort(byNatural);
  return held.some((x, i) =>
    held.slice(i + 1).some((y) => {
      if (!apart(d.targets.get(x) ?? new Set(), d.targets.get(y) ?? new Set())) return false;
      const ry = reachInside(work, inside, y);
      return ![...reachInside(work, inside, x)].some((v) => ry.has(v));
    }),
  );
};
