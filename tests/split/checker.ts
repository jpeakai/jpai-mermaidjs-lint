// A strict, text-only checker for split plans, kept apart from faithful.ts
// and from the split code. Every fact about an emitted diagram comes from
// parsing its source again with the shipped parsers (MJL-0022). The plan's
// own data is read only to pair each detail with its group, since the
// emitted text carries no link, and that pairing is checked from the text.
// A BUG finding means a reader is misled or something is lost; an AMBIG one
// means a stub or a group label reads more than one way.
//
// Two behaviours are declared and accepted exactly:
// - An overview transition between a start or end marker and a group stands
//   for all of that marker's transitions into the group's members (MJL-0026).
//   It must be backed by real original transitions of the same marker and
//   direction, carry exactly the label they all agree on (none when they
//   differ), be drawn once, and every transition beyond the first counts in
//   loss.mergedMarkers.
// - An erDiagram overview never merges two labels or two cardinalities, so an
//   overview edge with a group at an end stands for the edges of one pair, one
//   label and one cardinality, and each such class is drawn exactly once. Any
//   other family draws one edge per directed pair with the attributes all its
//   edges agree on. An undirected edge may also stand for the pair written
//   the other way, counted in loss.reversedEdges.

import { type DiagramGraph, extractGraph, type GraphEdge, type GraphNode } from "../../src/parse/graph.ts";
import { calculateComplexity, type ThresholdConfig } from "../../src/parse/metrics.ts";
import { extractStats } from "../../src/parse/stats.ts";
import type { SplitPlan } from "../../src/split/types.ts";

export type Severity = "BUG" | "AMBIG" | "WARN" | "INFO";

export interface Finding {
  sev: Severity;
  kind: string;
  msg: string;
}

const MARK = new Set(["stateStart", "stateEnd"]);
const UNDIRECTED = new Set(["---", "-.-", "===", "~~~", "--", ".."]);
const GROUP_LABEL = /^(.*) \(\+(\d+)\)(?: \[(g\d+)\])?$/s;
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const glen = (s: string): number => [...graphemes.segment(s)].length;

// A label cut in its middle: the label itself, or a head and tail of it around
// an ellipsis, at most forty graphemes, from a label longer than forty.
const cutOf = (shown: string, label: string): boolean => {
  if (shown === label) return true;
  const at = shown.indexOf("…");
  if (at < 0 || glen(shown) > 40 || glen(label) <= 40) return false;
  const [h, t] = [shown.slice(0, at), shown.slice(at + 1)];
  return (
    h.length >= 10 && t.length >= 5 && label.startsWith(h) && label.endsWith(t) && h.length + t.length < label.length
  );
};

const measure = async (src: string, cfg: ThresholdConfig) => {
  const s = await extractStats(src);
  return {
    error: s.error,
    nodes: s.nodes,
    score: s.error ? Number.NaN : calculateComplexity(s, cfg).visual_complexity_score,
  };
};

const over = (m: { nodes: number; score: number }, cfg: ThresholdConfig): boolean =>
  m.nodes > cfg.node_target || m.score > cfg.vcs_target;

// A lollipop interface by its label, since mermaid numbers interfaces afresh.
const nameEnds = (g: DiagramGraph): ((x: string) => string) => {
  const lol = new Map((g.pseudo?.nodes ?? []).filter((p) => p.shape === "lollipop").map((p) => [p.id, `()${p.label}`]));
  return (x) => lol.get(x) ?? x;
};
const ek = (s: string, t: string, e: GraphEdge): string =>
  JSON.stringify([s, t, e.label ?? "", e.kind ?? "", e.cardinality ?? "", e.markdown ? 1 : 0]);
const nk = (n: GraphNode): string => JSON.stringify([n.id, n.label, n.shape ?? "", n.markdown ? 1 : 0]);
const rk = (s: GraphNode): string => JSON.stringify([s.id, s.label, s.markdown ? 1 : 0]);

