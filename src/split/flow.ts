// Decision regions: single-entry single-exit (SESE) regions of a flowchart or
// stateDiagram, in the sense of Johnson, Pearson and Pingali's program
// structure tree (1994). A region starts at a decision and ends where its
// branches rejoin, the decision's immediate post-dominator. Every edge into
// the region enters the decision, and every edge out of it reaches the rejoin
// node, so folding the region whole into one group invents no path: the
// overview reaches exactly what the original reached.
//
// A branch that ends the flow, at a node with no outgoing edge or an end
// marker, is an outcome of the decision, not a way out of its region. So
// post-dominators are computed on the graph without those terminal nodes, and
// a terminal node a region reaches is folded with it.

import { dominates, immediateDominators } from "./dominators.ts";
import { byNatural, homeOf, isProtectedShape, type WorkGraph } from "./graph.ts";

export interface FlowRegion {
  // The decision the region starts at, which every edge into it enters.
  head: string;
  // The node every edge out of the region reaches, or null when the region
  // ends the flow.
  exit: string | null;
  // Every node of the region, the head included, sorted.
  members: string[];
}

// The families whose edges are a flow, and whose labels name conditions or
// events; an erDiagram or classDiagram edge names a relationship.
const FLOWING = new Set(["flowchart", "state"]);

// A labelled decision: a node whose outgoing edges carry two labels or more,
// with the labels of the edges reaching each of its targets.
export interface Decision {
  source: string;
  targets: Map<string, Set<string>>;
}

const decisionCache = new WeakMap<WorkGraph, Decision[]>();

export const decisionsOf = (work: WorkGraph): Decision[] => {
  const known = decisionCache.get(work);
  if (known) return known;
  const bySource = new Map<string, Decision>();
  if (FLOWING.has(work.family)) {
    for (const e of work.edges) {
      if (e.label === undefined || e.source === e.target) continue;
      const d = bySource.get(e.source) ?? { source: e.source, targets: new Map<string, Set<string>>() };
      d.targets.set(e.target, new Set([...(d.targets.get(e.target) ?? []), e.label]));
      bySource.set(e.source, d);
    }
  }
  const labels = (d: Decision): number => new Set([...d.targets.values()].flatMap((l) => [...l])).size;
  const decisions = [...bySource.values()].filter((d) => labels(d) >= 2);
  decisionCache.set(work, decisions);
  return decisions;
};

// Virtual ends. Ids never hold U+0000.
const ENTRY = "\u0000entry";
const EXIT = "\u0000exit";

// A link with no arrowhead has no direction; it is followed both ways.
const UNDIRECTED = new Set(["---", "-.-", "===", "~~~"]);

interface Flow {
  ids: string[];
  succ: Map<string, string[]>;
  pred: Map<string, string[]>;
}

const link = (flow: Flow, from: string, to: string): void => {
  if (from === to) return;
  const out = flow.succ.get(from) ?? [];
  if (!out.includes(to)) out.push(to);
  flow.succ.set(from, out);
  const inn = flow.pred.get(to) ?? [];
  if (!inn.includes(from)) inn.push(from);
  flow.pred.set(to, inn);
};

// Every node, region endpoint and start or end marker, with the edges between
// them and the start and end transitions.
const flowOf = (work: WorkGraph): Flow => {
  const ends = [...work.edges, ...work.markerEdges].flatMap((e) => [e.source, e.target]);
  const ids = [...new Set([...work.ids, ...work.markers.map((m) => m.id), ...ends])].sort(byNatural);
  const flow: Flow = { ids, succ: new Map(), pred: new Map() };
  for (const e of [...work.edges, ...work.markerEdges]) {
    link(flow, e.source, e.target);
    if (UNDIRECTED.has(e.kind ?? "")) link(flow, e.target, e.source);
  }
  for (const m of [flow.succ, flow.pred]) for (const [k, v] of m) m.set(k, v.sort(byNatural));
  return flow;
};

// Joins a virtual root to every node nothing leads into, then to the first
// node, in natural order, of each part the root still does not reach.
const rooted = (ids: string[], into: Map<string, string[]>, from: Map<string, string[]>): string[] => {
  const roots = ids.filter((id) => (into.get(id) ?? []).length === 0);
  const reached = new Set<string>();
  const visit = (start: string): void => {
    const stack = [start];
    while (stack.length > 0) {
      const v = stack.pop() as string;
      if (reached.has(v)) continue;
      reached.add(v);
      stack.push(...(from.get(v) ?? []));
    }
  };
  for (const r of roots) visit(r);
  for (const id of ids) {
    if (reached.has(id)) continue;
    roots.push(id);
    visit(id);
  }
  return roots;
};

interface Trees {
  flow: Flow;
  // Immediate dominators from the virtual entry.
  idom: Map<string, string>;
  // Immediate post-dominators towards the virtual exit, terminal nodes left out.
  ipdom: Map<string, string>;
}

