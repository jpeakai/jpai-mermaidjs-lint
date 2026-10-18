// The text a plan draws for a group node and for a stub, always made from the
// diagram's own labels. A long author label is shown cut, with an ellipsis,
// and kept whole in the plan data. A stub names the outside node it stands
// for; a stub for a node inside another group adds that group's label, and a
// label several stubs could share adds the id it stands for.

import type { WorkGraph } from "./graph.ts";
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

// Every label a stub could be confused with: each original node, region and
// interface's own label and each group's shown label.
const takenLabels = (ctx: LabelContext): Map<string, number> => {
  const counts = new Map<string, number>();
  const add = (label: string): void => {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  };
  for (const id of [...ctx.work.ids, ...ctx.work.regionIds, ...ctx.work.lollipops.keys()]) {
    const text = plainText(ctx, id).label;
    add(text);
    // A node's own label, which it shows in a detail as a member.
    if (text !== endpointLabel(ctx.work, id)) add(endpointLabel(ctx.work, id));
  }
  for (const g of ctx.groups.values()) add(g.label);
  return counts;
};

export const stubTexts = (ctx: LabelContext, stubs: Stub[]): Map<string, StubText> => {
  const taken = takenLabels(ctx);
  return new Map(
    stubs.map((s) => {
      const text = plainText(ctx, s.endpoint);
      const shared = (taken.get(text.label) ?? 0) > 1;
      return [s.id, shared ? { ...text, label: `${text.label} [${text.endpoint}]` } : text];
    }),
  );
};