const multisetDiff = (want: string[], got: string[]): { missing: string[]; extra: string[] } => {
  const c = new Map<string, number>();
  for (const k of want) c.set(k, (c.get(k) ?? 0) + 1);
  const extra: string[] = [];
  for (const k of got) {
    const n = c.get(k) ?? 0;
    if (n > 0) c.set(k, n - 1);
    else extra.push(k);
  }
  return { missing: [...c].flatMap(([k, n]) => Array<string>(n).fill(k)), extra };
};

const bump = (m: Map<string, number>, k: string): void => {
  m.set(k, (m.get(k) ?? 0) + 1);
};

interface Det {
  gid: string;
  D: DiagramGraph;
  members: GraphNode[];
  stubs: GraphNode[];
}

interface Shown {
  label: string;
  base: string;
  n: number;
}

interface Ctx {
  G: DiagramGraph;
  O: DiagramGraph;
  plan: SplitPlan;
  add: (sev: Severity, kind: string, msg: string) => void;
  nodeById: Map<string, GraphNode>;
  subById: Map<string, GraphNode>;
  isOrig: (id: string) => boolean;
  lolLabels: Set<string>;
  groupIds: Set<string>;
  groupNodes: GraphNode[];
  keptNodes: GraphNode[];
  shown: Map<string, Shown>;
  dets: Det[];
  groupOf: Map<string, string>;
  regionGroup: Map<string, string>;
  ovSubs: Set<string>;
  ov: (x: string) => string;
}

const readGroupLabels = (c: Pick<Ctx, "add" | "groupNodes" | "O" | "G">): Map<string, Shown> => {
  const shown = new Map<string, Shown>();
  for (const n of c.groupNodes) {
    const m = GROUP_LABEL.exec(n.label);
    if (!m) {
      c.add("BUG", "glabel", `group ${n.id} label "${n.label}" has no (+N)`);
      continue;
    }
    if (m[3] && m[3] !== n.id) c.add("BUG", "glabel", `group ${n.id} label tag [${m[3]}] names another id`);
    shown.set(n.id, { label: n.label, base: m[1] ?? "", n: Number(m[2]) });
  }
  const count = new Map<string, number>();
  for (const n of c.O.nodes) bump(count, n.label);
  for (const n of c.groupNodes) {
    if ((count.get(n.label) ?? 0) > 1)
      c.add("AMBIG", "glabel", `group ${n.id} label "${n.label}" also labels another node`);
    const lit = c.G.nodes.filter((x) => x.label === n.label).map((x) => x.id);
    if (lit.length) c.add("AMBIG", "glabel", `group ${n.id} label "${n.label}" equals the label of ${lit}`);
  }
  return shown;
};

type Reader = Pick<Ctx, "add" | "nodeById" | "subById" | "isOrig"> & { cfg: ThresholdConfig; path: string };

const readDetail = async (c: Reader, d: SplitPlan["details"][number], nested: Finding[]): Promise<Det | null> => {
  const dm = await measure(d.source, c.cfg);
  if (dm.error) {
    c.add("BUG", "parse", `detail ${d.group} does not parse: ${dm.error}`);
    return null;
  }
  if (!d.split && over(dm, c.cfg)) c.add("BUG", "threshold", `detail ${d.group} ${dm.nodes}n/${dm.score} over target`);
  const D = await extractGraph(d.source);
  for (const n of D.nodes.filter((x) => c.subById.has(x.id) && !c.nodeById.has(x.id)))
    c.add("BUG", "detail", `detail ${d.group} draws region ${n.id}`);
  if (d.split) nested.push(...(await checkPlan(d.source, d.split, c.cfg, `${c.path}/${d.group}`)));
  const members = D.nodes.filter((n) => c.nodeById.has(n.id));
  return { gid: d.group, D, members, stubs: D.nodes.filter((n) => !c.isOrig(n.id)) };
};

