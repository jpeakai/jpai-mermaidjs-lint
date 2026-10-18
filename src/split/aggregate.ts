// erDiagram aggregates: which entity owns which, the root each ownership
// chain ends at, and the junctions between two roots.

import type { GraphEdge } from "../parse/graph.ts";
import { byText, type WorkGraph } from "./graph.ts";

// An erDiagram relationship as graph.ts reads it from erDb: each end by its
// Cardinality name (from beside the source, to beside the target), and
// whether the relationship is identifying.
type ErEdge = GraphEdge & { ends?: { from: string; to: string }; identifying?: boolean };

const ONE = "ONLY_ONE";
// What a dependent's own end may be: many, or at most one.
const DEPENDENT = new Set(["ONE_OR_MORE", "ZERO_OR_MORE", "ZERO_OR_ONE"]);

// The parent an edge makes of one end, with exactly one at the parent's end.
const parentLink = (e: ErEdge): { parent: string; child: string } | null => {
  if (!e.ends || e.source === e.target) return null;
  const { from, to } = e.ends;
  if (from === ONE && DEPENDENT.has(to)) return { parent: e.source, child: e.target };
  if (to === ONE && DEPENDENT.has(from)) return { parent: e.target, child: e.source };
  return null;
};

const identifyingParents = (work: WorkGraph): Map<string, Set<string>> => {
  const parents = new Map<string, Set<string>>();
  for (const e of work.edges as ErEdge[]) {
    const link = e.identifying ? parentLink(e) : null;
    if (link) parents.set(link.child, new Set([...(parents.get(link.child) ?? []), link.parent]));
  }
  return parents;
};

const ownerCache = new WeakMap<WorkGraph, Map<string, string>>();

// An entity's owner: its one identifying parent, or, with none, the entity a
// leaf relates to with exactly one at that end.
const ownerOf = (work: WorkGraph, identified: Map<string, Set<string>>, id: string): string | undefined => {
  const parents = identified.get(id);
  if (parents) return parents.size === 1 ? [...parents][0] : undefined;
  const touching = (work.edges as ErEdge[]).filter((e) => e.source === id || e.target === id);
  const leaf = touching.length === 1 ? parentLink(touching[0] as ErEdge) : null;
  return leaf?.child === id ? leaf.parent : undefined;
};

// Breaks each cycle of owners at the smallest id on it.
const breakCycles = (owners: Map<string, string>): void => {
  for (const id of [...owners.keys()].sort(byText)) {
    const path = [id];
    for (let x = owners.get(id); x !== undefined; x = owners.get(x)) {
      const at = path.indexOf(x);
      if (at >= 0) {
        owners.delete([...path.slice(at)].sort(byText)[0] as string);
        break;
      }
      path.push(x);
    }
  }
};

// Each owned entity's owner.
export const ownersOf = (work: WorkGraph): Map<string, string> => {
  const known = ownerCache.get(work);
  if (known) return known;
  const owners = new Map<string, string>();
  const identified = identifyingParents(work);
  for (const id of work.ids) {
    const owner = ownerOf(work, identified, id);
    if (owner !== undefined && owner !== id) owners.set(id, owner);
  }
  breakCycles(owners);
  ownerCache.set(work, owners);
  return owners;
};

export const rootOf = (work: WorkGraph, id: string): string => {
  const owners = ownersOf(work);
  let x = id;
  for (let up = owners.get(x); up !== undefined; up = owners.get(x)) x = up;
  return x;
};

// An entity identified by two entities or more that lie in different
// aggregates: a junction between two roots.
export const isJunction = (work: WorkGraph, id: string): boolean => {
  if (work.family !== "er") return false;
  const parents = identifyingParents(work).get(id);
  return parents !== undefined && new Set([...parents].map((p) => rootOf(work, p))).size >= 2;
};

// The aggregate an entity heads: itself and everything it owns.
export const aggregateOf = (work: WorkGraph, head: string): string[] => {
  const owners = ownersOf(work);
  return work.ids.filter((id) => {
    for (let x: string | undefined = id; x !== undefined; x = owners.get(x)) if (x === head) return true;
    return false;
  });
};
