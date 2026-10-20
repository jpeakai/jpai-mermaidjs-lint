// The text a plan draws for a group node and for a stub, always made from the
// diagram's own labels. A long author label is shown cut, with an ellipsis,
// and kept whole in the plan data. A stub names the outside node it stands
// for; a stub for a node inside another group adds " (in ", the label that
// group shows and ")", as "PAYMENT_METHOD (in CUSTOMER (+2))", and a label
// several stubs could share adds the id it stands for. A stub for a whole
// group beside a stub for its namesake member names the member its edges
// leave, as "ORDER (+6) from PAYMENT".

import { byNatural, type WorkGraph } from "./graph.ts";
import { chainsOf, endpointLabel, type Group, isGroupKey, over, type Partition, type Stub } from "./quotient.ts";

// The longest label a group node shows, in user-perceived characters.
export const LABEL_CAP = 40;

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

// The characters kept after the ellipsis, where labels in a series differ.
const TAIL = 12;

// A label cut to LABEL_CAP characters, its middle replaced by an ellipsis, so
// both its start and its end still show. Markup is never cut, since half a
// tag or half a markdown span reads back as other text.
export const shorten = (label: string, markdown?: true): string => {
  if (markdown || /[<&*_`#]/.test(label)) return label;
  const chars = [...graphemes.segment(label)].map((s) => s.segment);
  if (chars.length <= LABEL_CAP) return label;
  const head = chars
    .slice(0, LABEL_CAP - TAIL - 1)
    .join("")
    .trimEnd();
  return `${head}…${chars.slice(-TAIL).join("").trimStart()}`;
};

// A range label: a group's first and last member labels in natural order,
// joined by a spaced ellipsis, which a cut label never shows. It names a run
// of interchangeable members as an index names a volume, so it is offered for
// twins and sibling leaves, and for members whose labels all lead with an id
// (DATA-0381, S10004, "10011 Wont Do"), where one member's label says little.
// It counts the members it does not name, two fewer than the group holds, and
// is offered only for three members or more, with no markup, within LABEL_CAP.
// A range must not mislead: no member of another group (hidden, so a reader
// would look for it here) has a label from the first to the last.
export const RANGE_SEPARATOR = " … ";

const MARKUP = /[<&*_`#]/;

export const rangeLabel = (labels: readonly string[], hidden: readonly string[] = []): string | null => {
  const order = [...labels].sort(byNatural);
  const [first, last] = [order[0], order.at(-1)];
  if (labels.length < 3 || first === undefined || last === undefined || first === last) return null;
  if (order.some((l) => MARKUP.test(l) || l.includes(RANGE_SEPARATOR))) return null;
  if (hidden.some((l) => byNatural(first, l) <= 0 && byNatural(l, last) <= 0)) return null;
  const base = `${first}${RANGE_SEPARATOR}${last}`;
  return [...graphemes.segment(base)].length <= LABEL_CAP ? base : null;
};

// A label that leads with an id: up to five letters, an optional dash or
// underscore, then two digits or more, ending there or at a separator.
export const ID_LEAD = /^[A-Za-z]{0,5}[-_]?\d{2,}(?=$|[\s:._-])/;

// The dotted namespace leading a label, as "gold" in gold.daily_revenue:
// letters, digits and dashes from a letter, then a dot and a word character.
export const DOTTED = /^([A-Za-z][A-Za-z0-9-]*)\.[A-Za-z0-9_]/;

export const dottedFamily = (label: string): string | null => DOTTED.exec(label.trim())?.[1] ?? null;

// A family label names a group holding a whole dotted family: three members or
// more, every one's label leading with one namespace, as gold.daily_revenue
// and gold.customer_ltv, and no node outside the group leading with it. It
// reads as the namespace and ".*", as "gold.*", and counts every member.
export const FAMILY_SUFFIX = ".*";

export const familyLabel = (labels: readonly string[], outside: readonly string[]): string | null => {
  const families = new Set(labels.map(dottedFamily));
  const [family] = [...families];
  if (labels.length < 3 || families.size !== 1 || family === undefined || family === null) return null;
  return outside.some((l) => dottedFamily(l) === family) ? null : `${family}${FAMILY_SUFFIX}`;
};

// A lane label names twin chains by their stages, as "Extract → bronze" for
// extracts each feeding the bronze table it lands in. Each chain holds its
// members' labels in flow order, and every chain is as long as the others,
// two members or more. A stage is named by the dotted namespace every label
// at that place leads with, else by the first word every one of them leads
// with, else by the two first words they lead with between them, in natural
// order and joined by a slash, as "Extract/Ingest" (MJL-0038), else shown as
// an ellipsis. At least one stage is named, and the label counts every member.
export const LANE_SEPARATOR = " → ";

const FIRST_WORD = /^(\p{L}[\p{L}\p{N}-]*)\s/u;

// What joins the two first words a stage of twin chains is named by.
export const WORD_SEPARATOR = "/";

// The two first words a place's labels lead with between them, in natural
// order and joined by WORD_SEPARATOR: null unless every label leads with a
// word and they lead with exactly two.
const twoWords = (words: Array<string | null>): string | null => {
  const set = [...new Set(words)];
  if (set.length !== 2 || set.some((w) => w === null)) return null;
  return (set as string[]).sort(byNatural).join(WORD_SEPARATOR);
};

export const laneLabel = (chains: readonly (readonly string[])[]): string | null => {
  const length = chains[0]?.length ?? 0;
  if (chains.length < 2 || length < 2 || chains.some((c) => c.length !== length)) return null;
  const one = (xs: Array<string | null>): string | null => {
    const set = new Set(xs);
    const [x] = [...set];
    return set.size === 1 && x !== undefined ? x : null;
  };
  const stages = Array.from({ length }, (_, i) => {
    const labels = chains.map((c) => (c[i] ?? "").trim());
    const words = labels.map((l) => FIRST_WORD.exec(l)?.[1] ?? null);
    return one(labels.map(dottedFamily)) ?? one(words) ?? twoWords(words);
  });
  if (stages.every((s) => s === null)) return null;
  const base = stages.map((s) => s ?? "…").join(LANE_SEPARATOR);
  return [...graphemes.segment(base)].length <= LABEL_CAP ? base : null;
};

// A fan label names a group holding every leaf one overview node leads to,
// or every leaf leading to it, by that node's name and an ellipsis, as
// "Checkout domain → …" for the external APIs Checkout calls (MJL-0038). The
// name holds no markup and the label at most LABEL_CAP characters; it counts
// every member.
export const fanLabel = (name: string, out: boolean): string | null => {
  if (name.trim() === "" || MARKUP.test(name)) return null;
  const base = out ? `${name}${LANE_SEPARATOR}…` : `…${LANE_SEPARATOR}${name}`;
  return [...graphemes.segment(base)].length <= LABEL_CAP ? base : null;
};

const labelOf = (work: WorkGraph, id: string): string => work.nodes.get(id)?.label ?? id;

// The family label and the lane label a group may take , from the
// diagram's own labels: a family against every node outside the group.
export const wholeNaming = (
  work: WorkGraph,
  g: Pick<Group, "members">,
): { family: string | null; lane: string | null } => {
  const inside = new Set(g.members);
  const outside = [...work.nodes.values()].filter((n) => !inside.has(n.id)).map((n) => n.label);
  const chains = chainsOf(work, g.members);
  return {
    family: familyLabel(
      g.members.map((m) => labelOf(work, m)),
      outside,
    ),
    lane: chains === null ? null : laneLabel(chains.map((c) => c.map((m) => labelOf(work, m)))),
  };
};

// A pair label names a group of two members by both, the one it is named
// after and then, in place of the count, the other's label after a plus, as
// "ROOM (+BUILDING)", so the overview hides no name (MJL-0038). Neither label
// holds markup or a bracket, the other is not a number, which the count
// would read as, and the whole label holds at most LABEL_CAP characters.
const NOT_PAIRED = /[()[\]<&*`#]|^\d+$/;

export const pairLabel = (named: string, other: string): string | null => {
  if (named === other || named.trim() === "" || other.trim() === "") return null;
  if ([named, other].some((l) => NOT_PAIRED.test(l) || l !== l.trim())) return null;
  const label = `${named} (+${other})`;
  return [...graphemes.segment(label)].length <= LABEL_CAP ? label : null;
};

// The labels a group may show, preferred first: the label cut, the whole
// label, then the label cut with the group's id, for when another node or
// group already shows the others. A pair label is shown only whole.
export const groupLabels = (
  { base, n, markdown, pair }: { base: string; n: number; markdown?: true | undefined; pair?: string | undefined },
  id: string,
): string[] => {
  if (pair !== undefined) return [`${base} (+${pair})`];
  const cut = `${shorten(base, markdown)} (+${n})`;
  return [...new Set([cut, `${base} (+${n})`, `${cut} [${id}]`])];
};

export interface StubText {
  label: string;
  markdown?: true;
  // The original id the stub stands for, or the id of the group it stands for.
  endpoint: string;
}

export interface LabelContext {
  work: WorkGraph;
  part: Partition;
  // Each group by its key in the partition: its id, its whole author label,
  // the label it shows, and whether that is a pair label.
  groups: Map<string, { id: string; base: string; label: string; markdown?: true; paired?: true }>;
}

const markdownOf = (work: WorkGraph, id: string): { markdown?: true } =>
  work.nodes.get(id)?.markdown || work.regions.get(id)?.markdown ? { markdown: true } : {};

// Whether a stub for a member of a group shows its own label alone: the
// group shows both members' labels in a pair label, or the member is the one
// the group is named after, so the group's shown label leads with the
// member's own label, uncut (MJL-0038).
export const ownSuffices = (
  g: { label: string; base: string; markdown?: true; paired?: unknown },
  own: string,
  markdown: boolean,
): boolean =>
  g.paired !== undefined || (!(markdown || g.markdown) && g.base === own && g.label.startsWith(`${own} (+`));

// The text before any id is added: the node's label, then IN, the label its
// group shows and a closing bracket when it sits in a group; a whole group by
// its shown label. A member whose own label suffices (ownSuffices) is named
// by its own label alone.
const plainText = (ctx: LabelContext, endpoint: string): StubText => {
  if (isGroupKey(endpoint)) {
    const g = ctx.groups.get(endpoint);
    return { label: g?.label ?? endpoint, endpoint: g?.id ?? endpoint, ...(g?.markdown ? { markdown: true } : {}) };
  }
  const own = endpointLabel(ctx.work, endpoint);
  const g = ctx.groups.get(over(ctx.work, ctx.part, endpoint));
  const md = markdownOf(ctx.work, endpoint);
  const label = g === undefined || ownSuffices(g, own, md.markdown === true) ? own : `${own}${IN}${g.label})`;
  return { label, endpoint, ...md };
};

// A stub's text before any id is added (plainText).
export const memberText = (ctx: LabelContext, endpoint: string): string => plainText(ctx, endpoint).label;

// What a reader of a plan has to go on when a stub's text names a node: every
// label the diagram's own nodes, regions and interfaces show, each group's
// shown label and whole author label, and which group folds a node.
export interface Reader {
  literal: Map<string, string[]>;
  groups: Array<{ id: string; label: string; base: string; markdown?: true }>;
  groupOf: (id: string) => string | undefined;
}

export const readerOf = (work: WorkGraph, groups: Reader["groups"], groupOf: Reader["groupOf"]): Reader => {
  const literal = new Map<string, string[]>();
  const add = (label: string, id: string): void => {
    literal.set(label, [...(literal.get(label) ?? []), id]);
  };
  for (const n of work.nodes.values()) add(n.label, n.id);
  // A composite state's box shows its state's name, so only the state reads.
  for (const r of work.regions.values()) if (!r.owner && r.label !== "") add(r.label, r.id);
  for (const [id, l] of work.lollipops) add(l.label, id);
  return { literal, groups, groupOf };
};

// What joins a member's label to the label its group shows, in a stub for
// that member: the text reads "PAYMENT_METHOD (in CUSTOMER (+2))".
export const IN = " (in ";

// What joins a whole group's shown label to the member a stub's edges leave.
export const FROM = " from ";

// The members of group gid a text names after its shown label and FROM: none
// unless the text is that form.
export const fromMembers = (r: Reader, text: string, gid: string): string[] => {
  const g = r.groups.find((x) => x.id === gid);
  if (!(g && text.startsWith(`${g.label}${FROM}`))) return [];
  return (r.literal.get(text.slice(g.label.length + FROM.length)) ?? []).filter((id) => r.groupOf(id) === gid);
};
const TAG = /^(.*) \[([^\]]+)\]$/s;

// Every node or group a stub's text can be read as naming, by each form the
// plan writes: a label as it is, a group's shown label, a label with IN, the
// shown label of the group folding it and a closing bracket, a group's shown
// label with FROM and one of its members' labels, and any of these followed
// by " [id]" naming one of its readings. A stub is drawn only with a
// text that has exactly one reading.
export const readingsOf = (r: Reader, text: string): Set<string> => {
  const fromGroups = r.groups.filter((g) => fromMembers(r, text, g.id).length > 0).map((g) => g.id);
  const out = new Set<string>([...(r.literal.get(text) ?? []), ...fromGroups]);
  for (const g of r.groups) if (g.label === text) out.add(g.id);
  const tag = TAG.exec(text);
  if (tag && readingsOf(r, tag[1] ?? "").has(tag[2] ?? "")) out.add(tag[2] ?? "");
  const inGroup = (own: string, fits: (g: Reader["groups"][number]) => boolean): void => {
    for (const id of r.literal.get(own) ?? []) {
      const g = r.groups.find((x) => x.id === r.groupOf(id));
      if (g && fits(g)) out.add(id);
    }
  };
  if (text.endsWith(")")) {
    for (let at = text.indexOf(IN); at >= 0; at = text.indexOf(IN, at + 1)) {
      const shown = text.slice(at + IN.length, -1);
      inGroup(text.slice(0, at), (g) => g.label === shown);
    }
  }
  return out;
};

// The most " [id]" tags a stub's text takes before the plan gives up on it.
const MAX_TAGS = 3;

const contextReader = (ctx: LabelContext): Reader =>
  readerOf(ctx.work, [...ctx.groups.values()], (id) => {
    const key = over(ctx.work, ctx.part, id);
    return isGroupKey(key) ? ctx.groups.get(key)?.id : undefined;
  });

// Each stub's text: the plain text when it reads as its endpoint alone, else
// the text followed by " [id]", as often as it takes for one reading.
export const stubTexts = (ctx: LabelContext, stubs: Stub[]): Map<string, StubText> => {
  const reader = contextReader(ctx);
  return new Map(
    stubs.map((s) => {
      const text = plainText(ctx, s.endpoint);
      let label = text.label;
      for (let i = 0; i < MAX_TAGS; i++) {
        const read = readingsOf(reader, label);
        if (read.size === 1 && read.has(text.endpoint)) break;
        label = `${label} [${text.endpoint}]`;
      }
      return [s.id, { ...text, label }];
    }),
  );
};

// A stub for a whole group reads alike another stub when they show one text,
// or when the other stands for the member the group is named after ("ORDER"
// beside "ORDER (+6)"). Each such stub takes FROM and the label of
// the one member its edges leave, when that text has exactly the one reading
// and that member is not the namesake, which the group's label already names.
// Null when two stubs would still show one text.
export const namedStubs = (
  ctx: LabelContext,
  stubs: Stub[],
  texts: Map<string, StubText>,
  sourcesOf: (stub: string) => string[],
): Map<string, StubText> | null => {
  const reader = contextReader(ctx);
  const count = new Map<string, number>();
  for (const t of texts.values()) count.set(t.label, (count.get(t.label) ?? 0) + 1);
  const alike = (endpoint: string, label: string): boolean => {
    const base = ctx.groups.get(endpoint)?.base;
    return (count.get(label) ?? 0) > 1 || count.has(`${base}${IN}${label})`) || (base !== undefined && count.has(base));
  };
  const out = new Map(texts);
  for (const s of stubs) {
    const t = texts.get(s.id);
    const [source, ...more] = sourcesOf(s.id);
    if (!(t && isGroupKey(s.endpoint) && alike(s.endpoint, t.label)) || t.markdown || !source || more.length > 0)
      continue;
    const member = endpointLabel(ctx.work, source);
    // The namesake itself is what the group's label already names.
    if (member === ctx.groups.get(s.endpoint)?.base) continue;
    const label = `${t.label}${FROM}${member}`;
    const read = readingsOf(reader, label);
    const node = ctx.work.nodes.get(source);
    if (!node || MARKUP.test(member) || node.markdown || read.size !== 1 || !read.has(t.endpoint)) continue;
    out.set(s.id, { ...t, label });
  }
  const labels = [...out.values()].map((t) => t.label);
  return new Set(labels).size === labels.length ? out : null;
};