const readDetails = async (c: Reader, plan: SplitPlan, nested: Finding[]): Promise<Det[]> => {
  const dets: Det[] = [];
  for (const d of plan.details) {
    const det = await readDetail(c, d, nested);
    if (det) dets.push(det);
  }
  for (const r of plan.rowDetails ?? []) {
    const rm = await measure(r.source, c.cfg);
    if (rm.error) c.add("BUG", "parse", `row detail does not parse: ${rm.error}`);
    else if (over(rm, c.cfg)) c.add("BUG", "threshold", `row detail ${rm.nodes}n/${rm.score} over target`);
  }
  return dets;
};

// Membership from text: a detail's members are its original-id nodes, and its
// folded regions are the subgraphs the overview does not draw.
const membership = (c: Pick<Ctx, "add" | "dets" | "ovSubs">) => {
  const groupOf = new Map<string, string>();
  const regionGroup = new Map<string, string>();
  for (const d of c.dets) {
    for (const m of d.members) {
      const was = groupOf.get(m.id);
      if (was) c.add("BUG", "partition", `node ${m.id} is a member of ${was} and ${d.gid}`);
      groupOf.set(m.id, d.gid);
    }
    for (const s of d.D.subgraphs.filter((x) => !c.ovSubs.has(x.id))) {
      const was = regionGroup.get(s.id);
      if (was && was !== d.gid) c.add("WARN", "region", `region ${s.id} drawn as folded in ${was} and ${d.gid}`);
      regionGroup.set(s.id, d.gid);
    }
  }
  return { groupOf, regionGroup };
};

const checkPartition = (c: Ctx): void => {
  for (const n of c.G.nodes) {
    const k = c.keptNodes.filter((x) => x.id === n.id).length + (c.groupOf.has(n.id) ? 1 : 0);
    if (k !== 1) c.add("BUG", "partition", `original node ${n.id} appears ${k} times`);
  }
  for (const d of c.dets) {
    checkGroupLabel(c, d);
    if (d.members.length <= 1) c.add("WARN", "useless", `group ${d.gid} holds ${d.members.length} member(s)`);
  }
};

// A group label is a member's or a folded region's label, cut by rule, and
// counts the members it does not name.
const checkGroupLabel = (c: Ctx, d: Det): void => {
  const gs = c.shown.get(d.gid);
  if (!gs) return;
  const fromMember = d.members.some((m) => cutOf(gs.base, m.label));
  const folded = d.D.subgraphs.filter((s) => !c.ovSubs.has(s.id));
  const fromRegion = folded.some((s) => cutOf(gs.base, s.label));
  if (!(fromMember || fromRegion)) c.add("BUG", "glabel", `group ${d.gid} base "${gs.base}" names no member or region`);
  const okN = (fromMember && gs.n === d.members.length - 1) || (fromRegion && gs.n === d.members.length);
  if (!okN) c.add("BUG", "glabel", `group ${d.gid} says +${gs.n} but its detail holds ${d.members.length} members`);
};

const checkNodes = (c: Ctx): void => {
  for (const n of c.keptNodes) {
    const o = c.nodeById.get(n.id) ?? c.subById.get(n.id);
    if (o && nk(n) !== nk(o)) c.add("BUG", "node", `overview kept ${nk(n)} != original ${nk(o)}`);
  }
  const got = [...c.keptNodes.filter((n) => c.nodeById.has(n.id)), ...c.dets.flatMap((d) => d.members)].map(nk);
  const { missing, extra } = multisetDiff(c.G.nodes.map(nk), got);
  for (const k of missing) c.add("BUG", "node", `node not recovered: ${k}`);
  for (const k of extra) c.add("BUG", "node", `node drawn differently: ${k}`);
};

// A namespace a classDiagram detail draws around a dotted name may repeat one
// drawn elsewhere, so a classDiagram counts a region once.
const checkRegions = (c: Ctx): void => {
  const want = c.G.subgraphs.map(rk);
  const all = [...c.O.subgraphs, ...c.dets.flatMap((d) => d.D.subgraphs)].map(rk);
  const got = c.G.diagram_type.startsWith("class") ? [...new Set(all)] : all;
  const { missing, extra } = multisetDiff(want, got);
  for (const k of missing) c.add("BUG", "region", `region not recovered: ${k}`);
  for (const k of extra) c.add(want.includes(k) ? "WARN" : "BUG", "region", `region drawn extra or differently: ${k}`);
};

