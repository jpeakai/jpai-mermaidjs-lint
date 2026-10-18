// Style directives, read from mermaid's parser result, per MJL-0022.
//
// What a diagram declares about its colours comes from the parsed DB: the
// classDefs, the styles a style statement puts on a node, entity, state or
// class, the classes each one carries, and the styles a linkStyle puts on an
// edge. Where each statement sits comes from the parser too: the diagram is
// parsed again with its own lexer traced and its DB's style methods wrapped,
// so each statement is placed by the location of the keyword token the lexer
// read. Nothing here scans the diagram text for structure.
//
// Mermaid parses a preprocessed copy of the diagram: frontmatter, directives,
// comments and leading blank lines are dropped, and some lines are edited in
// place (entity codes, a style statement's trailing semicolon). A line of that
// copy is placed back in the source by sourceLines, and a value whose text the
// copy changed has no span, so a fixer refuses to rewrite it (MJL-0005).

import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { frontmatter } from "micromark-extension-frontmatter";
import { isMap, isScalar, LineCounter, parseDocument } from "yaml";
import type { StyleDirective, ValueSpan } from "./color.ts";
import { getMermaidCore } from "./stats.ts";

type Db = Record<string, unknown>;
type Method = (...args: unknown[]) => unknown;

// The slice of a JISON lexer the trace reads: the text it has consumed so
// far, its current match, and the token text the grammar's action kept.
interface Lexer {
  lex: Method;
  matched: string;
  match: string;
  yytext: string;
}

interface Jison {
  lexer?: Lexer;
  terminals_?: Record<number, string>;
  yy?: unknown;
}

// The diagram mermaid's getDiagramFromText returns: the preprocessed text it
// parsed, its DB and its parser.
interface ParsedDiagram {
  type: string;
  text: string;
  db: Db;
  parser: Jison & { parser?: Jison; parse: (text: string) => unknown };
}

// A token as the diagram's lexer read it, with its 1-based line and 0-based
// columns in the text mermaid parsed.
export interface Token {
  name: string;
  text: string;
  line: number;
  column: number;
  endColumn: number;
}

type DirectiveKind = StyleDirective["kind"];

// The statement keywords, by the lexer's token name in lower case. Every JISON
// grammar that has style statements names its tokens after the keyword.
const KEYWORDS: Readonly<Record<string, DirectiveKind>> = {
  classdef: "classDef",
  style: "style",
  linkstyle: "linkStyle",
};

const keywordOf = (token: Token | undefined): DirectiveKind | undefined => token && KEYWORDS[token.name.toLowerCase()];

// One style statement as the parser read it: what it styles, the
// declarations it wrote, and where its keyword sits in the parsed text.
interface Statement {
  kind: DirectiveKind;
  ids: string[];
  styles: string[];
  line: number;
  keywordEnd: number;
}

type Read = Omit<Statement, "line" | "keywordEnd">;

// A DB method a style statement calls, and what the statement was, read off
// the call's arguments.
type Hooks = Readonly<Record<string, (args: unknown[]) => Read | null>>;

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

// The keyword token of the statement a DB call is reducing. The parser has
// lexed the whole statement, and at most one lookahead token past it, which
// may be the next statement's keyword, so that last token is never the one.
const keywordAt = (tokens: Token[], kind: DirectiveKind): Token | undefined =>
  tokens.findLast((t, i) => i < tokens.length - 1 && keywordOf(t) === kind);

// Where the lexer's current match starts in the text it read, as a 1-based line
// and 0-based column. It is counted from the text the lexer has consumed, its
// `matched`, because JISON's own yylloc lines drift after a token that holds
// several newlines, such as a flowchart's run of blank lines.
const positionOf = (matched: string, match: string): { line: number; column: number } => {
  const start = matched.length - match.length;
  const before = matched.slice(0, start);
  let line = 1;
  for (const ch of before) if (ch === "\n") line++;
  return { line, column: start - (before.lastIndexOf("\n") + 1) };
};

