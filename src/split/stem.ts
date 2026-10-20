// Label similarity for suggested grouping: Porter's stemmer and a Jaccard
// score over the stems of two labels, where a role word (service, queue, db
// and the like) weighs a quarter, so "Order service" and
// "Orders DB" are close and "Order service" and "Payment service" are not.
// An id-like label says nothing about meaning, so it contributes nothing.

import { Window } from "happy-dom";
import { stemmer } from "stemmer";
import { htmlEntities } from "./emit.ts";
import { DOTTED, ID_LEAD } from "./label.ts";

// Stop words, and the "fa" of a Font Awesome icon a label names (fa:fa-car).
const STOP = new Set(["fa", "the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "by", "with", "is", "per"]);
const ROLE_WORDS = [
  "service",
  "db",
  "database",
  "queue",
  "feed",
  "log",
  "gateway",
  "processor",
  "api",
  "store",
  "cache",
  "bucket",
  "table",
];

const ROLE_WEIGHT = 0.25;

// Porter's stemmer, as the stemmer package keeps it.
export const stem = (word: string): string => stemmer(word.toLowerCase());

const ID_LIKE = /^[A-Za-z]{0,2}\d*$/;

// A label's words as text: markup read by a DOM, so only its text is left,
// then split into words by the platform's word segmenter.
const page = new Window({
  settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
});
const words = new Intl.Segmenter("en", { granularity: "word" });

const textOf = (label: string): string => {
  const el = page.document.createElement("div");
  el.innerHTML = htmlEntities(label);
  return el.textContent ?? "";
};

const wordsOf = (label: string): string[] =>
  [...words.segment(textOf(label))].filter((s) => s.isWordLike).map((s) => s.segment.toLowerCase());

// A label as the text a reader sees: its markup read by a DOM, each line
// break element replaced by a space first, so the lines do not run together.
export const plainText = (label: string): string => {
  const el = page.document.createElement("div");
  el.innerHTML = htmlEntities(label);
  for (const br of [...el.querySelectorAll("br")]) br.replaceWith(" ");
  return (el.textContent ?? "").split(/\s+/).filter(Boolean).join(" ");
};

// The stems of a label's words, or none for an id-like label.
export const labelBag = (label: string, id: string): Set<string> => {
  const text = label.trim();
  if (text === id || ID_LIKE.test(text)) return new Set();
  return new Set(
    wordsOf(text)
      .filter((w) => !STOP.has(w))
      .map(stem),
  );
};

// Role words compared by their stems, as the labels are.
const ROLE = new Set(ROLE_WORDS.map(stem));

const weight = (w: string): number => (ROLE.has(w) ? ROLE_WEIGHT : 1);

export const similarity = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  let shared = 0;
  let union = 0;
  for (const w of new Set([...a, ...b])) {
    union += weight(w);
    if (a.has(w) && b.has(w)) shared += weight(w);
  }
  return union === 0 ? 0 : shared / union;
};

// The prefix family a node names: a dotted namespace leading its label, as
// bronze.orders; else the letters leading a label that leads with an id, as
// PLAT-1201 or OPS_12; else the letters before an underscore leading its id,
// as br_orders. Null for a node that names none, as "10002 Backlog".
const FAMILY_ID_LEAD = /^([A-Za-z]{1,5})[-_]?\d{2,}(?=$|[\s:._-])/;
const STAGE_ID = /^([A-Za-z]+)_[A-Za-z0-9]/;

export const stageOf = (label: string, id: string): string | null => {
  const text = label.trim();
  const found = DOTTED.exec(text)?.[1] ?? FAMILY_ID_LEAD.exec(text)?.[1] ?? STAGE_ID.exec(id)?.[1] ?? null;
  return found?.toLowerCase() ?? null;
};

// The status family of each node whose label leads with an id and names no
// prefix family, as "10008 Ready for Release": the stem of a word after the
// id that the label shares with another such label, as "releas" in "10009
// Released". The words after the id are a status, and two statuses sharing a
// stem name one stage of a workflow. A label sharing no stem, or sharing two,
// names none. Each family is marked apart from prefix families.
export const STATUS_MARK = "~";

export const statusFamilies = (labels: ReadonlyMap<string, string>): Map<string, string> => {
  const stems = new Map<string, Set<string>>();
  for (const [id, label] of labels) {
    const text = label.trim();
    const lead = ID_LEAD.exec(text);
    if (!lead || stageOf(text, id) !== null) continue;
    const words = labelBag(text.slice(lead[0].length), id);
    stems.set(id, new Set([...words].filter((w) => !ID_LIKE.test(w))));
  }
  const count = new Map<string, number>();
  for (const ws of stems.values()) for (const w of ws) count.set(w, (count.get(w) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const [id, ws] of stems) {
    const shared = [...ws].filter((w) => (count.get(w) ?? 0) > 1);
    if (shared.length === 1) out.set(id, `${STATUS_MARK}${shared[0]}`);
  }
  return out;
};

const named = (xs: Iterable<string | null>): Set<string> => new Set([...xs].filter((s): s is string => s !== null));

// Whether two sets of members name families and share none: merging them
// would mix two stages of a pipeline, such as an extract and a gold table.
export const crossesStages = (a: Iterable<string | null>, b: Iterable<string | null>): boolean => {
  const [sa, sb] = [named(a), named(b)];
  return sa.size > 0 && sb.size > 0 && ![...sa].some((s) => sb.has(s));
};

// Whether members name two prefix families or more between them.
export const mixesFamilies = (families: Iterable<string | null>): boolean => named(families).size > 1;

// Whether two sets of members name one prefix family between them, and only one.
export const oneFamily = (a: Iterable<string | null>, b: Iterable<string | null>): boolean =>
  named([...a, ...b]).size === 1 && named(a).size === 1 && named(b).size === 1;