const checkParents = (c: Ctx): void => {
  const nearest = (p: string | null, drawn: Set<string>): string | null => {
    for (let r = p; r; r = c.subById.get(r)?.parent ?? null) if (drawn.has(r)) return r;
    return null;
  };
  const views: Array<[string, DiagramGraph]> = [
    ["overview", c.O],
    ...c.dets.map((d): [string, DiagramGraph] => [`detail ${d.gid}`, d.D]),
  ];
  for (const [name, D] of views) {
    const drawn = new Set(D.subgraphs.map((s) => s.id));
    for (const n of [...D.nodes, ...D.subgraphs]) {
      const o = c.nodeById.get(n.id) ?? c.subById.get(n.id);
      if (!o) continue;
      const want = nearest(o.parent, drawn);
      if (n.parent !== want)
        c.add("BUG", "parent", `${name}: ${n.id} parent ${n.parent} but nearest drawn ancestor is ${want}`);
    }
  }
};

// Every referent a stub's text names, by each form a plan writes: a label as
// it is, a group's shown label, a label with " (in group)" or with its group's
// shown label in brackets, and any of these with " [id]" naming one reading.
const stubReader = (c: Ctx): ((s: string) => Set<string>) => {
  const byLabel = new Map<string, string[]>();
  const referents = [
    ...c.G.nodes.map((n) => [n.label, n.id]),
    ...c.G.subgraphs.filter((s) => s.label !== "").map((s) => [s.label, s.id]),
    ...[...c.lolLabels].map((l) => [l.slice(2), l]),
  ];
  for (const [label = "", id = ""] of referents) byLabel.set(label, [...(byLabel.get(label) ?? []), id]);
  const heldBy = (own: string, fits: (base: string) => boolean): string[] =>
    (byLabel.get(own) ?? []).filter((id) => {
      const g = c.ov(id);
      const base = c.shown.get(g)?.base;
      return g !== id && base !== undefined && fits(base);
    });
  const inGroup = (S: string): string[] => {
    const own = S.slice(0, -" (in group)".length);
    const named = S.endsWith(" (in group)") ? heldBy(own, (b) => cutOf(b, own)) : [];
    if (!S.endsWith(")")) return named;
    const cuts = [...S.matchAll(/ \(/g)].map((m) => m.index ?? 0);
    return [...named, ...cuts.flatMap((at) => heldBy(S.slice(0, at), (b) => b === S.slice(at + 2, -1)))];
  };
  const tagged = (S: string): string[] => {
    const tag = /^(.*) \[([^\]]+)\]$/s.exec(S);
    if (!tag) return [];
    const inner = read(tag[1] ?? "");
    return [tag[2] ?? "", `group:${tag[2]}`].filter((x) => inner.has(x)).slice(0, 1);
  };
  const read = (S: string): Set<string> =>
    new Set([
      ...(byLabel.get(S) ?? []),
      ...[...c.shown].filter(([, gs]) => gs.label === S).map(([gid]) => `group:${gid}`),
      ...tagged(S),
      ...inGroup(S),
    ]);
  return read;
};

// A stub's one reading: the endpoint the plan claims when its text names it.
const readStub = (c: Ctx, d: Det, s: GraphNode, read: (s: string) => Set<string>): string | null => {
  const r = read(s.label);
  if (r.size === 0) {
    c.add("BUG", "stub", `detail ${d.gid} stub ${s.id} "${s.label}" names nothing`);
    return null;
  }
  if (r.size > 1) c.add("AMBIG", "stub", `detail ${d.gid} stub ${s.id} "${s.label}" reads as ${[...r].join(" | ")}`);
  const claimed = c.plan.details.find((x) => x.group === d.gid)?.stubs[s.id];
  if (claimed === undefined) return [...r][0] ?? null;
  const named = [claimed, `group:${claimed}`].find((x) => r.has(x));
  if (named === undefined)
    c.add("BUG", "stub", `detail ${d.gid} stub ${s.id} "${s.label}" does not name its endpoint ${claimed}`);
  return named ?? [...r][0] ?? null;
};

