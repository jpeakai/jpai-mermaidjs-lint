// Proof obligations for a fix. The engine applies edits, re-parses, and checks
// that the document still satisfies each edit's declared expectation. An edit that
// cannot be proven is refused, the source is left alone, and the finding stays.

import type { Node, Root } from "mdast";
import type { DocModel } from "../model.ts";
import { parseFailed } from "../parse/metrics.ts";
import type { Edit } from "../rules/types.ts";

type Plain = { [k: string]: unknown };

const OMIT = new Set(["position", "data"]);

// A position-free copy of the tree for structural comparison. The body of a
// mermaid fence is blanked when asked, because a diagram fix edits it.
export const normalise = (node: Node, opts: { blankDiagrams?: boolean } = {}): Plain => {
  const out: Plain = {};
  const isDiagram = node.type === "code" && (node as { lang?: string }).lang === "mermaid";
  const blank = isDiagram && Boolean(opts.blankDiagrams);
  for (const [key, value] of Object.entries(node)) {
    if (OMIT.has(key)) continue;
    if (blank && isStringValue(key, value)) continue;
    out[key] = normaliseField(node, key, value, opts);
  }
  return out;
};

const isStringValue = (key: string, value: unknown): value is string => key === "value" && typeof value === "string";

// One field of the copy: children normalised in turn, and a text node's value
// with its whitespace collapsed. Every other field is kept as it is.
const normaliseField = (node: Node, key: string, value: unknown, opts: { blankDiagrams?: boolean }): unknown => {
  if (key === "children" && Array.isArray(value)) return (value as Node[]).map((child) => normalise(child, opts));
  if (isStringValue(key, value)) return node.type === "text" ? value.replace(/\s+/g, " ").trim() : value;
  return value;
};

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const sameTree = (a: Root, b: Root, opts: { blankDiagrams?: boolean }): boolean =>
  sameJson(normalise(a, opts), normalise(b, opts));

export type Verdict = "accept" | "refuse";

const sameDiagrams = async (before: DocModel, after: DocModel): Promise<boolean> => {
  if (before.diagrams.length !== after.diagrams.length) return false;
  if (!sameTree(before.tree, after.tree, { blankDiagrams: true })) return false;
  for (const [i, was] of before.diagrams.entries()) {
    const now = after.diagrams[i];
    if (!now || was.keyword !== now.keyword) return false;
    const [a, b] = await Promise.all([was.stats(), now.stats()]);
    const shape = (s: typeof a): unknown => [
      parseFailed(s),
      s.diagram_type,
      s.nodes,
      s.edges,
      s.subgraphs,
      s.max_subgraph_depth,
      s.max_tree_depth,
      s.rows,
      s.node_ids,
      s.subgraph_names,
    ];
    if (!sameJson(shape(a), shape(b))) return false;
  }
  return true;
};

// Whether a diagram that parsed before the edit fails to parse after it. The
// diagrams are matched by position, which same-tree's identical tree already
// pins. Asked of same-tree edits as a belt to the tree comparison's braces: a
// diagram's text sits in the tree, so an unchanged tree cannot break it today,
// but no edit may ever trade a parseable diagram for an unparseable one.
const breaksAParse = async (before: DocModel, after: DocModel): Promise<boolean> => {
  for (const [i, was] of before.diagrams.entries()) {
    const now = after.diagrams[i];
    if (!now) continue;
    const [a, b] = await Promise.all([was.stats(), now.stats()]);
    if (!parseFailed(a) && parseFailed(b)) return true;
  }
  return false;
};

// A raw diagram file (.mmd, .mermaid) has no markdown around its diagram, so
// its tree is an empty root and comparing trees would prove nothing. There,
// same-tree also demands what same-diagrams does: the diagram is still there
// and parses to the same structure. same-diagrams compares parse success too
// (parseFailed, the test parse-diagram-unparseable applies), so an edit can
// neither break a diagram that parsed nor claim to have kept the diagrams the
// same while making an unparseable one parse.
export const verify = async (edit: Edit, before: DocModel, after: DocModel): Promise<Verdict> => {
  if (edit.expect.kind === "same-tree") {
    if (!sameTree(before.tree, after.tree, {})) return "refuse";
    if (before.kind === "markdown" && after.kind === "markdown") {
      return (await breaksAParse(before, after)) ? "refuse" : "accept";
    }
  }
  return (await sameDiagrams(before, after)) ? "accept" : "refuse";
};