// What a traced parse yields: the tokens, the style statements, and the text
// the lexer read, which their lines count in.
interface Traced {
  tokens: Token[];
  statements: Statement[];
  input: string;
}

// Replaces a method for the length of one parse and records how to put it back.
const wrapper =
  (restore: Array<() => void>, type: string) =>
  (target: object, name: string, around: (original: Method) => Method): void => {
    const slots = target as Record<string, unknown>;
    const own = Object.getOwnPropertyDescriptor(target, name);
    const original = slots[name];
    if (typeof original !== "function") throw new Error(`the ${type} parser has no ${name}`);
    slots[name] = around(original as Method);
    restore.push(() => {
      if (own) Object.defineProperty(target, name, own);
      else delete slots[name];
    });
  };

// Parses the diagram again with its lexer traced and its DB's style methods
// wrapped, then puts both back. It is one synchronous block, so no other parse
// can see the wrappers. A diagram mermaid reads with a Langium grammar has no
// JISON lexer and no style statements, so it yields no tokens.
const traceParse = (diagram: ParsedDiagram, hooks: Hooks): Traced => {
  const jison = diagram.parser.parser ?? diagram.parser;
  const { lexer, terminals_: terminals } = jison;
  const tokens: Token[] = [];
  const statements: Statement[] = [];
  if (!(lexer && terminals)) return { tokens, statements, input: diagram.text };
  const { db } = diagram;
  const restore: Array<() => void> = [];
  const wrap = wrapper(restore, diagram.type);
  wrap(
    lexer,
    "lex",
    (lex) =>
      function (this: Lexer, ...args: unknown[]) {
        const code = lex.apply(this, args);
        const { line, column } = positionOf(this.matched, this.match);
        const name = typeof code === "number" ? (terminals[code] ?? String(code)) : String(code);
        const last = tokens.at(-1);
        // The JISON lexer re-enters lex for a skipped match, so one token can be
        // returned twice.
        if (!(last && last.name === name && last.line === line && last.column === column)) {
          tokens.push({ name, text: this.yytext, line, column, endColumn: column + this.match.length });
        }
        return code;
      },
  );
  // A parser may rewrite the text before its lexer reads it, as the flowchart
  // parser folds the blank lines after a `}`, so the lexer's own input is the
  // text its positions count in.
  let input = diagram.text;
  wrap(
    lexer,
    "setInput",
    (setInput) =>
      function (this: Lexer, ...args: unknown[]) {
        input = String(args[0]);
        return setInput.apply(this, args);
      },
  );
  for (const [name, read] of Object.entries(hooks)) {
    wrap(db, name, (original) => (...args: unknown[]) => {
      const statement = read(args);
      if (statement) {
        const keyword = keywordAt(tokens, statement.kind);
        statements.push({ ...statement, line: keyword?.line ?? 0, keywordEnd: keyword?.endColumn ?? 0 });
      }
      return original.apply(db, args);
    });
  }
  try {
    (db.clear as Method | undefined)?.call(db);
    if (diagram.parser.parser) diagram.parser.parser.yy = db;
    diagram.parser.parse(diagram.text);
  } finally {
    for (const undo of restore.reverse()) undo();
  }
  return { tokens, statements, input };
};

// The length of the text two strings start with.
const commonPrefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
};

// The anchors of sourceLines: each parsed line matched exactly, in order, to
// the source line it came from. A blank line never anchors.
const anchorsOf = (src: string[], txt: string[]): Array<number | undefined> => {
  const anchor: Array<number | undefined> = [];
  let cursor = 0;
  for (const [i, line] of txt.entries()) {
    if (!line.trim()) continue;
    const j = src.indexOf(line, cursor);
    if (j >= 0) {
      anchor[i] = j;
      cursor = j + 1;
    }
  }
  return anchor;
};

