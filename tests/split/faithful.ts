// An independent reading of a plan, from what its emitted sources parse back
// to alone. Every original node, region, edge and start or end transition must
// come back exactly once, with its label, markdown flag, shape and
// descriptions. Group nodes are the overview's nodes with no original id, and
// a detail's members are its nodes with an original id. Each stub is read from
// its text, by the forms a plan writes, against every label the diagram and
// the overview show, and must have exactly one reading. Only the order of the
// plan's details is read from memory, to pair each detail with its group node,
// since the emitted text carries no link. A decision, choice, fork or join
// folded into a group must sit in a whole region the group folds: an author
// region, or a single-entry single-exit region of the original, found here
// by its own search. Nothing here calls the split code.

import { type DiagramGraph, extractGraph, type GraphEdge, type GraphNode } from "../../src/parse/graph.ts";
import type { SplitPlan } from "../../src/split/types.ts";

const MARKERS = new Set(["stateStart", "stateEnd"]);
// A flowchart link with no arrowhead and a classDiagram link with no end marker.
const UNDIRECTED = new Set(["---", "-.-", "===", "~~~", "--", ".."]);

const nodeKey = (n: GraphNode): string =>
  JSON.stringify([n.id, n.label, n.markdown ?? false, n.shape ?? null, n.descriptions ?? []]);
const regionKey = (n: GraphNode): string => JSON.stringify([n.id, n.label, n.markdown ?? false]);
const edgeKey = (e: GraphEdge, s: string, t: string): string =>
  JSON.stringify([s, t, e.label ?? "", e.markdown ?? false, e.kind ?? "", e.cardinality ?? ""]);

// A lollipop interface by its label, since mermaid numbers interfaces afresh.
const endsOf = (g: DiagramGraph): ((x: string) => string) => {
  const named = new Map(
    (g.pseudo?.nodes ?? []).filter((p) => p.shape === "lollipop").map((p) => [p.id, `()${p.label}`]),
  );
  return (x) => named.get(x) ?? x;
};

const diff = (want: string[], got: string[], what: string): string[] => {
  const left = new Map<string, number>();
  for (const k of want) left.set(k, (left.get(k) ?? 0) + 1);
  const extra = got.filter((k) => {
    const n = left.get(k) ?? 0;
    if (n === 0) return true;
    left.set(k, n - 1);
    return false;
  });
  const missing = [...left].flatMap(([k, n]) => Array<string>(n).fill(k));
  return [...missing.map((k) => `${what} missing: ${k}`), ...extra.map((k) => `${what} extra: ${k}`)];
};

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
const chars = (s: string): string[] => [...graphemes.segment(s)].map((x) => x.segment);