const readStubs = (c: Ctx): Map<string, Map<string, string>> => {
  const read = stubReader(c);
  const out = new Map<string, Map<string, string>>();
  for (const d of c.dets) {
    const m = new Map<string, string>();
    for (const s of d.stubs) {
      const r = readStub(c, d, s, read);
      if (r !== null) m.set(s.id, r);
    }
    out.set(d.gid, m);
  }
  return out;
};

// A detail's edges, each read back to original ends: exact edges, and half
// edges from a whole-group stub into a member.
const detailEdges = (c: Ctx, d: Det, sr: Map<string, string>, out: { exact: string[]; halves: string[] }): void => {
  const dEnd = nameEnds(d.D);
  const isStub = (x: string): boolean => !(c.isOrig(x) || c.lolLabels.has(x));
  const end = (x: string): string => (isStub(x) ? (sr.get(x) ?? "?") : x);
  for (const e of d.D.edges) {
    const [a, b] = [dEnd(e.source), dEnd(e.target)];
    const problem = edgeProblem(c, isStub, [a, b], [end(a), end(b)]);
    if (problem) c.add(problem[0], "edge", `detail ${d.gid} ${problem[1]}`);
    else if (end(a).startsWith("group:")) out.halves.push(ek(end(a).slice(6), end(b), e));
    else out.exact.push(ek(end(a), end(b), e));
  }
};

const edgeProblem = (
  c: Ctx,
  isStub: (x: string) => boolean,
  [a, b]: [string, string],
  [A, B]: [string, string],
): [Severity, string] | null => {
  if (isStub(a) && isStub(b)) return ["BUG", `edge between stubs ${a}->${b}`];
  if (A.startsWith("group:")) return null;
  if (B.startsWith("group:")) return ["BUG", `edge into a whole-group stub ${a}->${b}`];
  if (isStub(a) && c.ov(A) !== A) return ["WARN", `stub ${a} names ${A} of another group`];
  return null;
};

// Each original edge once: from the overview between kept nodes, else from a
// detail. A stub read as a whole group gives a half edge into a member.
const checkEdges = (c: Ctx, stubRef: Map<string, Map<string, string>>): void => {
  const [gEnd, oEnd] = [nameEnds(c.G), nameEnds(c.O)];
  const exact = c.O.edges
    .filter((e) => !(c.groupIds.has(oEnd(e.source)) || c.groupIds.has(oEnd(e.target))))
    .map((e) => ek(oEnd(e.source), oEnd(e.target), e));
  const out = { exact, halves: [] as string[] };
  for (const d of c.dets) detailEdges(c, d, stubRef.get(d.gid) ?? new Map(), out);
  const { missing, extra } = multisetDiff(
    c.G.edges.map((e) => ek(gEnd(e.source), gEnd(e.target), e)),
    out.exact,
  );
  for (const k of missing) c.add("BUG", "edge", `edge not recovered: ${k}`);
  for (const k of extra) c.add("BUG", "edge", `edge invented or duplicated: ${k}`);
  const wantHalves = c.G.edges.flatMap((e) => {
    const [s, t] = [gEnd(e.source), gEnd(e.target)];
    return c.ov(s) !== s && c.ov(t) !== t && c.ov(s) !== c.ov(t) ? [ek(c.ov(s), t, e)] : [];
  });
  const h = multisetDiff(wantHalves, out.halves);
  for (const k of h.missing) c.add("WARN", "half", `cross-group edge not shown in its target detail: ${k}`);
  for (const k of h.extra) c.add("BUG", "half", `whole-group stub edge with no original: ${k}`);
};

