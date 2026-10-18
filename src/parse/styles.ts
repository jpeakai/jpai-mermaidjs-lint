// Style directives, read from mermaid's parser result, per MJL-0022.
//
// What a diagram declares about its colours comes from the parsed DB: the
// classDefs, the styles a style statement puts on a node, entity, state or
// class, the classes each one carries, and the styles a linkStyle puts on an
// edge. Where each statement sits comes from the parser too: the diagram is
// parsed again with its own lexer traced and its DB's style methods wrapped,
// so each statement is placed by the location of the keyword token the lexer
// read, and each value by the tokens the lexer read for it. Nothing here scans
// the diagram text for structure.
//
// Mermaid parses a preprocessed copy of the diagram: frontmatter, directives,
// comments and leading blank lines are dropped, and some lines are edited in
// place (entity codes, a style statement's trailing semicolon). Mermaid keeps
// no map from that copy back to the source, a gap MJL-0027 records, so a line
// of the copy is placed back in the source by sourceLines, which refuses
// whenever the line could be more than one source line. A value whose text the
// copy changed has no span, so a fixer refuses to rewrite it (MJL-0005).

import Color from "colorjs.io";
import type { Yaml } from "mdast";
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
// declarations it wrote, and the index of its keyword token in the tokens the
// lexer read, or -1 when no token is its keyword.
interface Statement {
  kind: DirectiveKind;
  ids: string[];
  styles: string[];
  keyword: number;
}

// What a DB call says about its statement. lexed, when set, is the text of
// the tokens after the keyword as the grammar passed them to the DB, which
// pairs a call the DB makes after the parse with its keyword token.
type Read = Omit<Statement, "keyword"> & { lexed?: string[] };

// A DB method a style statement calls, and what the statement was, read off
// the call's arguments or the DB after the call. apply runs the DB's own
// method, once; the wrapper runs it after the hook when the hook does not.
type Hook = (args: unknown[], db: Db, apply: () => void) => Read | null;
type Hooks = Readonly<Record<string, Hook>>;

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

// The keyword token of the statement a DB call is reducing. The parser has
// lexed the whole statement, and at most one lookahead token past it, which
// may be the next statement's keyword, so that last token is never the one.
const keywordAt = (tokens: Token[], kind: DirectiveKind): number =>
  tokens.findLastIndex((t, i) => i < tokens.length - 1 && keywordOf(t) === kind);

// The keyword token of a statement the DB applies after the whole parse, as a
// stateDiagram does: the first keyword of its kind not yet paired whose
// following tokens hold the text the grammar passed to the DB.
const pairedKeyword = (tokens: Token[], kind: DirectiveKind, lexed: string[], used: Set<number>): number =>
  tokens.findIndex(
    (t, k) =>
      !used.has(k) && keywordOf(t) === kind && lexed.every((text, n) => tokens[k + 1 + n]?.text.trim() === text),
  );

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

// Wraps each DB method a style statement calls, so every call records its
// statement and the keyword token it was lexed from.
const wrapHooks = (
  wrap: ReturnType<typeof wrapper>,
  db: Db,
  hooks: Hooks,
  { tokens, statements }: Omit<Traced, "input">,
): void => {
  const paired = new Set<number>();
  for (const [name, hook] of Object.entries(hooks)) {
    wrap(db, name, (original) => (...args: unknown[]) => {
      let result: unknown;
      let applied = false;
      const apply = (): void => {
        if (applied) return;
        applied = true;
        result = original.apply(db, args);
      };
      const read = hook(args, db, apply);
      apply();
      if (read) {
        const { lexed, ...statement } = read;
        const keyword = lexed ? pairedKeyword(tokens, read.kind, lexed, paired) : keywordAt(tokens, read.kind);
        paired.add(keyword);
        statements.push({ ...statement, keyword });
      }
      return result;
    });
  }
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
  wrapHooks(wrap, db, hooks, { tokens, statements });
  try {
    (db.clear as Method | undefined)?.call(db);
    if (diagram.parser.parser) diagram.parser.parser.yy = db;
    diagram.parser.parse(diagram.text);
  } finally {
    for (const undo of restore.reverse()) undo();
  }
  return { tokens, statements, input };
};