// The cut the docs promise, written out: a label longer than forty
// characters shows its first twenty-seven, less trailing spaces, an ellipsis,
// and its last twelve, less leading spaces. Markup is never cut.
export const cutOf = (shown: string, label: string): boolean => {
  if (shown === label) return true;
  const c = chars(label);
  if (c.length <= 40 || /[<&*_`#]/.test(label)) return false;
  return shown === `${c.slice(0, 27).join("").trimEnd()}…${c.slice(-12).join("").trimStart()}`;
};

// The range the docs promise, written out: three members or more, their
// first and last labels in natural order (digit runs by value, then code
// units) joined by " … ", at most forty characters, no markup, and no member
// of another group labelled from the first to the last.
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "variant" });
const byNatural = (a: string, b: string): number => natural.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

export const rangeOf = (labels: string[], hidden: string[]): string | null => {
  const order = [...labels].sort(byNatural);
  const [first, last] = [order[0] ?? "", order.at(-1) ?? ""];
  if (labels.length < 3 || first === last || order.some((l) => /[<&*_`#]/.test(l) || l.includes(" … "))) return null;
  if (hidden.some((l) => byNatural(first, l) <= 0 && byNatural(l, last) <= 0)) return null;
  const base = `${first} … ${last}`;
  return chars(base).length <= 40 ? base : null;
};

interface Shown {
  label: string;
  base: string;
  n: number;
}

const GROUP_LABEL = /^(.*) \(\+(\d+)\)(?: \[([^\]]+)\])?$/s;

interface Reading {
  original: DiagramGraph;
  overview: DiagramGraph;
  details: Array<{ group: string; graph: DiagramGraph }>;
  groups: Map<string, Shown>;
  // The group each original node or folded region is a member of.
  groupOf: Map<string, string>;
  isOriginal: (id: string) => boolean;
}

const read = async (source: string, plan: SplitPlan): Promise<Reading | string[]> => {
  const original = await extractGraph(source);
  const overview = await extractGraph(plan.overviewSource);
  const ids = new Set([...original.nodes, ...original.subgraphs].map((n) => n.id));
  const isOriginal = (id: string): boolean => ids.has(id);
  const problems: string[] = [];
  const groups = new Map<string, Shown>();
  for (const n of overview.nodes.filter((x) => !isOriginal(x.id))) {
    const m = GROUP_LABEL.exec(n.label);
    if (!m) problems.push(`group ${n.id} label "${n.label}" has no (+N)`);
    else if (m[3] !== undefined && m[3] !== n.id) problems.push(`group ${n.id} label names ${m[3]}`);
    else groups.set(n.id, { label: n.label, base: m[1] ?? "", n: Number(m[2]) });
  }
  const order = plan.details.map((d) => d.group);
  if ([...order].sort().join() !== [...groups.keys()].sort().join())
    problems.push(`the details ${order.join()} are not the overview's groups ${[...groups.keys()].join()}`);
  const details = await Promise.all(
    plan.details.map(async (d, i) => ({ group: order[i] ?? "", graph: await extractGraph(d.source) })),
  );
  const drawn = new Set(overview.subgraphs.map((s) => s.id));
  const groupOf = new Map<string, string>();
  for (const d of details) {
    for (const n of d.graph.nodes.filter((x) => isOriginal(x.id))) groupOf.set(n.id, d.group);
    for (const s of d.graph.subgraphs.filter((x) => !drawn.has(x.id))) groupOf.set(s.id, d.group);
  }
  if (problems.length > 0) return problems;
  return { original, overview, details, groups, groupOf, isOriginal };
};

const literalOf = (r: Reading): Map<string, string[]> => {
  const literal = new Map<string, string[]>();
  const add = (label: string, id: string): void => {
    literal.set(label, [...(literal.get(label) ?? []), id]);
  };
  for (const n of r.original.nodes) add(n.label, n.id);
  for (const s of r.original.subgraphs) if (s.label !== "") add(s.label, s.id);
  for (const p of r.original.pseudo?.nodes ?? []) if (p.shape === "lollipop") add(p.label, `()${p.label}`);
  return literal;
};

// The members of a group a stub's text names as the one its edges leave: the
// group's shown label, " from ", then a label of the group's own members.
const fromOf = (r: Reading, literal: Map<string, string[]>, text: string): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const [gid, g] of r.groups) {
    if (!text.startsWith(`${g.label} from `)) continue;
    const ids = (literal.get(text.slice(g.label.length + 6)) ?? []).filter((id) => r.groupOf.get(id) === gid);
    if (ids.length > 0) out.set(gid, ids);
  }
  return out;
};

// Every node, region or group a stub's text names, by each form a plan
// writes: a label as it is, a group's shown label, a label with " (in ", the
// label the group holding it shows and ")", a group's shown
// label with " from " and one of its members' labels, and any of these with
// " [id]" naming one of its readings.
const readerOf = (r: Reading): ((text: string) => Set<string>) => {
  const literal = literalOf(r);
  const held = (own: string, fits: (g: Shown) => boolean): string[] =>
    (literal.get(own) ?? []).filter((id) => {
      const g = r.groups.get(r.groupOf.get(id) ?? "");
      return g !== undefined && fits(g);
    });
  const readings = (text: string): Set<string> => {
    const out = new Set<string>([...(literal.get(text) ?? []), ...fromOf(r, literal, text).keys()]);
    for (const [id, g] of r.groups) if (g.label === text) out.add(id);
    const tag = /^(.*) \[([^\]]+)\]$/s.exec(text);
    if (tag && readings(tag[1] ?? "").has(tag[2] ?? "")) out.add(tag[2] ?? "");
    for (const id of inGroup(text)) out.add(id);
    return out;
  };
  // " (in ", then the label the group shows, at any " (in ".
  const inGroup = (text: string): string[] => {
    if (!text.endsWith(")")) return [];
    const cuts = [...text.matchAll(/ \(in /g)].map((m) => m.index ?? 0);
    return cuts.flatMap((at) => held(text.slice(0, at), (g) => g.label === text.slice(at + " (in ".length, -1)));
  };
  return readings;
};