// The original edges one overview edge with a group at an end stands for.
const witnessesOf = (c: Ctx, e: GraphEdge, pairs: Set<string>): { fwd: GraphEdge[]; back: GraphEdge[] } => {
  const [gEnd, oEnd] = [nameEnds(c.G), nameEnds(c.O)];
  const [u, v] = [oEnd(e.source), oEnd(e.target)];
  const isEr = c.G.diagram_type === "er";
  const same = (w: GraphEdge, a: string, b: string): boolean =>
    c.ov(gEnd(w.source)) === a && c.ov(gEnd(w.target)) === b;
  const sameClass = (w: GraphEdge): boolean =>
    !isEr || ((w.label ?? "") === (e.label ?? "") && (w.cardinality ?? "") === (e.cardinality ?? ""));
  // the other direction folds in only when the overview draws no edge for it
  const reversible = !isEr && u !== v && UNDIRECTED.has(e.kind ?? "") && !e.cardinality && !pairs.has(`${v}\u0000${u}`);
  return {
    fwd: c.G.edges.filter((w) => same(w, u, v) && sameClass(w)),
    back: reversible ? c.G.edges.filter((w) => same(w, v, u)) : [],
  };
};

const soundEdge = (c: Ctx, e: GraphEdge, wit: GraphEdge[], name: string): void => {
  if (wit.length === 0) c.add("BUG", "sound", `overview edge ${name} "${e.label ?? ""}" has no original witness`);
  if (e.label && wit.some((w) => (w.label ?? "") !== e.label))
    c.add("BUG", "sound", `overview edge ${name} label "${e.label}" not on every witness`);
  if (e.kind && !["-->", "arrow_point", ""].includes(e.kind) && wit.some((w) => w.kind !== e.kind))
    c.add("BUG", "sound", `overview edge ${name} kind ${e.kind} not on every witness`);
  if (e.cardinality && wit.some((w) => w.cardinality !== e.cardinality))
    c.add("BUG", "sound", `overview edge ${name} cardinality not on every witness`);
};

// Each overview edge with a group at an end against its witnesses, once per
// class; the witnesses covered and the ones drawn the other way.
const groupEdges = (c: Ctx, pairs: Set<string>): { covered: Set<GraphEdge>; reversed: number } => {
  const oEnd = nameEnds(c.O);
  const classes = new Map<string, number>();
  const covered = new Set<GraphEdge>();
  let reversed = 0;
  const er = c.G.diagram_type === "er";
  for (const e of c.O.edges) {
    const [u, v] = [oEnd(e.source), oEnd(e.target)];
    if (!(c.groupIds.has(u) || c.groupIds.has(v))) continue;
    bump(classes, JSON.stringify(er ? [u, v, e.label ?? "", e.cardinality ?? ""] : [u, v]));
    const { fwd, back } = witnessesOf(c, e, pairs);
    for (const w of [...fwd, ...back]) covered.add(w);
    reversed += back.length;
    soundEdge(c, e, [...fwd, ...back], `${u}->${v}`);
  }
  for (const [cls, n] of classes) if (n > 1) c.add("BUG", "sound", `overview draws the edge class ${cls} ${n} times`);
  return { covered, reversed };
};

const checkOverviewEdges = (c: Ctx): void => {
  const [gEnd, oEnd] = [nameEnds(c.G), nameEnds(c.O)];
  const pairs = new Set(c.O.edges.map((e) => `${oEnd(e.source)}\u0000${oEnd(e.target)}`));
  const { covered, reversed } = groupEdges(c, pairs);
  const declared = c.plan.loss.reversedEdges;
  if (reversed !== declared)
    c.add("BUG", "sound", `overview draws ${reversed} edges the other way, plan declares ${declared}`);
  for (const w of c.G.edges) {
    const [u, v] = [c.ov(gEnd(w.source)), c.ov(gEnd(w.target))];
    const grouped = c.groupIds.has(u) || c.groupIds.has(v);
    if (u === v && grouped) continue;
    if (grouped ? covered.has(w) : pairs.has(`${u}\u0000${v}`)) continue;
    c.add(
      "BUG",
      "complete",
      `original edge ${w.source}->${w.target} "${w.label ?? ""}" has no overview edge ${u}->${v}`,
    );
  }
};