const treesOf = (flow: Flow): Trees => {
  const entries = rooted(flow.ids, flow.pred, flow.succ);
  const next = (v: string): string[] => (v === ENTRY ? entries : (flow.succ.get(v) ?? []));
  const prev = (v: string): string[] => [...(entries.includes(v) ? [ENTRY] : []), ...(flow.pred.get(v) ?? [])];
  const idom = immediateDominators(ENTRY, next, prev);
  const terminal = new Set(flow.ids.filter((id) => (flow.succ.get(id) ?? []).length === 0));
  const inner = flow.ids.filter((id) => !terminal.has(id));
  const keep = (xs: string[] | undefined): string[] => (xs ?? []).filter((x) => !terminal.has(x));
  const succ = new Map(inner.map((id) => [id, keep(flow.succ.get(id))]));
  const pred = new Map(inner.map((id) => [id, keep(flow.pred.get(id))]));
  const exits = rooted(inner, succ, pred);
  const back = (v: string): string[] => (v === EXIT ? exits : (pred.get(v) ?? []));
  const fore = (v: string): string[] => [...(exits.includes(v) ? [EXIT] : []), ...(succ.get(v) ?? [])];
  return { flow, idom, ipdom: immediateDominators(EXIT, back, fore) };
};

// A state a composite's start or end marker reaches is pinned to that box,
// and a composite, a stub or a region endpoint is never a member.
const memberOk = (work: WorkGraph, head: string): ((id: string) => boolean) => {
  const markers = new Set(work.markers.map((m) => m.id));
  const boxed = new Set(work.markers.filter((m) => m.parent !== null).map((m) => m.id));
  const pinned = new Set(
    work.markerEdges.flatMap((e) => (boxed.has(e.source) ? [e.target] : boxed.has(e.target) ? [e.source] : [])),
  );
  const home = homeOf(work, head);
  return (id) =>
    markers.has(id) ||
    (work.nodes.has(id) &&
      !work.nodes.get(id)?.owns &&
      !work.stubs.has(id) &&
      !pinned.has(id) &&
      homeOf(work, id) === home);
};

// The nodes the head reaches without passing the exit.
const reach = (flow: Flow, head: string, exit: string | null): Set<string> => {
  const seen = new Set<string>([head]);
  const stack = [head];
  while (stack.length > 0) {
    for (const v of flow.succ.get(stack.pop() as string) ?? []) {
      if (v === exit || seen.has(v)) continue;
      seen.add(v);
      stack.push(v);
    }
  }
  return seen;
};

// The region from head to exit, or null when it is not single-entry
// single-exit: a node in it the head does not dominate, an edge entering it
// anywhere but the head, or an edge leaving it anywhere but the exit.
const regionOf = (work: WorkGraph, t: Trees, head: string, exit: string | null): FlowRegion | null => {
  const inside = reach(t.flow, head, exit);
  const ok = memberOk(work, head);
  for (const v of inside) {
    if (!(ok(v) && dominates(t.idom, head, v))) return null;
    if (v !== head && (t.flow.pred.get(v) ?? []).some((u) => !inside.has(u))) return null;
    if ((t.flow.succ.get(v) ?? []).some((w) => !inside.has(w) && w !== exit)) return null;
  }
  const members = [...inside].filter((id) => work.nodes.has(id)).sort(byNatural);
  return members.length < 2 ? null : { head, exit, members };
};

// A decision: a decision shape, a choice or a fork, or a node whose outgoing
// edges carry two labels or more, that leads to two nodes or more.
const headsOf = (work: WorkGraph, flow: Flow): string[] => {
  const labelled = new Set(decisionsOf(work).map((d) => d.source));
  return work.ids.filter((id) => {
    const shape = work.nodes.get(id)?.shape;
    const decides = labelled.has(id) || (isProtectedShape(shape) && shape !== "join");
    return decides && (flow.succ.get(id) ?? []).length >= 2;
  });
};

// The head's region: to its immediate post-dominator, or failing that to the
// nearest post-dominator above it that closes a single-entry single-exit
// region. A longer region would be a sequence of regions, which chain stages
// fold.
const regionFrom = (work: WorkGraph, t: Trees, head: string): FlowRegion[] => {
  for (let p = t.ipdom.get(head); p !== undefined; p = p === EXIT ? undefined : t.ipdom.get(p)) {
    const r = regionOf(work, t, head, p === EXIT ? null : p);
    if (r) return [r];
  }
  return [];
};

const cache = new WeakMap<WorkGraph, FlowRegion[]>();

// Every decision region of the diagram, smallest first, then by head.
export const flowRegionsOf = (work: WorkGraph): FlowRegion[] => {
  const known = cache.get(work);
  if (known) return known;
  const regions: FlowRegion[] = [];
  if (FLOWING.has(work.family)) {
    const t = treesOf(flowOf(work));
    const seen = new Set<string>();
    for (const r of headsOf(work, t.flow).flatMap((h) => regionFrom(work, t, h))) {
      const key = r.members.join("\u0000");
      if (!seen.has(key)) regions.push(r);
      seen.add(key);
    }
    regions.sort((a, b) => a.members.length - b.members.length || byNatural(a.head, b.head));
  }
  cache.set(work, regions);
  return regions;
};