// The diagram's YAML frontmatter as mdast reads it, or null when it has none.
// micromark finds the block, per MJL-0023.
const frontmatterOf = (source: string): Yaml | null => {
  const tree = fromMarkdown(source, {
    extensions: [frontmatter(["yaml"])],
    mdastExtensions: [frontmatterFromMarkdown(["yaml"])],
  });
  const node = tree.children[0];
  return node?.type === "yaml" && node.position ? node : null;
};

// The 0-based index of the first source line past the frontmatter, where the
// diagram body starts. Mermaid drops the frontmatter before it parses, so no
// parsed line comes from above it.
const bodyStart = (source: string): number => frontmatterOf(source)?.position?.end.line ?? 0;

// The length of the text two strings start with.
const commonPrefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
};

// The anchors of sourceLines: each parsed line matched to the one body line it
// can come from. Mermaid drops lines but never adds or reorders them, so a
// parsed line comes from a source line of the same text at or after its
// earliest place, matching every line in order from the top, and at or before
// its latest, matching from the bottom. It anchors only when those are the
// same line. A blank line never anchors.
const anchorsOf = (src: string[], txt: string[], body: number): Array<number | undefined> => {
  const early: Array<number | undefined> = [];
  let cursor = body;
  for (const [i, line] of txt.entries()) {
    if (!line.trim()) continue;
    const j = src.indexOf(line, cursor);
    if (j >= 0) {
      early[i] = j;
      cursor = j + 1;
    }
  }
  const late: Array<number | undefined> = [];
  cursor = src.length - 1;
  for (let i = txt.length - 1; i >= 0 && cursor >= body; i--) {
    const line = txt[i] ?? "";
    if (!line.trim()) continue;
    const j = src.lastIndexOf(line, cursor);
    if (j >= body) {
      late[i] = j;
      cursor = j - 1;
    }
  }
  return txt.map((_, i) => (early[i] !== undefined && early[i] === late[i] ? early[i] : undefined));
};

// Places a line of the text mermaid parsed in the diagram source, as a
// 1-based source line, or null when it cannot be placed exactly. A line is
// anchored when exactly one body line can be it (anchorsOf). A line mermaid
// edited, or one two lines could be, lies between two anchored lines: it is
// placed by position when as many lines lie between them in the source, which
// means none were dropped, or else by the one source line there that shares
// at least the text up to the end of the statement's keyword with it. When two
// source lines share that much, it is not placed.
export const sourceLines = (source: string, parsed: string): ((line: number, keywordEnd?: number) => number | null) => {
  const src = source.split("\n").map((l) => l.trimStart());
  const raw = parsed.split("\n");
  const txt = raw.map((l) => l.trimStart());
  const body = bodyStart(source);
  const anchor = anchorsOf(src, txt, body);
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
    const from = anchor[a] ?? body - 1;
    const to = anchor[b];
    if (to !== undefined && to - from === b - a) return from + (i - a) + 1;
    const least = keywordEnd - ((raw[i]?.length ?? 0) - text.length);
    return least > 0 ? onlyBetween(src, [from, to ?? src.length], text, least) : null;
  };
};

// The one source line strictly between from and to that shares at least
// `least` characters of text with a parsed line, as a 1-based line, or null
// when no line or more than one does.
const onlyBetween = (src: string[], [from, to]: [number, number], text: string, least: number): number | null => {
  const found = src
    .slice(from + 1, to)
    .map((s, k) => ({ at: from + 1 + k, shared: commonPrefix(s, text) }))
    .filter((c) => c.shared >= least);
  return found.length === 1 && found[0] ? found[0].at + 1 : null;
};