type Mark = [string, string | null, string, string, string];

const marks = (g: DiagramGraph, keep: (r: string) => boolean): Mark[] => {
  const pn = new Map((g.pseudo?.nodes ?? []).filter((p) => MARK.has(p.shape ?? "")).map((p) => [p.id, p]));
  return (g.pseudo?.edges ?? []).flatMap((e): Mark[] => {
    const m = pn.get(e.source) ?? pn.get(e.target);
    const r = pn.has(e.source) ? e.target : e.source;
    if (!(m && keep(r))) return [];
    return [[m.shape ?? "", m.parent, r, pn.has(e.source) ? "out" : "in", e.label ?? ""]];
  });
};

// One overview transition onto a group against the originals it stands for:
// how many of them it merges beyond the first.
const mergedTransition = (c: Ctx, want: Mark[], [shape, scope, r, dir, label]: Mark): number => {
  const key = JSON.stringify([shape, scope, r, dir]);
  const wit = want.filter((w) => w[0] === shape && w[1] === scope && w[3] === dir && c.ov(w[2]) === r);
  if (!c.groupIds.has(r) || wit.length === 0) {
    c.add("BUG", "marker", `overview marker transition ${key} has no original transition into a group's member`);
    return 0;
  }
  const agreed = wit.every((w) => w[4] === wit[0]?.[4]) ? (wit[0]?.[4] ?? "") : "";
  if (label !== agreed)
    c.add(
      "BUG",
      "marker",
      `overview marker transition ${key} labelled "${label}", its transitions agree on "${agreed}"`,
    );
  return wit.length - 1;
};

// Transitions the overview draws onto a group: each backed and labelled as its
// originals agree, drawn once, none dropped, and the merged count declared.
const checkMergedMarkers = (c: Ctx, want: Mark[]): void => {
  const seen = new Map<string, number>();
  let merged = 0;
  for (const m of marks(c.O, (x) => !c.nodeById.has(x))) {
    bump(seen, JSON.stringify(m.slice(0, 4)));
    merged += mergedTransition(c, want, m);
  }
  for (const [key, n] of seen) if (n > 1) c.add("BUG", "marker", `overview draws marker transition ${key} ${n} times`);
  const drawn = new Set(
    (c.O.pseudo?.nodes ?? []).filter((p) => MARK.has(p.shape ?? "")).map((p) => JSON.stringify([p.shape, p.parent])),
  );
  for (const [shape, scope, r, dir] of want) {
    const g = c.ov(r);
    const dropped =
      g !== r && drawn.has(JSON.stringify([shape, scope])) && !seen.has(JSON.stringify([shape, scope, g, dir]));
    if (dropped) c.add("BUG", "marker", `overview drops the ${shape} ${dir} transition of ${r} into ${g}`);
  }
  if (merged !== c.plan.loss.mergedMarkers)
    c.add("BUG", "marker", `overview merges ${merged} marker transitions, plan declares ${c.plan.loss.mergedMarkers}`);
};

// Each original start or end transition once on a real state, in the overview
// or a detail; none on a detail's stub; merged ones onto groups as declared.
const checkMarkers = (c: Ctx): void => {
  const want = marks(c.G, () => true);
  const real = (r: string): boolean => c.nodeById.has(r);
  const got = [...marks(c.O, real), ...c.dets.flatMap((d) => marks(d.D, real))];
  const str = (m: Mark): string => JSON.stringify(m);
  const { missing, extra } = multisetDiff(want.map(str), got.map(str));
  for (const k of missing) c.add("BUG", "marker", `start or end transition lost: ${k}`);
  for (const k of extra) c.add("BUG", "marker", `start or end transition invented or moved: ${k}`);
  for (const k of c.dets.flatMap((d) => marks(d.D, (r) => !real(r))))
    c.add("BUG", "marker", `marker transition on a stub: ${str(k)}`);
  checkMergedMarkers(c, want);
};

