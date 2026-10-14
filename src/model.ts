// The document model: a markdown file parsed to mdast once, then flattened to
// the diagrams in it. A standalone .mmd file is one diagram with no markdown
// around it. Every rule reads this model, so a check and a fix can never
// disagree about which text is a diagram.

import type { Code, Node, Parent, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { extractStyleDirectives, type StyleDirective, type ValueSpan } from "./parse/color.ts";
import { type DiagramStats, detectKeyword, extractStats } from "./parse/stats.ts";

export interface Diagram {
  index: number;
  // The diagram text. Inside a list or a quote the indentation is already off.
  source: string;
  // The first word of the diagram, past any frontmatter and comments.
  keyword: string | null;
  // The file lines a finding points at: the fences, or the whole file.
  startLine: number;
  endLine: number;
  // The file line of the first line of `source`.
  firstLine: number;
  // False when the fence runs to the end of the file without a closing fence.
  terminated: boolean;
  // The source offset where the fence ends, or the end of a standalone file.
  endOffset: number;
  directives: StyleDirective[];
  // The absolute source offset of a value in a directive, or null when the
  // line cannot be mapped back, which makes a fixer refuse.
  offsetOf: (span: ValueSpan) => number | null;
  // What mermaid's own parser reads from the diagram, parsed once on first use.
  stats: () => Promise<DiagramStats>;
}

export interface DocModel {
  src: string;
  kind: "markdown" | "diagram";
  tree: Root;
  diagrams: Diagram[];
}

export const parse = (src: string): Root =>
  fromMarkdown(src, {
    extensions: [frontmatter(["yaml", "toml"]), gfm()],
    mdastExtensions: [frontmatterFromMarkdown(["yaml", "toml"]), gfmFromMarkdown()],
  });

const FENCE_OPEN = /^[ \t>]*(`{3,}|~{3,})/;
const FENCE_CLOSE = /^[ \t>]*(`{3,}|~{3,})[ \t]*$/;

const isTerminated = (raw: string): boolean => {
  const lines = raw.split("\n");
  if (lines.length < 2) return false;
  const open = FENCE_OPEN.exec(lines[0] ?? "")?.[1];
  const close = FENCE_CLOSE.exec(lines.at(-1) ?? "")?.[1];
  return Boolean(open && close && close[0] === open[0] && close.length >= open.length);
};

const lineStartsOf = (src: string): number[] => {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return starts;
};

const makeDiagram = (
  src: string,
  lineStarts: number[],
  fields: {
    index: number;
    source: string;
    startLine: number;
    endLine: number;
    firstLine: number;
    terminated: boolean;
    endOffset: number;
  },
): Diagram => {
  const { source, firstLine } = fields;
  const contentLines = source.split("\n");
  let pending: Promise<DiagramStats> | undefined;
  return {
    ...fields,
    keyword: detectKeyword(source),
    directives: extractStyleDirectives(source),
    offsetOf: (span) => {
      const fileLine = firstLine + span.line - 1;
      const start = lineStarts[fileLine - 1];
      const next = lineStarts[fileLine];
      const content = contentLines[span.line - 1];
      if (start === undefined || content === undefined) return null;
      const raw = src.slice(start, next === undefined ? src.length : next - 1);
      if (!raw.endsWith(content)) return null;
      return start + (raw.length - content.length) + span.start;
    },
    stats: () => {
      pending ??= extractStats(source);
      return pending;
    },
  };
};

const collectMermaid = (node: Node, out: Code[]): void => {
  if (node.type === "code" && (node as Code).lang === "mermaid") out.push(node as Code);
  for (const child of (node as Parent).children ?? []) collectMermaid(child, out);
};

export const buildDocModel = (src: string, kind: "markdown" | "diagram" = "markdown"): DocModel => {
  const lineStarts = lineStartsOf(src);
  if (kind === "diagram") {
    const endLine = lineStarts.length;
    const diagram = makeDiagram(src, lineStarts, {
      index: 0,
      source: src,
      startLine: 1,
      endLine,
      firstLine: 1,
      terminated: true,
      endOffset: src.length,
    });
    return { src, kind, tree: { type: "root", children: [] }, diagrams: [diagram] };
  }
  const tree = parse(src);
  const fences: Code[] = [];
  collectMermaid(tree, fences);
  const diagrams = fences.flatMap((node, index) => {
    const { start, end } = node.position ?? {};
    if (!start || !end || start.offset === undefined || end.offset === undefined) return [];
    return [
      makeDiagram(src, lineStarts, {
        index,
        source: node.value,
        startLine: start.line,
        endLine: end.line,
        firstLine: start.line + 1,
        terminated: isTerminated(src.slice(start.offset, end.offset)),
        endOffset: end.offset,
      }),
    ];
  });
  return { src, kind, tree, diagrams };
};

export const isMarkdownFile = (file: string): boolean => /\.(md|markdown)$/i.test(file);
