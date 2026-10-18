// The text a plan draws for a group node and for a stub, always made from the
// diagram's own labels. A long author label is shown cut, with an ellipsis,
// and kept whole in the plan data. A stub names the outside node it stands
// for; a stub for a node inside another group adds that group's label, and a
// label several stubs could share adds the id it stands for. Stubs for one
// whole group that one detail draws apart name the member each one's edges
// leave, as "Checkout domain (+5) from paymentservice".

import { byNatural, type WorkGraph } from "./graph.ts";
import { endpointLabel, isGroupKey, over, type Partition, type Stub } from "./quotient.ts";

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

// The labels a group may show, preferred first: the label cut, the whole
// label, then the label cut with the group's id, for when another node or
// group already shows the others.
export const groupLabels = (base: string, n: number, markdown: true | undefined, id: string): string[] => {
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
  // and the label it shows.
  groups: Map<string, { id: string; base: string; label: string; markdown?: true }>;
}

const markdownOf = (work: WorkGraph, id: string): { markdown?: true } =>
  work.nodes.get(id)?.markdown || work.regions.get(id)?.markdown ? { markdown: true } : {};

// The text before any id is added: the node's label, then its group's label
// in brackets when that differs; a whole group by its shown label.
const plainText = (ctx: LabelContext, endpoint: string): StubText => {
  if (isGroupKey(endpoint)) {
    const g = ctx.groups.get(endpoint);
    return { label: g?.label ?? endpoint, endpoint: g?.id ?? endpoint, ...(g?.markdown ? { markdown: true } : {}) };
  }
  const own = endpointLabel(ctx.work, endpoint);
  const g = ctx.groups.get(over(ctx.work, ctx.part, endpoint));
  const label =
    g === undefined ? own : g.base === own ? `${own} (in group)` : `${own} (${shorten(g.base, g.markdown)})`;
  return { label, endpoint, ...markdownOf(ctx.work, endpoint) };
};

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

const IN_GROUP = " (in group)";

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
// plan writes: a label as it is, a group's shown label, a label with " (in
// group)" or the label of the group folding it in brackets, a group's shown
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
  if (text.endsWith(IN_GROUP))
    inGroup(text.slice(0, -IN_GROUP.length), (g) => g.base === text.slice(0, -IN_GROUP.length));
  if (text.endsWith(")")) {
    for (let at = text.indexOf(" ("); at >= 0; at = text.indexOf(" (", at + 1)) {
      const shown = text.slice(at + 2, -1);
      inGroup(text.slice(0, at), (g) => shorten(g.base, g.markdown) === shown);
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
// as stubs for one group drawn apart do, or when the other stands for the
// member the group is named after ("QA (in group)" beside "QA (+2)"). Each
// such stub takes FROM and the label of the one member its edges leave, when
// that text has exactly the one reading. Null when two stubs would still
// show one text: the detail then draws one stub for the group.
export const namedStubs = (
  ctx: LabelContext,
  stubs: Stub[],
  texts: Map<string, StubText>,
  sourcesOf: (stub: string) => string[],
): Map<string, StubText> | null => {
  const reader = contextReader(ctx);
  const count = new Map<string, number>();
  for (const t of texts.values()) count.set(t.label, (count.get(t.label) ?? 0) + 1);
  const alike = (endpoint: string, label: string): boolean =>
    (count.get(label) ?? 0) > 1 || count.has(`${ctx.groups.get(endpoint)?.base}${IN_GROUP}`);
  const out = new Map(texts);
  for (const s of stubs) {
    const t = texts.get(s.id);
    const [source, ...more] = sourcesOf(s.id);
    if (!(t && isGroupKey(s.endpoint) && alike(s.endpoint, t.label)) || t.markdown || !source || more.length > 0)
      continue;
    const member = endpointLabel(ctx.work, source);
    const label = `${t.label}${FROM}${member}`;
    const read = readingsOf(reader, label);
    const node = ctx.work.nodes.get(source);
    if (!node || MARKUP.test(member) || node.markdown || read.size !== 1 || !read.has(t.endpoint)) continue;
    out.set(s.id, { ...t, label });
  }
  const labels = [...out.values()].map((t) => t.label);
  return new Set(labels).size === labels.length ? out : null;
};