// Places a line of the text mermaid parsed in the diagram source, as a
// 1-based source line, or null when it cannot be placed exactly. A line is
// matched to its source line by its text, in order. A line mermaid edited lies
// between two matched lines: it is placed by position when as many lines lie
// between them in the source, which means none were dropped, or else by the
// one source line there that shares the most text with it, past the end of the
// statement's keyword.
export const sourceLines = (source: string, parsed: string): ((line: number, keywordEnd?: number) => number | null) => {
  const src = source.split("\n").map((l) => l.trimStart());
  const raw = parsed.split("\n");
  const txt = raw.map((l) => l.trimStart());
  const anchor = anchorsOf(src, txt);
  // The nearest anchored parsed line before i (step -1) or after it (step 1).
  const nearest = (i: number, step: number): number => {
    let k = i + step;
    while (k >= 0 && k < txt.length && anchor[k] === undefined) k += step;
    return k;
  };
  return (line, keywordEnd = 0) => {
    const i = line - 1;
    const hit = anchor[i];
    if (hit !== undefined) return hit + 1;
    const text = txt[i];
    if (text === undefined) return null;
    const a = nearest(i, -1);
    const b = nearest(i, 1);
    const from = anchor[a] ?? -1;
    const to = anchor[b];
    if (to !== undefined && to - from === b - a) return from + (i - a) + 1;
    const least = keywordEnd - ((raw[i]?.length ?? 0) - text.length);
    return least > 0 ? closestBetween(src, [from, to ?? src.length], text, least) : null;
  };
};

// The one source line strictly between from and to that shares the most text
// with a parsed line, at least `least` characters, as a 1-based line, or null
// when no line or more than one qualifies.
const closestBetween = (src: string[], [from, to]: [number, number], text: string, least: number): number | null => {
  const scored = src
    .slice(from + 1, to)
    .map((s, k) => ({ at: from + 1 + k, shared: commonPrefix(s, text) }))
    .filter((c) => c.shared >= least);
  const best = Math.max(...scored.map((c) => c.shared));
  const top = scored.filter((c) => c.shared === best);
  return top.length === 1 && top[0] ? top[0].at + 1 : null;
};

// The declarations in a DB's style strings, in order, as key, value and the
// declaration's text. A string may hold several joined by commas, as a
// classDiagram classDef keeps them, and mermaid splits them the same way.
const declarations = (styles: string[]): Array<[string, string, string]> =>
  styles
    .flatMap((s) => s.split(","))
    .flatMap((raw): Array<[string, string, string]> => {
      const decl = raw.trim();
      const colon = decl.indexOf(":");
      if (colon === -1) return [];
      const key = decl.slice(0, colon).trim().toLowerCase();
      const value = decl.slice(colon + 1).trim();
      return key && value ? [[key, value, decl]] : [];
    });

// Where each declaration a statement wrote sits on its source line: the one
// place on the line that holds the declaration's text. A declaration whose
// text is not on the line, because mermaid edited it, or is there twice, gets
// no span, and neither do the earlier declarations of its property.
const valueSpans = (lineText: string, line: number, styles: string[]): Record<string, ValueSpan> => {
  const spans: Record<string, ValueSpan> = {};
  for (const [key, value, decl] of declarations(styles)) {
    const at = lineText.indexOf(decl);
    if (at === -1 || lineText.indexOf(decl, at + 1) !== -1) {
      delete spans[key];
      continue;
    }
    const start = at + decl.indexOf(value, decl.indexOf(":") + 1);
    spans[key] = { line, start, end: start + value.length };
  }
  return spans;
};

// One styled thing in the DB: the declarations it inherits from its classes or
// the default linkStyle, then its own.
interface Styled {
  kind: DirectiveKind;
  selector: string;
  inherited: string[];
  own: string[];
}

type ClassMap = Map<string, { styles?: unknown }>;

