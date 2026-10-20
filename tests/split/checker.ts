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
// - A detail's subgraph with no original id is a box of stubs (MJL-0037). It
//   shows the label exactly one group shows, sits at the top level, and reads
//   as the one region that group folds whole holding every member, else as the
//   group, and then draws no edge. A stub inside it shows the label of exactly
//   one member of that group, and reads as that member.
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

// A range label: three members or more, first and last label in natural
// order joined by a spaced ellipsis, at most forty graphemes, no markup, and
// no member of another group labelled from the first to the last.
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "variant" });
const natural = (a: string, b: string): number => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
const rangeOf = (labels: string[], hidden: string[]): string | null => {
  const order = [...labels].sort(natural);
  const [first, last] = [order[0] ?? "", order.at(-1) ?? ""];
  if (labels.length < 3 || first === last || order.some((l) => /[<&*_`#]/.test(l) || l.includes(" … "))) return null;
  if (hidden.some((l) => natural(first, l) <= 0 && natural(l, last) <= 0)) return null;
  return glen(`${first} … ${last}`) <= 40 ? `${first} … ${last}` : null;
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
  boxes: GraphNode[];
}

interface Shown {
  label: string;
  base: string;
  n: number;
  // The other member's label a pair label shows in place of the count.
  pair?: string;
}

// A pair label, written out: a group of two members shows one member's whole
// label, " (+", the other's label and ")". Neither label holds a bracket or
// markup, or a space at either end, the other is not a number, and the whole
// label holds at most forty characters.
const PAIR_LABEL = /^(.*) \(\+(.+)\)$/s;
const pairOk = (a: string, b: string, cap = 40): boolean =>
  a !== b &&
  [a, b].every((l) => l.trim() !== "" && l === l.trim() && !/[()[\]<&*`#]/.test(l)) &&
  !/^\d+$/.test(b) &&
  [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(`${a} (+${b})`)].length <= cap;

// A list label, written out: a group of three members shows one member's
// whole label, " (+", the other two in natural order joined by ", ", and ")".
// Neither other label holds a comma, and each pairs with the named one. A
// group of leaves hanging from one overview node lists every member however
// many, within eighty characters.
const listOk = (base: string, labels: readonly string[], shown: string, fan = false): boolean => {
  const cap = fan ? 80 : 40;
  const others = labels.filter((l, i) => !(l === base && labels.indexOf(base) === i));
  if (others.length !== labels.length - 1 || new Set(labels).size !== labels.length) return false;
  if (labels.length === 2) return pairOk(base, others[0] ?? "", cap) && shown === others[0];
  const text = [...others].sort(natural).join(", ");
  return (
    (labels.length === 3 || (fan && labels.length > 3)) &&
    others.every((l) => !l.includes(",") && pairOk(base, l, cap)) &&
    pairOk(base, text, cap) &&
    shown === text
  );
};

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

// A group node's label read by its two forms, a count or a pair, or null.
const shownOf = (c: Pick<Ctx, "add">, n: GraphNode): Shown | null => {
  const m = GROUP_LABEL.exec(n.label);
  const pair = m ? null : PAIR_LABEL.exec(n.label);
  if (pair) return { label: n.label, base: pair[1] ?? "", n: 0, pair: pair[2] ?? "" };
  if (!m) {
    c.add("BUG", "glabel", `group ${n.id} label "${n.label}" has no (+N)`);
    return null;
  }
  if (m[3] && m[3] !== n.id) c.add("BUG", "glabel", `group ${n.id} label tag [${m[3]}] names another id`);
  return { label: n.label, base: m[1] ?? "", n: Number(m[2]) };
};

const readGroupLabels = (c: Pick<Ctx, "add" | "groupNodes" | "O" | "G">): Map<string, Shown> => {
  const shown = new Map<string, Shown>();
  for (const n of c.groupNodes) {
    const s = shownOf(c, n);
    if (s) shown.set(n.id, s);
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
  return {
    gid: d.group,
    D,
    members,
    stubs: D.nodes.filter((n) => !c.isOrig(n.id)),
    boxes: D.subgraphs.filter((x) => !c.isOrig(x.id)),
  };
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
const membership = (c: Pick<Ctx, "add" | "dets" | "ovSubs" | "isOrig">) => {
  const groupOf = new Map<string, string>();
  const regionGroup = new Map<string, string>();
  for (const d of c.dets) {
    for (const m of d.members) {
      const was = groupOf.get(m.id);
      if (was) c.add("BUG", "partition", `node ${m.id} is a member of ${was} and ${d.gid}`);
      groupOf.set(m.id, d.gid);
    }
    for (const s of d.D.subgraphs.filter((x) => !c.ovSubs.has(x.id) && c.isOrig(x.id))) {
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

// The labels the docs promise for a group holding a whole dotted family or
// twin chains, written out. A family label: three members or more, each label
// leading with one namespace and a dot, as gold.x, no other node's label
// leading with it, read as the namespace and ".*". A lane label, in a
// flowchart or stateDiagram: the members' directed edges form two paths or
// more of one length, two or more, each member on one; each place along them
// is named by the namespace all its labels lead with, else the first word all
// of them lead with, else the two first words they lead with between them,
// every label leading with one, in natural order joined by "/", else "…", at
// least one place named, joined by " → ", at most forty characters. Both count
// every member.
const wholeNs = (l: string): string | null => /^([A-Za-z][A-Za-z0-9-]*)\.[A-Za-z0-9_]/.exec(l.trim())?.[1] ?? null;
const wholeWord = (l: string): string | null => /^(\p{L}[\p{L}\p{N}-]*)\s/u.exec(l.trim())?.[1] ?? null;
const wholeOnly = (xs: Array<string | null>): string | null => (new Set(xs).size === 1 ? (xs[0] ?? null) : null);

// The members' paths by their directed edges, each as labels from its entry,
// or null when the edges do not form disjoint paths covering every member.
const wholePaths = (original: DiagramGraph, members: readonly GraphNode[]): string[][] | null => {
  const inside = new Set(members.map((m) => m.id));
  const next = new Map<string, string>();
  const into = new Set<string>();
  for (const e of original.edges) {
    if (e.source === e.target || !inside.has(e.source) || !inside.has(e.target)) continue;
    if (UNDIRECTED.has(e.kind ?? "") || next.has(e.source) || into.has(e.target)) return null;
    next.set(e.source, e.target);
    into.add(e.target);
  }
  const label = new Map(members.map((m) => [m.id, m.label]));
  const paths = members
    .filter((m) => !into.has(m.id))
    .map((m) => {
      const p: string[] = [];
      for (let x: string | undefined = m.id; x !== undefined && p.length <= members.length; x = next.get(x))
        p.push(label.get(x) ?? x);
      return p;
    });
  return paths.reduce((n, p) => n + p.length, 0) === members.length ? paths : null;
};

const wholeLane = (paths: string[][]): string | null => {
  const len = paths[0]?.length ?? 0;
  if (paths.length < 2 || len < 2 || paths.some((p) => p.length !== len)) return null;
  const places = Array.from({ length: len }, (_, i) => {
    const at = paths.map((p) => p[i] ?? "");
    const words = at.map(wholeWord);
    const two = [...new Set(words)];
    const both = two.length === 2 && !words.includes(null) ? [...(two as string[])].sort(natural).join("/") : null;
    return wholeOnly(at.map(wholeNs)) ?? wholeOnly(words) ?? both;
  });
  const lane = places.map((p) => p ?? "…").join(" → ");
  const short = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(lane)].length <= 40;
  return places.some((p) => p !== null) && short ? lane : null;
};

// A span label, written out: in a flowchart, a group of three members or
// more folding no region, whose flow enters at one member and leaves from
// another. The entry is the one member every edge from outside reaches, else
// the one member no edge reaches; the exit is the one member every edge to
// outside leaves, else the one member no edge leaves. It reads as the two
// labels joined by " → ", neither holding markup, an arrow or an ellipsis,
// at most forty characters, counting the members neither names.
const spanOfReading = (original: DiagramGraph, members: readonly GraphNode[], folds: boolean): string | null => {
  if (!/^(flowchart|graph)/.test(original.diagram_type) || members.length < 3 || folds) return null;
  const inside = new Set(members.map((m) => m.id));
  const edges = original.edges.filter((e) => e.source !== e.target);
  const only = (xs: string[]): string | null => {
    const set = [...new Set(xs)];
    return set.length === 1 ? (set[0] ?? null) : null;
  };
  const enter = edges.filter((e) => inside.has(e.target) && !inside.has(e.source)).map((e) => e.target);
  const leave = edges.filter((e) => inside.has(e.source) && !inside.has(e.target)).map((e) => e.source);
  const entry = only(enter.length > 0 ? enter : [...inside].filter((m) => !edges.some((e) => e.target === m)));
  const exit = only(leave.length > 0 ? leave : [...inside].filter((m) => !edges.some((e) => e.source === m)));
  const labelOf = (id: string | null): string => members.find((m) => m.id === id)?.label ?? "";
  const [a, b] = [labelOf(entry), labelOf(exit)];
  if (entry === null || exit === null || entry === exit) return null;
  if ([a, b].some((l) => l.trim() === "" || l !== l.trim() || /[<&*_`#→…]/.test(l))) return null;
  if (members.some((m) => (m.id === entry || m.id === exit) && m.markdown)) return null;
  const span = `${a} → ${b}`;
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(span)].length <= 40 ? span : null;
};

const wholeOf = (original: DiagramGraph, members: readonly GraphNode[]): string[] => {
  const inside = new Set(members.map((m) => m.id));
  const family = wholeOnly(members.map((m) => wholeNs(m.label)));
  const outside = original.nodes.some((n) => !inside.has(n.id) && wholeNs(n.label) === family);
  const out = members.length >= 3 && family !== null && !outside ? [`${family}.*`] : [];
  if (!/^(flowchart|graph|state)/.test(original.diagram_type)) return out;
  const paths = wholePaths(original, members);
  const lane = paths === null ? null : wholeLane(paths);
  return lane === null ? out : [...out, lane];
};

// A fan label, written out: in a flowchart or stateDiagram, a group of two
// members or more, each with one directed edge and no start or end
// transition, every one hanging the same way from one overview node, which
// is no group of such leaves, and no leaf outside the group hanging from it
// that way. It reads as that node's name (a kept node's label, or a group's
// base), " → …" when the edges leave it, or "… → " and the name when they
// enter it, with no markup, at most forty characters, counting every member.
const fanHang = (
  original: DiagramGraph,
  members: readonly GraphNode[],
  overviewOf: (id: string) => string,
): { at: string; out: boolean } | null => {
  if (!/^(flowchart|graph|state)/.test(original.diagram_type) || members.length < 2) return null;
  const marked = new Set((original.pseudo?.edges ?? []).flatMap((e) => [e.source, e.target]));
  const ids = new Set(original.nodes.map((n) => n.id));
  const hang = (id: string): { at: string; out: boolean } | null => {
    const es = original.edges.filter((e) => e.source !== e.target && (e.source === id || e.target === id));
    const [e] = es;
    if (es.length !== 1 || !e || marked.has(id) || UNDIRECTED.has(e.kind ?? "") || !ids.has(id)) return null;
    const out = e.target === id;
    return { at: overviewOf(out ? e.source : e.target), out };
  };
  const inside = new Set(members.map((m) => m.id));
  const ends = members.map((m) => hang(m.id));
  const [first] = ends;
  if (!first || first.at === overviewOf(members[0]?.id ?? "")) return null;
  if (ends.some((x) => !x || x.at !== first.at || x.out !== first.out)) return null;
  const outside = original.nodes.some((n) => {
    const h = inside.has(n.id) ? null : hang(n.id);
    return h !== null && h.at === first.at && h.out === first.out;
  });
  const held = original.nodes.filter((n) => overviewOf(n.id) === first.at && n.id !== first.at);
  return outside || (held.length > 0 && held.every((n) => hang(n.id) !== null)) ? null : first;
};

const fanOfReading = (
  original: DiagramGraph,
  members: readonly GraphNode[],
  overviewOf: (id: string) => string,
  nameOf: (overviewNode: string) => string | undefined,
): string | null => {
  const first = fanHang(original, members, overviewOf);
  if (!first) return null;
  const name = nameOf(first.at);
  if (name === undefined || name.trim() === "" || /[<&*_`#]/.test(name)) return null;
  const fan = first.out ? `${name} → …` : `… → ${name}`;
  return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(fan)].length <= 40 ? fan : null;
};

// A group label is a member's or a folded region's label, cut by rule, and
// counts the members it does not name, or a family or lane label counting
// every member. A folded region's label may be
// qualified by the label of the region the group node sits in, which is that
// region's parent in the original, counting every member.
// A pair or list label names the group's two or three members, by the rule.
const checkPair = (c: Ctx, d: Det, gs: Shown): void => {
  const fan = fanHang(c.G, d.members, (id) => c.groupOf.get(id) ?? id) !== null;
  const ok = listOk(
    gs.base,
    d.members.map((m) => m.label),
    gs.pair ?? "",
    fan,
  );
  if (!ok) c.add("BUG", "glabel", `group ${d.gid} pair label "${gs.label}" does not name its members`);
};

// Whether a base is a family, lane or fan label of the members.
const wholeOrFan = (c: Ctx, d: Det, base: string): boolean => {
  const nameOf = (x: string): string | undefined => c.shown.get(x)?.base ?? c.nodeById.get(x)?.label;
  const fan = fanOfReading(c.G, d.members, (id) => c.groupOf.get(id) ?? id, nameOf);
  return wholeOf(c.G, d.members).includes(base) || (fan !== null && fan === base);
};

const checkGroupLabel = (c: Ctx, d: Det): void => {
  const gs = c.shown.get(d.gid);
  if (!gs) return;
  if (gs.pair !== undefined) {
    checkPair(c, d, gs);
    return;
  }
  const fromMember = d.members.some((m) => cutOf(gs.base, m.label));
  const folded = d.D.subgraphs.filter((s) => !c.ovSubs.has(s.id));
  const fromRegion = folded.some((s) => cutOf(gs.base, s.label));
  const sits = c.O.nodes.find((n) => n.id === d.gid)?.parent ?? null;
  const around = sits === null ? undefined : c.subById.get(sits);
  const fromQualified =
    around !== undefined &&
    folded.some((s) => c.subById.get(s.id)?.parent === around.id && gs.base === `${s.label} (${around.label})`);
  const hidden = c.dets.filter((x) => x !== d).flatMap((x) => x.members.map((m) => m.label));
  const fromRange =
    gs.base ===
    rangeOf(
      d.members.map((m) => m.label),
      hidden,
    );
  const fromWhole = wholeOrFan(c, d, gs.base);
  const fromSpan = gs.base === spanOfReading(c.G, d.members, folded.length > 0);
  if (!(fromMember || fromRegion || fromQualified || fromRange || fromWhole || fromSpan))
    c.add("BUG", "glabel", `group ${d.gid} base "${gs.base}" names no member, region or honest range`);
  const okN =
    (fromMember && gs.n === d.members.length - 1) ||
    ((fromRegion || fromQualified) && gs.n === d.members.length) ||
    ((fromRange || fromSpan) && gs.n === d.members.length - 2) ||
    (fromWhole && gs.n === d.members.length);
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
  const all = [...c.O.subgraphs, ...c.dets.flatMap((d) => d.D.subgraphs.filter((s) => c.isOrig(s.id)))].map(rk);
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
    // A namespace and a class may share an id, so each is looked up as what it was drawn as.
    const drawnAs = [
      ...D.nodes.map((n) => [n, c.nodeById.get(n.id)] as const),
      ...D.subgraphs.map((s) => [s, c.subById.get(s.id)] as const),
    ];
    for (const [n, o] of drawnAs) {
      if (!o) continue;
      const want = nearest(o.parent, drawn);
      if (n.parent !== want)
        c.add("BUG", "parent", `${name}: ${n.id} parent ${n.parent} but nearest drawn ancestor is ${want}`);
    }
  }
};

// The original ids a stub's text names as the member of group gid its edges
// leave: the group's shown label, " from ", then a label of its own members.
const fromNamed = (c: Ctx, S: string, gid: string): string[] => {
  const shown = c.shown.get(gid)?.label;
  if (shown === undefined || !S.startsWith(`${shown} from `)) return [];
  const label = S.slice(shown.length + " from ".length);
  return c.G.nodes.filter((n) => n.label === label && c.ov(n.id) === gid).map((n) => n.id);
};

// Every referent a stub's text names, by each form a plan writes: a label as
// it is, a group's shown label, a label with " (in ", the label its group
// shows and ")", a group's shown label with " from " and one of its
// members' labels, and any of these with " [id]" naming one reading.
const stubReader = (c: Ctx): ((s: string) => Set<string>) => {
  const byLabel = new Map<string, string[]>();
  const referents = [
    ...c.G.nodes.map((n) => [n.label, n.id]),
    ...c.G.subgraphs.filter((s) => s.label !== "").map((s) => [s.label, s.id]),
    ...[...c.lolLabels].map((l) => [l.slice(2), l]),
  ];
  for (const [label = "", id = ""] of referents) byLabel.set(label, [...(byLabel.get(label) ?? []), id]);
  const heldBy = (own: string, shown: string): string[] =>
    (byLabel.get(own) ?? []).filter((id) => {
      const g = c.ov(id);
      return g !== id && c.shown.get(g)?.label === shown;
    });
  const inGroup = (S: string): string[] => {
    if (!S.endsWith(")")) return [];
    const cuts = [...S.matchAll(/ \(in /g)].map((m) => m.index ?? 0);
    return cuts.flatMap((at) => heldBy(S.slice(0, at), S.slice(at + " (in ".length, -1)));
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
      ...[...c.shown.keys()].filter((gid) => fromNamed(c, S, gid).length > 0).map((gid) => `group:${gid}`),
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

// A stub naming the member its edges leave draws only edges that member has.
const checkFrom = (c: Ctx, d: Det, s: GraphNode, named: string[]): void => {
  if (named.length === 0) return;
  const gEnd = nameEnds(c.G);
  const original = new Set(c.G.edges.map((e) => ek(gEnd(e.source), gEnd(e.target), e)));
  const dEnd = nameEnds(d.D);
  for (const e of d.D.edges.filter((x) => x.source === s.id)) {
    if (!named.some((m) => original.has(ek(m, dEnd(e.target), e))))
      c.add("BUG", "stub", `detail ${d.gid} stub ${s.id} "${s.label}" draws an edge its member has not`);
  }
};

// The one original region group gid folds whole holding every member: of the
// regions folded into it, the one none of the others holds, when every member
// sits inside it. Null for any other group.
const regionOf = (c: Ctx, gid: string): string | null => {
  const folded = c.G.subgraphs.filter((s) => c.regionGroup.get(s.id) === gid);
  const roots = folded.filter((s) => c.regionGroup.get(s.parent ?? "") !== gid);
  const root = roots.length === 1 ? roots[0]?.id : undefined;
  if (root === undefined) return null;
  const inside = (p: string | null): boolean => {
    for (let x = p; x; x = c.subById.get(x)?.parent ?? null) if (x === root) return true;
    return false;
  };
  return c.G.nodes.filter((n) => c.groupOf.get(n.id) === gid).every((n) => inside(n.parent)) ? root : null;
};

// A box of stubs read as its region or its whole group, by the one group
// whose label it shows; undefined when it shows no one group's label.
const readBox = (c: Ctx, d: Det, b: GraphNode, m: Map<string, string>): string | undefined => {
  const gids = [...c.shown].filter(([, gs]) => gs.label === b.label).map(([gid]) => gid);
  const gid = gids[0];
  if (gid === undefined || gids.length > 1) {
    c.add(
      gid === undefined ? "BUG" : "AMBIG",
      "box",
      `detail ${d.gid} box ${b.id} "${b.label}" shows no one group's label`,
    );
    return undefined;
  }
  if (b.parent !== null) c.add("BUG", "box", `detail ${d.gid} box ${b.id} sits inside ${b.parent}`);
  const region = regionOf(c, gid);
  const claimed = c.plan.details.find((x) => x.group === d.gid)?.stubs[b.id];
  if (claimed !== undefined && claimed !== (region ?? gid))
    c.add("BUG", "box", `detail ${d.gid} box ${b.id} reads as ${region ?? gid}, not its endpoint ${claimed}`);
  if (region === null && d.D.edges.some((e) => e.source === b.id || e.target === b.id))
    c.add("BUG", "box", `detail ${d.gid} box ${b.id} draws an edge for a whole group`);
  m.set(b.id, region ?? `group:${gid}`);
  return gid;
};

// A stub inside a box read as the one member of the box's group its label names.
const readInBox = (
  c: Ctx,
  d: Det,
  s: GraphNode,
  { gid, m }: { gid: string | undefined; m: Map<string, string> },
): void => {
  const named = c.G.nodes.filter((n) => n.label === s.label && c.groupOf.get(n.id) === gid).map((n) => n.id);
  if (gid === undefined || named.length !== 1) {
    c.add("BUG", "box", `detail ${d.gid} stub ${s.id} "${s.label}" in box ${s.parent} names ${named.length} members`);
    return;
  }
  const claimed = c.plan.details.find((x) => x.group === d.gid)?.stubs[s.id];
  if (claimed !== undefined && claimed !== named[0])
    c.add("BUG", "box", `detail ${d.gid} stub ${s.id} "${s.label}" does not name its endpoint ${claimed}`);
  m.set(s.id, named[0] ?? "");
};

// Each box of stubs read as its region or its whole group, and each stub
// inside it as the one member of that group its label names.
const readBoxes = (c: Ctx, d: Det, m: Map<string, string>): Set<string> => {
  const groupOfBox = new Map(d.boxes.map((b) => [b.id, readBox(c, d, b, m)]));
  const inside = d.stubs.filter((x) => x.parent !== null && !c.isOrig(x.parent));
  for (const s of inside) readInBox(c, d, s, { gid: groupOfBox.get(s.parent ?? ""), m });
  return new Set(inside.map((s) => s.id));
};

const readStubs = (c: Ctx): Map<string, Map<string, string>> => {
  const read = stubReader(c);
  const out = new Map<string, Map<string, string>>();
  for (const d of c.dets) {
    const m = new Map<string, string>();
    const boxed = readBoxes(c, d, m);
    for (const s of d.stubs.filter((x) => !boxed.has(x.id))) {
      const r = readStub(c, d, s, read);
      if (r !== null) m.set(s.id, r);
      if (r?.startsWith("group:")) checkFrom(c, d, s, fromNamed(c, s.label, r.slice(6)));
    }
    out.set(d.gid, m);
  }
  return out;
};

interface Drawn {
  exact: string[];
  halves: string[];
  // The details drawing each exact edge.
  drawnIn: Map<string, string[]>;
}

// A detail's edges, each read back to original ends: exact edges, and half
// edges from a whole-group stub into a member or from a member into one.
const detailEdges = (c: Ctx, d: Det, sr: Map<string, string>, out: Drawn): void => {
  const dEnd = nameEnds(d.D);
  const isStub = (x: string): boolean => !(c.isOrig(x) || c.lolLabels.has(x));
  const end = (x: string): string => (isStub(x) ? (sr.get(x) ?? "?") : x);
  for (const e of d.D.edges) {
    const [a, b] = [dEnd(e.source), dEnd(e.target)];
    const problem = edgeProblem({ c, gid: d.gid, isStub }, [a, b], [end(a), end(b)]);
    if (problem) c.add(problem[0], "edge", `detail ${d.gid} ${problem[1]}`);
    else if (end(a).startsWith("group:")) out.halves.push(ek(end(a).slice(6), end(b), e));
    else if (end(b).startsWith("group:")) out.halves.push(ek(end(a), end(b).slice(6), e));
    else {
      const key = ek(end(a), end(b), e);
      out.exact.push(key);
      out.drawnIn.set(key, [...(out.drawnIn.get(key) ?? []), d.gid]);
    }
  }
};

// Whether original edges run both ways between two groups.
const bothWays = (c: Ctx, x: string, y: string): boolean => {
  const gEnd = nameEnds(c.G);
  const runs = (s: string, t: string): boolean =>
    c.G.edges.some((e) => c.ov(gEnd(e.source)) === s && c.ov(gEnd(e.target)) === t);
  return runs(x, y) && runs(y, x);
};

// The outside overview nodes a group's detail meets: the far end, as the
// overview draws it, of every original edge with one end in the group.
const outsideOf = (c: Ctx, gid: string): number => {
  const gEnd = nameEnds(c.G);
  const far = c.G.edges.flatMap((e) => {
    const [s, t] = [c.ov(gEnd(e.source)), c.ov(gEnd(e.target))];
    return s === gid && t !== gid ? [t] : t === gid && s !== gid ? [s] : [];
  });
  return new Set(far).size;
};

// Whether a target group's detail may draw a member A of another group as
// a stub (MJL-0036, MJL-0037): edges run one way only, from A's group into
// group gid, A is a member they leave, A's group's detail is not split again,
// and they leave fewer members than they reach, or as many, two or more,
// when gid's detail meets fewer outside nodes than A's group's.
const fromOne = (c: Ctx, A: string, gid: string): boolean => {
  const gEnd = nameEnds(c.G);
  const from = c.ov(A);
  const between = c.G.edges.filter((e) => c.ov(gEnd(e.source)) === from && c.ov(gEnd(e.target)) === gid);
  const sources = new Set(between.map((e) => gEnd(e.source)));
  const targets = new Set(between.map((e) => gEnd(e.target)));
  const split = c.plan.details.find((d) => d.group === from)?.split ?? null;
  const fewer =
    sources.size < targets.size ||
    (sources.size === targets.size && sources.size > 1 && outsideOf(c, gid) < outsideOf(c, from));
  return !bothWays(c, from, gid) && sources.has(A) && fewer && split === null;
};

interface Reading {
  c: Ctx;
  gid: string;
  isStub: (x: string) => boolean;
}

const edgeProblem = (
  { c, gid, isStub }: Reading,
  [a, b]: [string, string],
  [A, B]: [string, string],
): [Severity, string] | null => {
  if (isStub(a) && isStub(b)) return ["BUG", `edge between stubs ${a}->${b}`];
  if (A.startsWith("group:") && B.startsWith("group:")) return ["BUG", `edge between whole groups ${a}->${b}`];
  if (A.startsWith("group:") || B.startsWith("group:")) return null;
  if (isStub(a) && c.ov(A) !== A && !bothWays(c, c.ov(A), gid) && !fromOne(c, A, gid))
    return ["WARN", `stub ${a} names ${A} of another group`];
  return null;
};

// The half edges a plan owes. An edge between two groups is drawn exactly in
// one end's detail, and as a half in the other's. The edges of one kind one
// way between one group and one member are one half, with the label and
// cardinality they all share (an erDiagram's apart by label and
// cardinality), as the overview draws one edge per pair.
const wantedHalves = (c: Ctx, drawnIn: Map<string, string[]>): string[] => {
  const gEnd = nameEnds(c.G);
  const isEr = c.G.diagram_type === "er";
  const buckets = new Map<string, GraphEdge[]>();
  for (const e of c.G.edges) {
    const [s, t] = [gEnd(e.source), gEnd(e.target)];
    if (!(c.ov(s) !== s && c.ov(t) !== t && c.ov(s) !== c.ov(t))) continue;
    const at = drawnIn.get(ek(s, t, e))?.shift();
    const [hs, ht] = at === c.ov(t) ? [s, c.ov(t)] : [c.ov(s), t];
    const key = JSON.stringify([hs, ht, e.kind ?? "", isEr ? (e.label ?? "") : "", isEr ? (e.cardinality ?? "") : ""]);
    buckets.set(key, [...(buckets.get(key) ?? []), { ...e, source: hs, target: ht }]);
  }
  return [...buckets.values()].map((edges) => {
    const [first] = edges as [GraphEdge];
    const same = (pick: (e: GraphEdge) => unknown): boolean => edges.every((e) => pick(e) === pick(first));
    const labelled = same((e) => e.label) && same((e) => e.markdown ?? false);
    const shared: GraphEdge = {
      ...first,
      label: labelled ? first.label : undefined,
      markdown: labelled ? first.markdown : undefined,
      kind: same((e) => e.kind) ? first.kind : undefined,
      cardinality: same((e) => e.cardinality) ? first.cardinality : undefined,
    };
    return ek(first.source, first.target, shared);
  });
};

// Each original edge once: from the overview between kept nodes, else from a
// detail. A stub read as a whole group gives a half edge into a member.
const checkEdges = (c: Ctx, stubRef: Map<string, Map<string, string>>): void => {
  const [gEnd, oEnd] = [nameEnds(c.G), nameEnds(c.O)];
  const exact = c.O.edges
    .filter((e) => !(c.groupIds.has(oEnd(e.source)) || c.groupIds.has(oEnd(e.target))))
    .map((e) => ek(oEnd(e.source), oEnd(e.target), e));
  const out: Drawn = { exact, halves: [], drawnIn: new Map() };
  for (const d of c.dets) detailEdges(c, d, stubRef.get(d.gid) ?? new Map(), out);
  const { missing, extra } = multisetDiff(
    c.G.edges.map((e) => ek(gEnd(e.source), gEnd(e.target), e)),
    out.exact,
  );
  for (const k of missing) c.add("BUG", "edge", `edge not recovered: ${k}`);
  for (const k of extra) c.add("BUG", "edge", `edge invented or duplicated: ${k}`);
  const wantHalves = wantedHalves(c, out.drawnIn);
  // One half edge stands for every edge between its group and its member
  // with its attributes, so each is drawn exactly once.
  const want = new Set(wantHalves);
  const h = multisetDiff([...want], out.halves);
  for (const k of h.missing) c.add("WARN", "half", `cross-group edge not shown in its target detail: ${k}`);
  for (const k of h.extra)
    c.add(
      "BUG",
      "half",
      want.has(k) ? `whole-group stub edge drawn twice: ${k}` : `whole-group stub edge with no original: ${k}`,
    );
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
  const { groupOf, regionGroup } = membership({ add, dets, ovSubs, isOrig });
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