// The labels the docs promise for a group holding a whole dotted family or
// twin chains, written out. A family label: three members or more, each label
// leading with one namespace and a dot, as gold.x, no other node's label
// leading with it, read as the namespace and ".*". A lane label, in a
// flowchart or stateDiagram: the members' directed edges form two paths or
// more of one length, two or more, each member on one; each place along them
// is named by the namespace all its labels lead with, else the first word all
// of them lead with, else "…", at least one place named, joined by " → ", at
// most forty characters. Both count every member.
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
    return wholeOnly(at.map(wholeNs)) ?? wholeOnly(at.map(wholeWord));
  });
  const lane = places.map((p) => p ?? "…").join(" → ");
  const short = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(lane)].length <= 40;
  return places.some((p) => p !== null) && short ? lane : null;
};

const wholeLabels = (original: DiagramGraph, members: readonly GraphNode[]): string[] => {
  const inside = new Set(members.map((m) => m.id));
  const family = wholeOnly(members.map((m) => wholeNs(m.label)));
  const outside = original.nodes.some((n) => !inside.has(n.id) && wholeNs(n.label) === family);
  const out = members.length >= 3 && family !== null && !outside ? [`${family}.*`] : [];
  if (!/^(flowchart|graph|state)/.test(original.diagram_type)) return out;
  const paths = wholePaths(original, members);
  const lane = paths === null ? null : wholeLane(paths);
  return lane === null ? out : [...out, lane];
};

// Each group label is a member's or a folded region's label, cut by the
// documented rule, and counts the members it does not name, or a family or
// lane label counting every member. A folded
// region's label may be qualified by the label of the region it sits in, in
// the original and as the overview draws the group node, as "Public subnets
// (us-east-1)", counting every member.
const labelProblems = (r: Reading): string[] =>
  r.details.flatMap((d) => {
    const g = r.groups.get(d.group);
    if (!g) return [];
    const members = d.graph.nodes.filter((n) => r.isOriginal(n.id));
    const folded = d.graph.subgraphs.filter((s) => r.groupOf.get(s.id) === d.group);
    const byMember = members.some((m) => cutOf(g.base, m.label)) && g.n === members.length - 1;
    const byRegion = folded.some((s) => cutOf(g.base, s.label)) && g.n >= members.length - 1;
    const sits = r.overview.nodes.find((n) => n.id === d.group)?.parent ?? null;
    const around = r.original.subgraphs.find((x) => x.id === sits);
    const byQualified =
      around !== undefined &&
      g.n === members.length &&
      folded.some(
        (s) =>
          r.original.subgraphs.find((x) => x.id === s.id)?.parent === around.id &&
          g.base === `${s.label} (${around.label})`,
      );
    const others = r.details.filter((x) => x.group !== d.group);
    const hidden = others.flatMap((x) => x.graph.nodes.filter((n) => r.isOriginal(n.id)).map((n) => n.label));
    const byRange =
      rangeOf(
        members.map((m) => m.label),
        hidden,
      ) === g.base && g.n === members.length - 2;
    const byWhole = wholeLabels(r.original, members).includes(g.base) && g.n === members.length;
    const named = r.original.nodes.some((n) => n.label === g.label);
    return [
      ...(byMember || byRegion || byQualified || byRange || byWhole
        ? []
        : [`group ${d.group} label "${g.label}" is not its members' or region's`]),
      ...(named ? [`group ${d.group} label "${g.label}" is a node's label`] : []),
    ];
  });

// Each stub's one reading, or a problem when it has none or several.
const stubReadings = (r: Reading): { of: Map<string, Map<string, string>>; problems: string[] } => {
  const readings = readerOf(r);
  const problems: string[] = [];
  const of = new Map<string, Map<string, string>>();
  for (const d of r.details) {
    const stubs = new Map<string, string>();
    for (const s of d.graph.nodes.filter((n) => !r.isOriginal(n.id))) {
      const read = [...readings(s.label)];
      if (read.length === 1) stubs.set(s.id, read[0] ?? "");
      else problems.push(`detail ${d.group} stub "${s.label}" reads as ${read.join(" or ") || "nothing"}`);
    }
    of.set(d.group, stubs);
  }
  return { of, problems };
};

// A stub naming the member its edges leave draws only that member's edges:
// each edge from it, read from that member, is an original edge.
const fromProblems = (r: Reading): string[] => {
  const literal = literalOf(r);
  const end = endsOf(r.original);
  const original = new Set(r.original.edges.map((e) => edgeKey(e, end(e.source), end(e.target))));
  return r.details.flatMap((d) =>
    d.graph.nodes
      .filter((n) => !r.isOriginal(n.id))
      .flatMap((s) => {
        const named = [...fromOf(r, literal, s.label).values()].flat();
        const drawn = d.graph.edges.filter((e) => e.source === s.id);
        const held = drawn.every((e) => named.some((m) => original.has(edgeKey(e, m, e.target))));
        return named.length === 0 || (drawn.length > 0 && held)
          ? []
          : [`detail ${d.group} stub "${s.label}" draws an edge its member has not`];
      }),
  );
};