const call = <T>(db: Db, name: string, ...args: unknown[]): T => {
  const method = db[name];
  if (typeof method !== "function") throw new Error(`the parser's DB has no ${name}`);
  return (method as Method).apply(db, args) as T;
};

const classDefs = (classes: ClassMap): Styled[] =>
  [...classes].map(([id, c]) => ({ kind: "classDef", selector: id, inherited: [], own: strings(c.styles) }));

// How one diagram family's style statements reach its DB, and how its styled
// things are read back.
interface Reader {
  hooks: Hooks;
  // Statements the grammar only records, to apply after the parse, are read
  // from the tokens instead.
  fromTokens?: (tokens: Token[]) => Statement[];
  styled: (db: Db, statements: Statement[]) => Styled[];
}

// A flowchart's edges, with the default linkStyle mermaid keeps on the array.
type Edges = Array<{ style?: unknown }> & { defaultStyle?: unknown };

const flowchart: Reader = {
  hooks: {
    // mermaid splits a classDef's id list on commas, so it is read the same way.
    addClass: ([ids, styles]) => ({ kind: "classDef", ids: String(ids).split(","), styles: strings(styles) }),
    // A vertex statement passes no styles. Only a style statement does.
    addVertex: ([id, , , styles]) =>
      Array.isArray(styles) ? { kind: "style", ids: [String(id)], styles: strings(styles) } : null,
    updateLink: ([positions, styles]) => ({ kind: "linkStyle", ids: strings(positions), styles: strings(styles) }),
  },
  styled: (db) => {
    const out = classDefs(call<ClassMap>(db, "getClasses"));
    const vertices = call<Map<string, { styles?: unknown; classes?: unknown }>>(db, "getVertices");
    for (const [id, v] of vertices) {
      const own = strings(v.styles);
      if (own.length === 0) continue;
      // The renderer compiles the default and node classes, then the vertex's.
      const inherited = call<string[]>(db, "getCompiledStyles", ["default", "node", ...strings(v.classes)]);
      out.push({ kind: "style", selector: id, inherited, own });
    }
    const edges = call<Edges>(db, "getEdges");
    const fallback = strings(edges.defaultStyle);
    if (fallback.length > 0) out.push({ kind: "linkStyle", selector: "default", inherited: [], own: fallback });
    for (const [i, e] of edges.entries()) {
      const own = strings(e.style);
      if (own.length > 0) out.push({ kind: "linkStyle", selector: String(i), inherited: fallback, own });
    }
    return out;
  },
};

const er: Reader = {
  hooks: {
    addClass: ([ids, styles]) => ({ kind: "classDef", ids: strings(ids), styles: strings(styles) }),
    addCssStyles: ([ids, styles]) => ({ kind: "style", ids: strings(ids), styles: strings(styles) }),
  },
  styled: (db) => {
    const out = classDefs(call<ClassMap>(db, "getClasses"));
    const entities = call<Map<string, { cssStyles?: unknown; cssClasses?: unknown }>>(db, "getEntities");
    for (const [name, e] of entities) {
      const own = strings(e.cssStyles);
      if (own.length === 0) continue;
      // An entity's classes are one space-separated list, as the renderer reads them.
      const inherited = call<string[]>(db, "getCompiledStyles", String(e.cssClasses ?? "").split(" "));
      out.push({ kind: "style", selector: name, inherited, own });
    }
    return out;
  },
};

// A state diagram records its statements and applies them after the parse,
// so they are read from the tokens: the keyword, the ids token and the styles
// token, as the grammar's own rules read them.
const stateStatements = (tokens: Token[]): Statement[] =>
  tokens.flatMap((t, i): Statement[] => {
    const kind = keywordOf(t);
    const ids = tokens[i + 1];
    const styles = tokens[i + 2];
    const named = ids && (ids.name.endsWith("_ID") || ids.name.endsWith("_IDS"));
    if (!(kind && ids && styles && named && styles.name.endsWith("STYLEOPTS"))) return [];
    const list = ids.text
      .trim()
      .split(",")
      .map((s) => s.trim());
    return [{ kind, ids: list, styles: [styles.text.trim()], line: t.line, keywordEnd: t.endColumn }];
  });

