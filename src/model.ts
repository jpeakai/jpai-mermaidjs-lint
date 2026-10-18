// The document model: a markdown file parsed to mdast once, then flattened to
// the diagrams in it. A standalone .mmd file is one diagram with no markdown
// around it. Every rule reads this model, so a check and a fix can never
// disagree about which text is a diagram.

import type { Code, Node, Parent, Root } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { parse as parseMicromark, postprocess, preprocess } from "micromark";
import { frontmatter } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";
import type { ValueSpan } from "./parse/color.ts";
import { type DiagramStats, detectKeyword, extractStats } from "./parse/stats.ts";
import { readStyles, type StyleReading } from "./parse/styles.ts";

export interface Diagram {
  index: number;
  // The diagram text. Inside a list or a quote the indentation is already off.
  source: string;
  // The keyword of the diagram type mermaid detects, such as flowchart or
  // erDiagram, or null when it detects none. See detectKeyword.
  keyword: string | null;
  // The file lines a finding points at: the fences, or the whole file.
  startLine: number;
  endLine: number;
  // The file line of the first line of `source`.
  firstLine: number;
  // False when the fence has no closing fence, so it runs to the end of the
  // file or of the quote or list item around it.
  terminated: boolean;
  // The line that closes the fence: the opening fence with the quote markers
  // and indentation before it on its line. Null for a standalone file, and
  // when the opening line holds anything else before the fence, such as a list
  // item's marker.
  closingFence: string | null;
  // The source offset where the fence ends, or the end of a standalone file.
  endOffset: number;
  // The style directives mermaid's parser reads from the diagram, read once on
  // first use.
  styles: () => Promise<StyleReading>;
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

const micromarkExtensions = () => [frontmatter(["yaml", "toml"]), gfm()];

export const parse = (src: string): Root =>
  fromMarkdown(src, {
    extensions: micromarkExtensions(),
    mdastExtensions: [frontmatterFromMarkdown(["yaml", "toml"]), gfmFromMarkdown()],
  });

// What micromark's events say about one fenced code block, keyed by the
// offset where it starts, which is where its mdast code node starts.
interface FenceFacts {
  // A closed block has an opening and a closing fence, an unterminated one
  // only its opening fence.
  terminated: boolean;
  closingFence: string | null;
}

// The tokens that may stand before a fence on its line: indentation, a quote
// marker with its space, and a list item's continuation indent.
const FENCE_LINE_PREFIX = new Set(["linePrefix", "blockQuotePrefix", "listItemIndent"]);

type MicromarkEvent = ReturnType<typeof postprocess>[number];

// Each token's text, serialised by the tokenizer that made it.
const serialise = ([, token, context]: MicromarkEvent): string => context.sliceSerialize(token);

// The fence that closes a block: the opening fence sequence after the prefix
// tokens on its line. It is null when they do not cover the whole line up to
// the fence, as when a list item's marker stands before it.
const closingFenceOf = (events: MicromarkEvent[], sequence: MicromarkEvent, lineStart: number): string | null => {
  const fenceStart = sequence[1].start.offset;
  const before = events.filter(
    ([kind, token]) =>
      kind === "enter" &&
      FENCE_LINE_PREFIX.has(token.type) &&
      token.start.offset >= lineStart &&
      token.end.offset <= fenceStart,
  );
  const covered = before.reduce((n, [, token]) => n + token.end.offset - token.start.offset, 0);
  if (covered !== fenceStart - lineStart) return null;
  return [...before, sequence].map(serialise).join("");
};

// The enter events of each fenced code block, its own codeFenced first.
const fenceEvents = (events: MicromarkEvent[]): MicromarkEvent[][] => {
  const blocks: MicromarkEvent[][] = [];
  let open: MicromarkEvent[] | null = null;
  for (const event of events) {
    const [kind, token] = event;
    if (token.type === "codeFenced" && kind === "enter") open = [];
    else if (token.type === "codeFenced" && open) {
      blocks.push(open);
      open = null;
    }
    if (kind === "enter") open?.push(event);
  }
  return blocks;
};

// Every fenced code block in a markdown source, read from micromark's events
// with the same extensions the mdast tree is built with. A block's fences are
// counted from its codeFencedFence tokens, and its opening fence is its first
// codeFencedFenceSequence.
const fencedBlocks = (src: string, lineStarts: number[]): Map<number, FenceFacts> => {
  const events = postprocess(
    parseMicromark({ extensions: micromarkExtensions() })
      .document()
      .write(preprocess()(src, undefined, true)),
  );
  const blocks = new Map<number, FenceFacts>();
  for (const block of fenceEvents(events)) {
    const sequence = block.find(([, token]) => token.type === "codeFencedFenceSequence");
    const lineStart = sequence ? lineStarts[sequence[1].start.line - 1] : undefined;
    const closingFence = sequence && lineStart !== undefined ? closingFenceOf(events, sequence, lineStart) : null;
    const fences = block.filter(([, token]) => token.type === "codeFencedFence").length;
    blocks.set(block[0]?.[1].start.offset ?? -1, { terminated: fences === 2, closingFence });
  }
  return blocks;
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
    closingFence: string | null;
    endOffset: number;
  },
): Diagram => {
  const { source, firstLine } = fields;
  const contentLines = source.split("\n");
  let pending: Promise<DiagramStats> | undefined;
  let styled: Promise<StyleReading> | undefined;
  return {
    ...fields,
    keyword: detectKeyword(source),
    styles: () => {
      styled ??= readStyles(source);
      return styled;
    },
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

// The extensions of a raw diagram file. Any other file is read as markdown.
export const DIAGRAM_EXTS = [".mmd", ".mermaid"] as const;

// How a file is read, from its name alone: a raw diagram, or markdown whose
// mermaid fences are the diagrams.
export const documentKind = (file: string): "markdown" | "diagram" => {
  const lower = file.toLowerCase();
  return DIAGRAM_EXTS.some((ext) => lower.endsWith(ext)) ? "diagram" : "markdown";
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
      closingFence: null,
      endOffset: src.length,
    });
    return { src, kind, tree: { type: "root", children: [] }, diagrams: [diagram] };
  }
  const tree = parse(src);
  const fences: Code[] = [];
  collectMermaid(tree, fences);
  const blocks = fences.length > 0 ? fencedBlocks(src, lineStarts) : new Map<number, FenceFacts>();
  const diagrams = fences.flatMap((node, index) => {
    const { start, end } = node.position ?? {};
    if (!(start && end) || start.offset === undefined || end.offset === undefined) return [];
    const block = blocks.get(start.offset);
    if (!block) throw new Error(`micromark read no fenced code block at line ${start.line}, where mdast has one`);
    return [
      makeDiagram(src, lineStarts, {
        index,
        source: node.value,
        startLine: start.line,
        endLine: end.line,
        firstLine: start.line + 1,
        ...block,
        endOffset: end.offset,
      }),
    ];
  });
  return { src, kind, tree, diagrams };
};

export const isMarkdownFile = (file: string): boolean => /\.(md|markdown)$/i.test(file);