// Each original edge once: from the overview between two kept nodes, else
// from a detail. A stub read as a whole group gives the half edge from that
// group into the member, or from the member into that group, which stands for
// every edge between the two that draws alike, so each is drawn exactly once
// and a second copy is an extra. An edge between two groups is drawn exactly
// in one end's detail and as a half in the other's. The overview joins the
// overview nodes of every edge.
interface DetailDrawing {
  exact: string[];
  halves: string[];
  problems: string[];
  // The details drawing each exact edge.
  drawnIn: Map<string, string[]>;
}

const drawOne = (r: Reading, out: DetailDrawing, group: string, [e, s, t]: [GraphEdge, string, string]): void => {
  const key = edgeKey(e, s, t);
  if (r.groups.has(s) && r.groups.has(t)) out.problems.push(`detail ${group} has an edge between two whole groups`);
  else if (r.groups.has(s) || r.groups.has(t)) out.halves.push(key);
  else {
    out.exact.push(key);
    out.drawnIn.set(key, [...(out.drawnIn.get(key) ?? []), group]);
  }
};

const detailDrawing = (r: Reading, stubs: Map<string, Map<string, string>>): DetailDrawing => {
  const out: DetailDrawing = { exact: [], halves: [], problems: [], drawnIn: new Map() };
  for (const d of r.details) {
    const dEnd = endsOf(d.graph);
    const named = stubs.get(d.group) ?? new Map<string, string>();
    for (const e of d.graph.edges)
      drawOne(r, out, d.group, [e, named.get(e.source) ?? dEnd(e.source), named.get(e.target) ?? dEnd(e.target)]);
  }
  return out;
};

// The overview joins the overview nodes of every edge, an undirected link
// (no arrowhead or end marker and no cardinality) drawn the other way between
// the same two nodes, one of them a group, counting as declared.
const joinProblems = (r: Reading, plan: SplitPlan): string[] => {
  const end = endsOf(r.original);
  const over = (x: string): string => r.groupOf.get(x) ?? x;
  const oEnd = endsOf(r.overview);
  const pairs = new Set(r.overview.edges.map((e) => `${oEnd(e.source)}\u0000${oEnd(e.target)}`));
  const backs = new Set(
    r.overview.edges
      .filter(
        (e) => UNDIRECTED.has(e.kind ?? "") && !e.cardinality && (r.groups.has(e.source) || r.groups.has(e.target)),
      )
      .map((e) => `${oEnd(e.target)}\u0000${oEnd(e.source)}\u0000${e.kind}`),
  );
  let reversed = 0;
  const unjoined = r.original.edges
    .map((e) => [over(end(e.source)), over(end(e.target)), e.kind ?? ""])
    .filter(([a, b, kind]) => {
      if ((a === b && r.groups.has(a ?? "")) || pairs.has(`${a}\u0000${b}`)) return false;
      if (!backs.has(`${a}\u0000${b}\u0000${kind}`)) return true;
      reversed++;
      return false;
    })
    .map(([a, b]) => `the overview does not join ${a} to ${b}`);
  return reversed === plan.loss.reversedEdges
    ? unjoined
    : [`the overview draws ${reversed} edges the other way, not the ${plan.loss.reversedEdges} declared`, ...unjoined];
};