const indentOf = (line: string): number => line.length - line.trimStart().length;

// A value's columns in a parsed line moved onto the source line it was placed
// on, or null when the source line does not hold the same text up to the end
// of the value, because mermaid edited it there. Only the indentation may
// differ, since mermaid trims the start of the text it parses.
const toSource = (parsedLine: string, sourceLine: string, start: number, end: number): [number, number] | null => {
  const shift = indentOf(sourceLine) - indentOf(parsedLine);
  const head = parsedLine.slice(indentOf(parsedLine), end);
  if (sourceLine.slice(indentOf(sourceLine), end + shift) !== head) return null;
  return [start + shift, end + shift];
};

// One declaration in a DB's style string: its property, in lower case, and
// its value, as mermaid's renderer reads it.
interface Declaration {
  key: string;
  value: string | undefined;
}

// The declarations in a DB's style strings, in order. This mirrors mermaid's
// internal styles2Map (src/rendering-util/rendering-elements/shapes/
// handDrawnShapeStyles.ts), which it does not export, a gap MJL-0027 records:
// a declaration is split on its colons, its key is the text before the first
// and its value the text between the first and the second, each trimmed. A
// string may hold several declarations joined by commas, as a classDiagram
// keeps them, and mermaid splits them the same way. tests/styles.test.ts pins
// the mirror to mermaid's compiled styles.
const declarations = (styles: string[]): Declaration[] =>
  styles
    .flatMap((s) => s.split(","))
    .flatMap((raw): Declaration[] => {
      if (!raw.includes(":")) return [];
      const [key = "", value] = raw.split(":");
      return [{ key: key.trim().toLowerCase(), value: value?.trim() }];
    });

// The properties a list of style strings applies, the later winning. A
// declaration with no value unsets its property.
export const propertiesOf = (styles: string[]): Record<string, string> => {
  const properties: Record<string, string> = {};
  for (const { key, value } of declarations(styles)) {
    if (!key) continue;
    if (value) properties[key] = value;
    else delete properties[key];
  }
  return properties;
};

// Where a value sits in the text mermaid parsed, as a 1-based line and 0-based
// columns.
interface ParsedValue {
  line: number;
  start: number;
  end: number;
}

// The tokens that end a statement.
const TERMINATORS = new Set(["NEWLINE", "NL", "SEMI", ";", "EOF"]);

// The tokens of a statement after its keyword, up to the token that ends it.
const statementTokens = (tokens: Token[], keyword: number): Token[] => {
  const end = tokens.findIndex((t, i) => i > keyword && TERMINATORS.has(t.name));
  return tokens.slice(keyword + 1, end === -1 ? tokens.length : end);
};

// The values of a statement whose grammar lexes each declaration into tokens,
// as a flowchart's and an erDiagram's do: the tokens between the declaration's
// first COLON and its second, or the COMMA or the end of the statement, past
// any SPACE tokens. One entry per declaration with a colon, in order, and a
// declaration with no value tokens has none.
const lexedValues = (tokens: Token[]): Array<ParsedValue | null> => {
  const segments: Token[][] = [[]];
  for (const t of tokens) {
    if (t.name === "COMMA") segments.push([]);
    else segments.at(-1)?.push(t);
  }
  return segments.flatMap((segment): Array<ParsedValue | null> => {
    const colon = segment.findIndex((t) => t.name === "COLON");
    if (colon === -1) return [];
    const next = segment.findIndex((t, i) => i > colon && t.name === "COLON");
    const value = segment.slice(colon + 1, next === -1 ? segment.length : next).filter((t) => t.name !== "SPACE");
    const first = value[0];
    const last = value.at(-1);
    return [
      first && last && first.line === last.line ? { line: first.line, start: first.column, end: last.endColumn } : null,
    ];
  });
};