const state: Reader = {
  hooks: {},
  fromTokens: stateStatements,
  styled: (db) => {
    const classes = call<ClassMap>(db, "getClasses");
    const out = classDefs(classes);
    const states = call<Map<string, { styles?: unknown; classes?: unknown }>>(db, "getStates");
    for (const [id, s] of states) {
      const own = strings(s.styles);
      if (own.length === 0) continue;
      const inherited = strings(s.classes).flatMap((c) => strings(classes.get(c)?.styles));
      out.push({ kind: "style", selector: id, inherited, own });
    }
    return out;
  },
};

// A classDiagram keeps its classDefs apart from its classes, and copies a
// classDef's styles into every class that carries it, so a class's styles are
// already what the renderer applies. Only a class a style statement styles is
// a style directive.
const classDiagram: Reader = {
  hooks: {
    defineClass: ([ids, styles]) => ({ kind: "classDef", ids: strings(ids), styles: strings(styles) }),
    setCssStyle: ([id, styles]) => ({ kind: "style", ids: [String(id)], styles: strings(styles) }),
  },
  styled: (db, statements) => {
    const defs = db.styleClasses;
    const out = defs instanceof Map ? classDefs(defs as ClassMap) : [];
    const styledIds = new Set(statements.filter((s) => s.kind === "style").flatMap((s) => s.ids));
    for (const [id, c] of call<ClassMap>(db, "getClasses")) {
      if (styledIds.has(id)) out.push({ kind: "style", selector: id, inherited: [], own: strings(c.styles) });
    }
    return out;
  },
};

// The reader for each mermaid diagram type.
const READERS: Readonly<Record<string, Reader>> = {
  flowchart,
  "flowchart-v2": flowchart,
  "flowchart-elk": flowchart,
  er,
  state,
  stateDiagram: state,
  class: classDiagram,
  classDiagram,
};

// A diagram as the parser read it: its DB, the tokens its lexer read, the
// style statements it made, and how a parsed line maps to the source.
export interface ParsedStyles {
  type: string;
  db: Db;
  tokens: Token[];
  statements: Statement[];
  sourceLine: (line: number, keywordEnd?: number) => number | null;
}

// The diagram parsed and traced, or null when mermaid cannot parse it. A
// diagram the parser cannot read has no colours to trust, and
// parse-diagram-unparseable reports it.
export const parseTraced = async (source: string): Promise<ParsedStyles | null> => {
  const mermaid = await getMermaidCore();
  let diagram: ParsedDiagram;
  try {
    // parse registers the diagram types before getDiagramFromText detects one.
    await mermaid.parse(source);
    diagram = (await mermaid.mermaidAPI.getDiagramFromText(source)) as unknown as ParsedDiagram;
  } catch {
    return null;
  }
  const reader = READERS[diagram.type];
  const { tokens, statements, input } = traceParse(diagram, reader?.hooks ?? {});
  return {
    type: diagram.type,
    db: diagram.db,
    tokens,
    statements: [...statements, ...(reader?.fromTokens?.(tokens) ?? [])],
    sourceLine: sourceLines(source, input),
  };
};

// A style statement in a diagram type whose styles the audit does not model.
export interface UnmodelledStyle {
  selector: string;
  line: number;
  reason: string;
}

export interface StyleReading {
  directives: StyleDirective[];
  unmodelled: UnmodelledStyle[];
}

const propertiesOf = (styles: string[]): Record<string, string> =>
  Object.fromEntries(declarations(styles).map(([key, value]) => [key, value]));