// The halves a plan owes: an edge between two groups, from the detail that
// does not draw it exactly. The edges of one kind one way between one group
// and one member read as one half, with what they all agree on; an
// erDiagram's per label and cardinality.
const owedHalves = (r: Reading, drawnIn: Map<string, string[]>): string[] => {
  const end = endsOf(r.original);
  const over = (x: string): string => r.groupOf.get(x) ?? x;
  const er = r.original.diagram_type === "er";
  const buckets = new Map<string, { s: string; t: string; edges: GraphEdge[] }>();
  for (const e of r.original.edges) {
    const [s, t] = [end(e.source), end(e.target)];
    if (!(over(s) !== s && over(t) !== t && over(s) !== over(t))) continue;
    const [hs, ht] = drawnIn.get(edgeKey(e, s, t))?.shift() === over(t) ? [s, over(t)] : [over(s), t];
    const key = JSON.stringify([hs, ht, e.kind ?? "", er ? (e.label ?? "") : "", er ? (e.cardinality ?? "") : ""]);
    const b = buckets.get(key) ?? { s: hs, t: ht, edges: [] };
    b.edges.push(e);
    buckets.set(key, b);
  }
  return [...buckets.values()].map(({ s, t, edges }) => {
    const all = (pick: (e: GraphEdge) => unknown): boolean =>
      edges.every((e) => pick(e) === pick(edges[0] as GraphEdge));
    const [first] = edges as [GraphEdge];
    const labelled = all((e) => e.label) && all((e) => e.markdown ?? false);
    return JSON.stringify([
      s,
      t,
      labelled ? (first.label ?? "") : "",
      labelled ? (first.markdown ?? false) : false,
      all((e) => e.kind) ? (first.kind ?? "") : "",
      all((e) => e.cardinality) ? (first.cardinality ?? "") : "",
    ]);
  });
};

const edgeProblems = (r: Reading, stubs: Map<string, Map<string, string>>, plan: SplitPlan): string[] => {
  const end = endsOf(r.original);
  const oEnd = endsOf(r.overview);
  const drawing = detailDrawing(r, stubs);
  const exact = [
    ...r.overview.edges
      .filter((e) => !(r.groups.has(e.source) || r.groups.has(e.target)))
      .map((e) => edgeKey(e, oEnd(e.source), oEnd(e.target))),
    ...drawing.exact,
  ];
  return [
    ...drawing.problems,
    ...joinProblems(r, plan),
    ...diff(
      r.original.edges.map((e) => edgeKey(e, end(e.source), end(e.target))),
      exact,
      "edge",
    ),
    ...diff([...new Set(owedHalves(r, drawing.drawnIn))], drawing.halves, "half edge"),
  ];
};

const markerKeys = (g: DiagramGraph, keep: (end: string) => boolean): string[] => {
  const markers = new Map((g.pseudo?.nodes ?? []).filter((m) => MARKERS.has(m.shape ?? "")).map((m) => [m.id, m]));
  return (g.pseudo?.edges ?? []).flatMap((e) => {
    const m = markers.get(e.source) ?? markers.get(e.target);
    const end = markers.has(e.source) ? e.target : e.source;
    if (!m || markers.has(end) || !keep(end)) return [];
    return [JSON.stringify([m.shape, m.parent, end, markers.has(e.source) ? "out" : "in", e.label ?? ""])];
  });
};

type Mark = [string, string | null, string, string, string];

// Start and end transitions: each original once on a real state, and a
// transition the overview draws onto a group only for transitions into its
// members, labelled exactly with the label they all carry, drawn once, and
// every transition it merges beyond the first declared.
const markerProblems = (r: Reading, plan: SplitPlan): string[] => {
  const want = markerKeys(r.original, () => true);
  const real = (x: string): boolean => r.isOriginal(x) && !r.groups.has(x);
  const got = [...markerKeys(r.overview, real), ...r.details.flatMap((d) => markerKeys(d.graph, real))];
  const onStubs = r.details.flatMap((d) => markerKeys(d.graph, (x) => !real(x)));
  const wanted = want.map((k) => JSON.parse(k) as Mark);
  const drawn = markerKeys(r.overview, (x) => r.groups.has(x)).map((k) => JSON.parse(k) as Mark);
  let merged = 0;
  const onGroups = drawn.flatMap(([shape, parent, g, dir, label]) => {
    const wit = wanted.filter((w) => w[0] === shape && w[1] === parent && w[3] === dir && r.groupOf.get(w[2]) === g);
    if (wit.length === 0) return [`the transition onto ${g} stands for none`];
    merged += wit.length - 1;
    // labelled exactly when every transition it stands for agrees
    const agreed = wit.every((w) => w[4] === wit[0]?.[4]) ? (wit[0]?.[4] ?? "") : "";
    return label === agreed ? [] : [`the transition onto ${g} claims "${label}", not "${agreed}"`];
  });
  const keys = drawn.map((m) => JSON.stringify(m.slice(0, 4)));
  return [
    ...diff(want, got, "marker transition"),
    ...onStubs.map((k) => `marker transition on a stub: ${k}`),
    ...onGroups,
    ...(new Set(keys).size === keys.length ? [] : ["a transition onto a group is drawn twice"]),
    ...(merged === plan.loss.mergedMarkers
      ? []
      : [`${merged} marker transitions merged, ${plan.loss.mergedMarkers} declared`]),
  ];
};

