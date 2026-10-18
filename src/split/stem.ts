// Label similarity for suggested grouping: Porter's stemmer and a Jaccard
// score over the stems of two labels, where a role word (service, queue, db
// and the like) weighs a quarter, so "Order service" and
// "Orders DB" are close and "Order service" and "Payment service" are not.
// An id-like label says nothing about meaning, so it contributes nothing.

import { Window } from "happy-dom";
import { stemmer } from "stemmer";
import { htmlEntities } from "./emit.ts";

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

const wordsOf = (label: string): string[] => {
  const el = page.document.createElement("div");
  el.innerHTML = htmlEntities(label);
  return [...words.segment(el.textContent ?? "")].filter((s) => s.isWordLike).map((s) => s.segment.toLowerCase());
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
