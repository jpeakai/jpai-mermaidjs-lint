// Proof obligations for a fix. The engine applies one edit, re-parses, and
// checks that the document changed exactly as the edit declared. An edit that
// cannot be proven is refused, the source is left alone, and the finding stays.

import type { Node, Root } from "mdast";
import type { DocModel } from "../model.ts";
import type { Edit } from "../rules/types.ts";

type Plain = { [k: string]: unknown };

const OMIT = new Set(["position", "data"]);

// A position-free copy of the tree for structural comparison. The body of a
// mermaid fence is blanked when asked, because a diagram fix edits it.
export const normalise = (node: Node, opts: { blankDiagrams?: boolean } = {}): Plain => {
  const out: Plain = {};
  const isDiagram = node.type === "code" && (node as { lang?: string }).lang === "mermaid";
  for (const [key, value] of Object.entries(node)) {
    if (OMIT.has(key)) continue;
    if (key === "children" && Array.isArray(value)) {
      out.children = (value as Node[]).map((child) => normalise(child, opts));
    } else if (key === "value" && typeof value === "string") {
      if (isDiagram && opts.blankDiagrams) continue;
      out.value = node.type === "text" ? value.replace(/\s+/g, " ").trim() : value;
    } else {
      out[key] = value;
    }
  }
  return out;
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
      s.diagram_type,
      s.nodes,
      s.edges,
      s.subgraphs,
      s.max_subgraph_depth,
      s.node_ids,
      s.subgraph_names,
    ];
    if (!sameJson(shape(a), shape(b))) return false;
  }
  return true;
};

export const verify = async (edit: Edit, before: DocModel, after: DocModel): Promise<Verdict> => {
  if (edit.expect.kind === "same-tree") {
    return sameTree(before.tree, after.tree, {}) ? "accept" : "refuse";
  }
  return (await sameDiagrams(before, after)) ? "accept" : "refuse";
};