// The values of a stateDiagram statement, whose grammar lexes all of its
// declarations as one STYLEOPTS token. The DB splits that token's text on its
// commas and each declaration on its colons, so the columns are counted the
// same way from the token's start. A declaration's value is what lies between
// its first colon and the next, trimmed.
const styleOptsValues = (tokens: Token[]): Array<ParsedValue | null> => {
  const opts = tokens.find((t) => t.name.endsWith("STYLEOPTS"));
  if (!opts) return [];
  let at = opts.column;
  return opts.text.split(",").flatMap((part): Array<ParsedValue | null> => {
    const from = at;
    at += part.length + 1;
    const [key = "", value] = part.split(":");
    if (value === undefined) return [];
    const start = from + key.length + 1 + indentOf(value);
    return [{ line: opts.line, start, end: start + value.trim().length }];
  });
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

// How one diagram family's style statements reach its DB, where its values
// sit, and how its styled things are read back.
interface Reader {
  hooks: Hooks;
  // The values of a statement, from the tokens after its keyword, one per
  // declaration with a colon. A grammar that lexes a statement too coarsely to
  // place a value has none, so its values are never rewritten.
  values: (tokens: Token[]) => Array<ParsedValue | null>;
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
  values: lexedValues,
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
  values: lexedValues,
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

// The statement a stateDiagram's grammar hands its DB: the ids token's text
// and the styles token's text, each trimmed.
interface StateItem {
  id?: unknown;
  styleClass?: unknown;
}

// A state diagram records its statements during the parse and applies them
// after it, through handleStyleDef for a style statement and addStyleClass
// for a classDef. What each one styles is read from the DB once it has run,
// and its keyword is the one whose tokens hold the text the grammar passed.
const state: Reader = {
  hooks: {
    handleStyleDef: ([item], db, apply) => {
      const { id, styleClass } = (item ?? {}) as StateItem;
      apply();
      const ids = String(id).trim().split(",");
      const styled = call<{ styles?: unknown } | undefined>(db, "getState", ids[0]?.trim());
      return {
        kind: "style",
        ids: ids.map((s) => s.trim()),
        styles: strings(styled?.styles),
        lexed: [String(id).trim(), String(styleClass).trim()],
      };
    },
    addStyleClass: ([id, attributes], db, apply) => {
      const classes = call<ClassMap>(db, "getClasses");
      const before = strings(classes.get(String(id))?.styles).length;
      apply();
      return {
        kind: "classDef",
        ids: [String(id)],
        styles: strings(classes.get(String(id))?.styles).slice(before),
        lexed: [String(id), String(attributes ?? "").trim()],
      };
    },
  },
  values: styleOptsValues,
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
// a style directive. Its lexer reads a statement's declarations as LABEL
// tokens that run across the commas between them, so no value is placed and a
// fixer never rewrites one.
const classDiagram: Reader = {
  hooks: {
    defineClass: ([ids, styles]) => ({ kind: "classDef", ids: strings(ids), styles: strings(styles) }),
    setCssStyle: ([id, styles]) => ({ kind: "style", ids: [String(id)], styles: strings(styles) }),
  },
  values: () => [],
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
// style statements it made, the text the lexer read, and how a line of that
// text maps to the source.
export interface ParsedStyles {
  type: string;
  db: Db;
  tokens: Token[];
  statements: Statement[];
  input: string;
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
  return { type: diagram.type, db: diagram.db, tokens, statements, input, sourceLine: sourceLines(source, input) };
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

// What directiveOf reads beside the styled thing: the parse's statements, how
// to place one in the source and where its values sit, the source lines, and
// the line to fall back to.
interface Placing {
  statements: Statement[];
  place: (s: Statement) => number | null;
  spansOf: (s: Statement) => Record<string, ValueSpan>;
  lines: string[];
  fallback: number;
}

// The directive for one styled thing: its properties, the spans of the values
// its own statements wrote, and the line of its first statement.
const directiveOf = (thing: Styled, { statements, place, spansOf, lines, fallback }: Placing): StyleDirective => {
  const properties = propertiesOf([...thing.inherited, ...thing.own]);
  const own = statements.filter((s) => s.kind === thing.kind && s.ids.includes(thing.selector));
  const spans: Record<string, ValueSpan> = {};
  let line: number | null = null;
  // A later statement's value replaces an earlier one's, so its span does too,
  // and a later value that cannot be placed leaves the property with none.
  for (const s of own) {
    line ??= place(s);
    for (const { key } of declarations(s.styles)) delete spans[key];
    Object.assign(spans, spansOf(s));
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

// Where each value a statement wrote sits in the source, by property. A value
// is placed from the tokens the lexer read for it, its line by sourceLines and
// its columns moved onto that line. It has no span when it cannot be placed,
// when the parsed text there is not the value the DB holds, or when colorjs.io
// does not read it as a colour, as a value mermaid cut at a comma inside
// rgb() is not. A later declaration of a property replaces an earlier one's
// span, or removes it when it has none.
const statementSpans = (
  parsed: ParsedStyles,
  reader: Reader,
  lines: string[],
): ((s: Statement) => Record<string, ValueSpan>) => {
  const parsedLines = parsed.input.split("\n");
  // One value of a statement whose keyword is `keyword`, placed in the source.
  const placeValue = (keyword: Token, at: ParsedValue | null, value: string): ValueSpan | null => {
    if (!at || Color.try(value) === null) return null;
    const parsedLine = parsedLines[at.line - 1] ?? "";
    if (parsedLine.slice(at.start, at.end) !== value) return null;
    const line = parsed.sourceLine(at.line, at.line === keyword.line ? keyword.endColumn : 0);
    if (line === null) return null;
    const columns = toSource(parsedLine, lines[line - 1] ?? "", at.start, at.end);
    return columns ? { line, start: columns[0], end: columns[1] } : null;
  };
  return (s) => {
    const spans: Record<string, ValueSpan> = {};
    const keyword = parsed.tokens[s.keyword];
    const decls = declarations(s.styles);
    const values = keyword ? reader.values(statementTokens(parsed.tokens, s.keyword)) : [];
    // Each value is the declaration at the same place, or none are placed.
    const aligned = values.length === decls.length;
    for (const [n, { key, value }] of decls.entries()) {
      const span = keyword && aligned && value ? placeValue(keyword, values[n] ?? null, value) : null;
      if (span) spans[key] = span;
      else delete spans[key];
    }
    return spans;
  };
};

// Every style directive in a diagram, in source order, read from the parser.
export const readStyles = async (source: string): Promise<StyleReading> => {
  const parsed = await parseTraced(source);
  if (!parsed) return { directives: [], unmodelled: [] };
  const { type, db, tokens, statements, sourceLine } = parsed;
  const keywordLine = (tokens[0] && sourceLine(tokens[0].line)) ?? 1;
  const reader = READERS[type];
  if (!reader) return { directives: [], unmodelled: unmodelledOf(parsed, keywordLine) };
  const lines = source.split("\n");
  const place = (s: Statement): number | null => {
    const keyword = tokens[s.keyword];
    return keyword ? sourceLine(keyword.line, keyword.endColumn) : null;
  };
  const spansOf = statementSpans(parsed, reader, lines);
  const directives = reader
    .styled(db, statements)
    .map((thing) => directiveOf(thing, { statements, place, spansOf, lines, fallback: keywordLine }))
    .sort((a, b) => a.line - b.line);
  return { directives, unmodelled: [] };
};

// The source line of a key in the diagram's YAML frontmatter, by its path from
// the document root, or null when the frontmatter does not set it. The
// frontmatter is found by mdast and read by yaml, per MJL-0023.
export const frontmatterLine = (source: string, path: string[]): number | null => {
  const node = frontmatterOf(source);
  if (!node?.position) return null;
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