// Nodes and regions. A namespace a classDiagram detail draws around a dotted
// name may repeat one drawn elsewhere, so a classDiagram counts a region once;
// any other region drawn twice is an extra.
const elementProblems = (r: Reading): string[] => {
  const kept = r.overview.nodes.filter((n) => r.isOriginal(n.id) && !r.groups.has(n.id));
  const members = r.details.flatMap((d) => d.graph.nodes.filter((n) => r.isOriginal(n.id)));
  const all = [...r.overview.subgraphs, ...r.details.flatMap((d) => d.graph.subgraphs)].map(regionKey);
  const regions = r.original.diagram_type.startsWith("class") ? [...new Set(all)] : all;
  return [
    ...diff(r.original.nodes.map(nodeKey), [...kept, ...members].map(nodeKey), "node"),
    ...diff(r.original.subgraphs.map(regionKey), regions, "region"),
  ];
};

const DECIDING = new Set(["diamond", "choice", "fork", "join"]);

type Links = Map<string, Set<string>>;

// The original's flow: each edge, both ways when it has no direction, and
// each start or end transition.
const flowOf = (g: DiagramGraph): { succ: Links; pred: Links } => {
  const succ: Links = new Map();
  const pred: Links = new Map();
  const add = (a: string, b: string): void => {
    succ.set(a, new Set([...(succ.get(a) ?? []), b]));
    pred.set(b, new Set([...(pred.get(b) ?? []), a]));
  };
  for (const e of [...g.edges, ...(g.pseudo?.edges ?? [])]) {
    add(e.source, e.target);
    if (UNDIRECTED.has(e.kind ?? "")) add(e.target, e.source);
  }
  return { succ, pred };
};

const reachAvoiding = (succ: Links, from: string, avoid: string | null): Set<string> => {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length > 0) {
    for (const w of succ.get(stack.pop() as string) ?? []) {
      if (w === avoid || seen.has(w)) continue;
      seen.add(w);
      stack.push(w);
    }
  }
  return seen;
};

// Whether the group holds a set around the node that every edge enters at one
// member and leaves towards one outside node or none: a single-entry
// single-exit region folded whole. End markers may sit in the set.
const inRegion = (g: DiagramGraph, held: Set<string>, node: string): boolean => {
  const { succ, pred } = flowOf(g);
  const markers = new Set((g.pseudo?.nodes ?? []).filter((m) => MARKERS.has(m.shape ?? "")).map((m) => m.id));
  const inside = (v: string): boolean => held.has(v) || markers.has(v);
  const outs = [...held].flatMap((v) => [...(succ.get(v) ?? [])]).filter((x) => !inside(x));
  return [...held].some((h) =>
    [null, ...new Set(outs)].some((x) => {
      const set = reachAvoiding(succ, h, x);
      return (
        set.has(node) &&
        [...set].every(
          (v) =>
            inside(v) &&
            (v === h || [...(pred.get(v) ?? [])].every((u) => set.has(u))) &&
            [...(succ.get(v) ?? [])].every((w) => set.has(w) || w === x),
        )
      );
    }),
  );
};

// A decision, choice, fork or join folded into a group sits in an author
// region the group folds, or in a single-entry single-exit region the group
// holds whole.
const protectionProblems = (r: Reading): string[] => {
  const parentOf = new Map(r.original.subgraphs.map((s) => [s.id, s.parent]));
  return r.original.nodes.flatMap((n) => {
    const g = r.groupOf.get(n.id);
    if (g === undefined || !DECIDING.has(n.shape ?? "")) return [];
    for (let p = n.parent; p !== null && p !== undefined; p = parentOf.get(p) ?? null) {
      if (r.groupOf.get(p) === g) return [];
    }
    const held = new Set([...r.groupOf].filter(([, x]) => x === g).map(([id]) => id));
    return inRegion(r.original, held, n.id) ? [] : [`protected ${n.id} is folded in ${g} outside a whole region`];
  });
};

export const faithful = async (source: string, plan: SplitPlan): Promise<string[]> => {
  const r = await read(source, plan);
  if (Array.isArray(r)) return r;
  const { of, problems } = stubReadings(r);
  return [
    ...labelProblems(r),
    ...problems,
    ...elementProblems(r),
    ...edgeProblems(r, of, plan),
    ...fromProblems(r),
    ...markerProblems(r, plan),
    ...protectionProblems(r),
  ];
};