// The directive for one styled thing: its properties, the spans of the values
// its own statements wrote, and the line of its first statement.
// What directiveOf reads beside the styled thing: the parse's statements, how
// to place one in the source, the source lines, and the line to fall back to.
interface Placing {
  statements: Statement[];
  place: (s: Statement) => number | null;
  lines: string[];
  fallback: number;
}

const directiveOf = (thing: Styled, { statements, place, lines, fallback }: Placing): StyleDirective => {
  const properties = propertiesOf([...thing.inherited, ...thing.own]);
  const own = statements.filter((s) => s.kind === thing.kind && s.ids.includes(thing.selector));
  const spans: Record<string, ValueSpan> = {};
  let line: number | null = null;
  // A later statement's value replaces an earlier one's, so its span does too,
  // and a later value that cannot be placed leaves the property with none.
  for (const s of own) {
    const at = place(s);
    line ??= at;
    for (const [key] of declarations(s.styles)) delete spans[key];
    if (at !== null) Object.assign(spans, valueSpans(lines[at - 1] ?? "", at, s.styles));
  }
  // A span is kept only when it holds the value mermaid applies.
  const kept = Object.entries(spans).filter(
    ([key, span]) => lines[span.line - 1]?.slice(span.start, span.end) === properties[key],
  );
  return {
    kind: thing.kind,
    selector: thing.selector,
    properties,
    spans: Object.fromEntries(kept),
    line: line ?? fallback,
  };
};

// The style statements of a diagram type with no reader, each a failure to
// audit rather than a silent pass.
const unmodelledOf = (parsed: ParsedStyles, keywordLine: number): UnmodelledStyle[] =>
  parsed.tokens.flatMap((t): UnmodelledStyle[] => {
    const kind = keywordOf(t);
    if (!kind) return [];
    return [
      {
        selector: kind,
        line: parsed.sourceLine(t.line, t.endColumn) ?? keywordLine,
        reason: `${kind} statements in a ${parsed.type} diagram are not modelled by the contrast audit`,
      },
    ];
  });

// Every style directive in a diagram, in source order, read from the parser.
export const readStyles = async (source: string): Promise<StyleReading> => {
  const parsed = await parseTraced(source);
  if (!parsed) return { directives: [], unmodelled: [] };
  const { type, db, tokens, statements, sourceLine } = parsed;
  const keywordLine = (tokens[0] && sourceLine(tokens[0].line)) ?? 1;
  const reader = READERS[type];
  if (!reader) return { directives: [], unmodelled: unmodelledOf(parsed, keywordLine) };
  const lines = source.split("\n");
  const place = (s: Statement): number | null => (s.line > 0 ? sourceLine(s.line, s.keywordEnd) : null);
  const directives = reader
    .styled(db, statements)
    .map((thing) => directiveOf(thing, { statements, place, lines, fallback: keywordLine }))
    .sort((a, b) => a.line - b.line);
  return { directives, unmodelled: [] };
};

// The source line of a key in the diagram's YAML frontmatter, by its path from
// the document root, or null when the frontmatter does not set it. The
// frontmatter is found by mdast and read by yaml, per MJL-0023.
export const frontmatterLine = (source: string, path: string[]): number | null => {
  const tree = fromMarkdown(source, {
    extensions: [frontmatter(["yaml"])],
    mdastExtensions: [frontmatterFromMarkdown(["yaml"])],
  });
  const node = tree.children[0];
  if (node?.type !== "yaml" || !node.position) return null;
  const counter = new LineCounter();
  let current: unknown = parseDocument(node.value, { lineCounter: counter }).contents;
  let offset: number | undefined;
  for (const key of path) {
    if (!isMap(current)) return null;
    const pair = current.items.find((p) => isScalar(p.key) && String(p.key.value) === key);
    if (!(pair && isScalar(pair.key))) return null;
    offset = pair.key.range?.[0];
    current = pair.value;
  }
  return offset === undefined ? null : node.position.start.line + counter.linePos(offset).line;
};