const rowsOf = (g: DiagramGraph): string[] =>
  g.nodes.filter((n) => n.rows?.length).map((n) => JSON.stringify([n.id, n.rows]));

const checkRows = async (c: Ctx): Promise<void> => {
  const orig = rowsOf(c.G);
  if (orig.length === 0) return;
  const shown = [...rowsOf(c.O), ...c.dets.flatMap((d) => rowsOf(d.D))];
  const extra = await Promise.all((c.plan.rowDetails ?? []).map(async (r) => rowsOf(await extractGraph(r.source))));
  const drawn = new Set([...shown, ...extra.flat()]);
  const lost = orig.filter((r) => !drawn.has(r)).reduce((a, r) => a + (JSON.parse(r)[1] as string[]).length, 0);
  if (lost !== c.plan.loss.droppedRows)
    c.add("BUG", "rows", `rows lost ${lost} but plan declares ${c.plan.loss.droppedRows}`);
  for (const x of shown) if (!orig.includes(x)) c.add("BUG", "rows", `rows changed: ${x}`);
};

const checkOverviewNodes = (c: Pick<Ctx, "add" | "groupNodes" | "groupIds" | "plan">): void => {
  for (const n of c.groupNodes)
    if (!c.groupIds.has(n.id))
      c.add("BUG", "overview", `overview node ${n.id} "${n.label}" is neither original nor a group`);
  for (const g of c.plan.groups)
    if (!c.groupNodes.some((n) => n.id === g.id))
      c.add("BUG", "overview", `group ${g.id} is not drawn in the overview`);
};

// Every finding for a plan and, depth first, for each nested plan.
export const checkPlan = async (
  origSrc: string,
  plan: SplitPlan,
  cfg: ThresholdConfig,
  path: string,
): Promise<Finding[]> => {
  const F: Finding[] = [];
  const add = (sev: Severity, kind: string, msg: string): void => {
    F.push({ sev, kind, msg: `${path}: ${msg}` });
  };
  const om = await measure(plan.overviewSource, cfg);
  if (om.error) {
    add("BUG", "parse", `overview does not parse: ${om.error}`);
    return F;
  }
  if (over(om, cfg))
    add("BUG", "threshold", `overview ${om.nodes}n/${om.score} over ${cfg.node_target}/${cfg.vcs_target}`);
  const [G, O] = [await extractGraph(origSrc), await extractGraph(plan.overviewSource)];
  const nodeById = new Map(G.nodes.map((n) => [n.id, n]));
  const subById = new Map(G.subgraphs.map((s) => [s.id, s]));
  const isOrig = (id: string): boolean => nodeById.has(id) || subById.has(id);
  const groupNodes = O.nodes.filter((n) => !isOrig(n.id));
  const base = {
    G,
    O,
    plan,
    add,
    nodeById,
    subById,
    isOrig,
    groupNodes,
    groupIds: new Set(plan.groups.map((g) => g.id)),
  };
  checkOverviewNodes(base);
  const shown = readGroupLabels(base);
  const nested: Finding[] = [];
  const dets = await readDetails({ ...base, cfg, path }, plan, nested);
  const ovSubs = new Set(O.subgraphs.map((s) => s.id));
  const { groupOf, regionGroup } = membership({ add, dets, ovSubs });
  const lolLabels = new Set((G.pseudo?.nodes ?? []).filter((p) => p.shape === "lollipop").map((p) => `()${p.label}`));
  const ov = (x: string): string => groupOf.get(x) ?? regionGroup.get(x) ?? x;
  const keptNodes = O.nodes.filter((n) => isOrig(n.id));
  const c: Ctx = { ...base, lolLabels, keptNodes, shown, dets, groupOf, regionGroup, ovSubs, ov };
  checkPartition(c);
  checkNodes(c);
  checkRegions(c);
  checkParents(c);
  checkEdges(c, readStubs(c));
  checkOverviewEdges(c);
  if (G.diagram_type.startsWith("state")) checkMarkers(c);
  await checkRows(c);
  return [...nested, ...F];
};
