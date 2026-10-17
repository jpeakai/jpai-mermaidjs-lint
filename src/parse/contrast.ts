// Contrast scoring of a diagram's style directives, by the context the diagram
// is read in. Two kinds of pair are scored: text (fill x color, at least 4.5)
// and border (fill x stroke, at least 3, the UI-component rule). Under github a
// flowchart pair is scored only when both sides are declared, because an unset
// property falls back to a theme default that cannot be resolved without
// rendering. mkdocs-material scores the host text colour instead, and
// erDiagram substitutes known theme text when no color is set. A linkStyle
// color: is edge label text, scored on Mermaid's own label box under github.
//
// Profiles, by who controls the label text:
//   github           the author does, so the declared pairs are scored as written,
//                    and anything page-backed is scored on GitHub's canvas or
//                    on the canvas the caller sets for its own host
//   mkdocs-material  the host theme forces the text and ignores color:, so each
//                    fill is composited over both theme backgrounds and the
//                    host text is scored in light and dark

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { alphaOf, type ContrastAssessment, compositeOver, type StyleDirective, wcagAssess } from "./color.ts";
import { getMermaidCore, type MermaidCore } from "./stats.ts";

export type Profile = "github" | "mkdocs-material";
export type Theme = "light" | "dark";
export type PairKind = "text" | "border";
export type ErRow = "odd" | "even";

export const PROFILES = ["auto", "github", "mkdocs-material"] as const;

// Material for MkDocs stock-theme anchors, read off its --md-* variables.
const MKDOCS_MATERIAL = {
  light: { bg: "#ffffff", text: "#36464e" },
  dark: { bg: "#1e2129", text: "hsl(225 18% 86% / 0.82)" },
} as const;

// The page canvas in each theme: the colour behind everything the diagram does
// not box. A translucent fill composites against it, and page-backed text, such
// as an edge label's box or a sequence message, is scored on it.
export type Canvas = Readonly<Record<Theme, string>>;

// A canvas as a caller sets it: either side, or both. A side left out keeps
// GitHub's.
export type CanvasSetting = Readonly<Partial<Record<Theme, string>>>;

// GitHub's page canvas, the default under the github profile. The dark value is
// measured from a rendered diagram: the Mermaid container paints no surface of
// its own, so the canvas is the true backdrop. A host that draws its own page,
// such as a documentation viewer with its own theme, sets its own canvas.
export const GITHUB_CANVAS: Canvas = { light: "#ffffff", dark: "#0d1117" };

export const THEMES: readonly Theme[] = ["light", "dark"];

// Why a canvas colour cannot be used, or null when it can. A canvas is a page,
// so it must be an opaque colour: nothing shows through it to composite onto.
export const canvasColourProblem = (value: unknown): string | null => {
  if (typeof value !== "string") return "is not a colour string";
  let alpha: number;
  try {
    alpha = alphaOf(value);
  } catch {
    return "is not a CSS colour";
  }
  return alpha < 1 ? "is translucent, and a page canvas must be opaque" : null;
};

// The canvas a setting resolves to, with GitHub's for any side it leaves out.
export const resolveCanvas = (setting: CanvasSetting | undefined): Canvas => ({ ...GITHUB_CANVAS, ...setting });

// The box an edge label is drawn on, read off Mermaid 11's theme sources. A
// linkStyle color: becomes an inline `color: ... !important` on the label's
// div and span, and the text sits in a <p> inside them. Three layers paint the
// box behind it: the div (.labelBkg, edgeLabelBackground faded to alpha 0.5),
// the span and the p (both .edgeLabel, edgeLabelBackground as is). The theme's
// edgeLabelBackground is rgba(232,232,232,0.8) in default (labelBackground)
// and lighten(#181818, 25) = #585858 in dark, opaque. GitHub draws the default
// theme in light mode and the dark theme in dark mode, the same assumption the
// erDiagram rows make, so the stack is composited over the matching canvas:
// #e8e8e8 in light and #585858 in dark on GitHub's. No one colour clears 4.5:1 on both, so
// a fixed edge label colour always fails one theme. Under mkdocs-material the
// host sets `.edgeLabel p { color: var(--md-mermaid-edge-color) }` on the p
// itself, which beats the colour the p would inherit, so color: is ignored
// there and nothing new is scored.
const MERMAID_EDGE_LABEL = {
  light: { box: "rgba(232,232,232,0.8)", backing: "rgba(232,232,232,0.5)" },
  dark: { box: "#585858", backing: "rgba(88,88,88,0.5)" },
} as const;

export const edgeLabelBackground = (theme: Theme, canvas: Canvas = GITHUB_CANVAS): string => {
  const { box, backing } = MERMAID_EDGE_LABEL[theme];
  return compositeOver(box, compositeOver(box, compositeOver(backing, canvas[theme])));
};

// Mermaid's own erDiagram row surfaces under its default and dark themes. A
// fill lands on the even attribute rows only, and a declared color lands on all
// rows, so it has to read on the fill and on a theme surface that flips with
// the reader.
const MERMAID_ER = {
  light: { odd: "#ffffff", even: "#f1f1ff", label: "#333333" },
  dark: { odd: "#2c2d2d", even: "#060606", label: "#cccccc" },
} as const;

const AA_NORMAL = 4.5;
const AA_NON_TEXT = 3.0;

// What a pair was scored from: a style directive, or, in a sequence diagram,
// a theme variable, which has no directive and no value span to rewrite.
export type ContrastSource = StyleDirective | (Omit<StyleDirective, "kind"> & { kind: "themeVariables" });

export interface ContrastPair {
  kind: PairKind;
  selector: string;
  directive: ContrastSource;
  foreground: string;
  background: string;
  line: number; // line within the diagram text
  assessment: ContrastAssessment;
  passes: boolean;
  theme?: Theme;
  row?: ErRow;
  // Set on border pairs under mkdocs-material and erDiagram. The pair is still
  // scored but never gates: a border on a faint fill
  // cannot clear 3:1 in both themes for a saturated hue. There is no warning
  // level, so an advisory pair is not a finding.
  advisory?: boolean;
}

export interface SkippedDirective {
  selector: string;
  line: number;
  reason: string;
  // A directive the profile requires to be scoreable but is not: a github fill
  // with no color, or a colour that will not parse. It is a failure to audit.
  blocking?: boolean;
}

export interface ContrastResult {
  pairs: ContrastPair[];
  skipped: SkippedDirective[];
}

const scorePair = (kind: PairKind, d: ContrastSource, fg: string, bg: string): ContrastPair => {
  const assessment = wcagAssess(fg, bg);
  return {
    kind,
    selector: d.selector,
    directive: d,
    foreground: fg,
    background: bg,
    line: d.line,
    assessment,
    passes: assessment.ratio >= (kind === "text" ? AA_NORMAL : AA_NON_TEXT),
  };
};

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// Records a directive that was not scored, and why.
const skip = (out: ContrastResult, d: ContrastSource, reason: string, blocking?: boolean): void => {
  out.skipped.push({ selector: d.selector, line: d.line, reason, ...(blocking && { blocking }) });
};

// A foreground colour and the background it is drawn on.
interface Colours {
  fg: string;
  bg: string;
}

// A linkStyle color: is edge label text, scored on the label box in both themes.
// A linkStyle without one styles only the line, which has no label pair.
const scoreEdgeLabel = (d: StyleDirective, canvas: Canvas, out: ContrastResult): void => {
  const { color } = d.properties;
  if (!color) return;
  try {
    out.pairs.push(
      ...THEMES.map((t) => scoreHostPair("text", d, t, { fg: color, bg: edgeLabelBackground(t, canvas) })),
    );
  } catch (err) {
    skip(out, d, `edge label text unparseable: ${message(err)}`, true);
  }
};

// The boxes a github fill is drawn as. A translucent fill is scored on both
// canvases and the worse result gates. An opaque fill resolves the same on both
// and keeps one pair.
const githubBoxes = (fill: string, alpha: number, canvas: Canvas): Array<[string, Theme | undefined]> =>
  alpha < 1 ? THEMES.map((t): [string, Theme] => [compositeOver(fill, canvas[t]), t]) : [[fill, undefined]];

// Scores one pair on one github box, or records the colour that will not parse.
const scoreGithubPair = (
  out: ContrastResult,
  d: StyleDirective,
  kind: PairKind,
  { fg, bg, theme }: Colours & { theme: Theme | undefined },
): void => {
  try {
    out.pairs.push({ ...scorePair(kind, d, fg, bg), ...(theme && { theme }) });
  } catch (err) {
    skip(out, d, `${kind} pair unparseable: ${message(err)}`, true);
  }
};

// The alpha of a fill, or null after recording that it will not parse.
const fillAlpha = (out: ContrastResult, d: StyleDirective, fill: string): number | null => {
  try {
    return alphaOf(fill);
  } catch (err) {
    skip(out, d, `fill unparseable: ${message(err)}`, true);
    return null;
  }
};

// A classDef or style under github: its text and border pairs on every box.
const scoreGithubStyle = (d: StyleDirective, canvas: Canvas, out: ContrastResult): void => {
  const { fill, color, stroke } = d.properties;
  if (!fill) {
    const reason =
      color || stroke ? "no fill declared, so text and border contrast have no anchor" : "no color properties";
    skip(out, d, reason);
    return;
  }
  const alpha = fillAlpha(out, d, fill);
  if (alpha === null) return;
  // A fully transparent fill declares "no box": nothing to anchor contrast to,
  // and the renderer's own theme text already tracks light and dark.
  if (alpha === 0) {
    skip(out, d, "fill is fully transparent, so there is no box to anchor contrast");
    return;
  }
  const boxes = githubBoxes(fill, alpha, canvas);
  if (!color) {
    skip(
      out,
      d,
      "no color: declared beside fill:, and the github profile requires one " +
        "(if the host forces label text, use the mkdocs-material profile)",
      true,
    );
  }
  for (const [bg, theme] of boxes) {
    if (color) scoreGithubPair(out, d, "text", { fg: color, bg, theme });
    if (stroke) scoreGithubPair(out, d, "border", { fg: stroke, bg, theme });
  }
};

export const scoreGithub = (directives: StyleDirective[], canvas: Canvas = GITHUB_CANVAS): ContrastResult => {
  const out: ContrastResult = { pairs: [], skipped: [] };
  for (const d of directives) {
    if (d.kind === "linkStyle") scoreEdgeLabel(d, canvas, out);
    if (d.kind === "classDef" || d.kind === "style") scoreGithubStyle(d, canvas, out);
  }
  return out;
};

const scoreHostPair = (
  kind: PairKind,
  d: ContrastSource,
  theme: Theme,
  { fg: fgRaw, bg: box }: Colours,
): ContrastPair => {
  // The foreground may itself be translucent, so it composites onto the box.
  const fg = compositeOver(fgRaw, box);
  const assessment = wcagAssess(fg, box);
  return {
    kind,
    selector: d.selector,
    directive: d,
    foreground: fg,
    background: box,
    line: d.line,
    assessment,
    passes: assessment.ratio >= (kind === "text" ? AA_NORMAL : AA_NON_TEXT),
    theme,
    advisory: kind === "border",
  };
};

// A classDef or style under mkdocs-material: the host text on the fill, and
// the border, in each theme.
const scoreMkdocsStyle = (d: StyleDirective, out: ContrastResult): void => {
  const { fill, stroke, color } = d.properties;
  if (!fill) {
    skip(out, d, "no fill declared, and the host theme controls the text");
    return;
  }
  if (color) skip(out, d, "color: ignored, because the host theme forces label text");
  for (const theme of THEMES) {
    let box: string;
    try {
      box = compositeOver(fill, MKDOCS_MATERIAL[theme].bg);
    } catch (err) {
      skip(out, d, `fill unparseable: ${message(err)}`, true);
      break;
    }
    out.pairs.push(scoreHostPair("text", d, theme, { fg: MKDOCS_MATERIAL[theme].text, bg: box }));
    if (stroke) {
      try {
        out.pairs.push(scoreHostPair("border", d, theme, { fg: stroke, bg: box }));
      } catch (err) {
        skip(out, d, `border pair unparseable: ${message(err)}`, true);
      }
    }
  }
};

export const scoreMkdocs = (directives: StyleDirective[]): ContrastResult => {
  const out: ContrastResult = { pairs: [], skipped: [] };
  for (const d of directives) {
    if (d.kind === "linkStyle" && d.properties.color) {
      skip(out, d, "color: ignored, because the host theme forces edge label text");
    }
    if (d.kind === "classDef" || d.kind === "style") scoreMkdocsStyle(d, out);
  }
  return out;
};

// An erDiagram under the github profile. The flowchart model, where the
// declared fill backs every label, does not hold: the fill paints even rows only
// and the odd rows keep a theme surface that flips with the reader. So every
// label is scored against both rows in both Mermaid themes. A missing color is
// not a blocking gap here, because dropping it for a translucent fill is the
// recipe that reads in both themes.
// The two erDiagram rows in one theme, each with the surface its labels sit on.
const erRows = (theme: Theme, fill: string | undefined): Array<[ErRow, string]> => {
  const anchor = MERMAID_ER[theme];
  return [
    ["odd", anchor.odd],
    ["even", fill ? compositeOver(fill, anchor.even) : anchor.even],
  ];
};

// Every pair one erDiagram directive draws, on both rows in both themes. It
// throws on a colour that will not parse, so the directive scores all or none.
const erPairs = (d: StyleDirective): ContrastPair[] => {
  const { fill, color, stroke } = d.properties;
  const scored: ContrastPair[] = [];
  const score = (kind: PairKind, theme: Theme, row: ErRow, colours: Colours): void => {
    scored.push({ ...scoreHostPair(kind, d, theme, colours), row, advisory: kind === "border" });
  };
  for (const theme of THEMES) {
    for (const [row, bg] of erRows(theme, fill)) {
      if (color || (row === "even" && fill)) score("text", theme, row, { fg: color ?? MERMAID_ER[theme].label, bg });
      if (stroke) score("border", theme, row, { fg: stroke, bg });
    }
  }
  return scored;
};

export const scoreEr = (directives: StyleDirective[]): ContrastResult => {
  const out: ContrastResult = { pairs: [], skipped: [] };
  for (const d of directives) {
    if (d.kind !== "classDef" && d.kind !== "style") continue;
    const { fill, color, stroke } = d.properties;
    if (!(fill || color || stroke)) {
      skip(out, d, "no color properties");
      continue;
    }
    try {
      out.pairs.push(...erPairs(d));
    } catch (err) {
      skip(out, d, `erDiagram pair unparseable: ${message(err)}`, true);
    }
  }
  return out;
};

// The canvas applies under github only. Material draws its own page, so the
// rules refuse a canvas under mkdocs-material before scoring (see shared.ts).
// An erDiagram's rows are Mermaid's own opaque surfaces, so no canvas shows.
export const scoreForProfile = (
  directives: StyleDirective[],
  profile: Profile,
  keyword: string | null,
  canvas: Canvas = GITHUB_CANVAS,
): ContrastResult => {
  if (profile === "mkdocs-material") return scoreMkdocs(directives);
  return keyword === "erDiagram" ? scoreEr(directives) : scoreGithub(directives, canvas);
};

// ─── Sequence diagrams ───────────────────────────────────────────────────────
//
// A sequence diagram has no style directives. Its colours are theme variables:
// some set in YAML frontmatter or an %%{init}%% directive, the rest derived by
// Mermaid's own theme calculation. So the config is read with mermaid.parse,
// which merges both the way the renderer does, and every variable is resolved
// by Mermaid's theme engine, never by a copy of its palettes. The features a
// diagram uses (human actors, notes, loops, activations, numbering, rect
// backgrounds) are read from the parsed sequence DB. The variables changed
// between Mermaid releases, so package.json pins the exact version.
//
// The SVG is transparent: message text, arrows, lifelines and loop text sit on
// the host page, and themeVariables.background paints nothing behind them.
//
// github: the default theme in light and the dark theme in dark, as GitHub
// draws them, unless the config pins a theme, which then applies to both.
//
// mkdocs-material: Material renders with Mermaid's default theme in both of its
// schemes and appends its own themeCSS, which wins over Mermaid's styles. That
// CSS sets every sequence label, box, actor, message line, note, loop frame,
// rect and number from its own --md-mermaid-* variables, so no text pair is
// the author's. Three surfaces escape it and keep the diagram's variables, as
// measured in a browser on Material 9.7 with Mermaid 11.17: lifelines
// (.actor-line beats Material's bare `line`), arrowheads (Material targets
// #arrowhead, but Mermaid 11 names it <id>-arrowhead) and activation bars.
// Each is a border, so under this profile, as for every other diagram, it is
// scored but advisory.

// The themes Mermaid resolves without per-actor colour arrays or a look of its own.
const SEQUENCE_THEMES = ["base", "default", "dark", "forest", "neutral"];

// The sequence DB's message types, from Mermaid's LINETYPE table.
const LINE = { NOTE: 2, ACTIVE_START: 17, RECT_START: 22, AUTONUMBER: 26 } as const;
// loop, alt, opt, par, critical, break and par over each open a frame.
const FRAME_STARTS = new Set([10, 12, 15, 19, 27, 30, 32]);

interface SequenceDb {
  getActors: () => Map<string, { type: string }>;
  getMessages: () => Array<{ type: number; message: unknown }>;
}

// What a sequence diagram draws that brings its own colour pairs.
export interface SequenceFeatures {
  humanActor: boolean;
  note: boolean;
  frame: boolean;
  activation: boolean;
  numbered: boolean;
  rects: string[];
}

export const sequenceFeatures = (db: SequenceDb): SequenceFeatures => {
  const messages = db.getMessages();
  const has = (type: number): boolean => messages.some((m) => m.type === type);
  return {
    humanActor: [...db.getActors().values()].some((a) => a.type === "actor"),
    note: has(LINE.NOTE),
    frame: messages.some((m) => FRAME_STARTS.has(m.type)),
    activation: has(LINE.ACTIVE_START),
    numbered: messages.some(
      (m) => m.type === LINE.AUTONUMBER && (m.message as { visible?: boolean } | null)?.visible !== false,
    ),
    rects: messages.filter((m) => m.type === LINE.RECT_START).map((m) => String(m.message)),
  };
};

type Variables = Record<string, unknown>;

// Mermaid's theme variables for a config in each theme, as its own engine
// resolves them. The site config is restored inside the same synchronous
// block, so a parse elsewhere never sees it changed. The site config is read
// rather than getConfig(), which mixes in the last parsed diagram's directives.
const resolveVariables = (
  mermaid: MermaidCore,
  config: Variables,
  themes: Record<Theme, string>,
): Record<Theme, Variables> => {
  const prior = mermaid.mermaidAPI.getSiteConfig();
  try {
    const out = {} as Record<Theme, Variables>;
    for (const t of THEMES) {
      mermaid.initialize({ ...structuredClone(config), theme: themes[t] });
      out[t] = { ...(mermaid.mermaidAPI.getSiteConfig().themeVariables as Variables) };
    }
    return out;
  } finally {
    mermaid.initialize(prior);
  }
};

const themeVariable = (selector: string, line: number): ContrastSource => ({
  kind: "themeVariables",
  selector,
  properties: {},
  spans: {},
  line,
});

// Where a sequence variable is set in the source. lineOf gives the line that
// sets a variable, or the keyword line when it is inherited, and rectLines the
// line of each rect in order.
const sequenceLines = (source: string): { lineOf: (key: string) => number; rectLines: number[] } => {
  const lines = source.split("\n");
  const keywordLine = lines.findIndex((l) => /^\s*sequenceDiagram\b/.test(l)) + 1;
  const lineOf = (key: string): number => {
    const found = lines.findLastIndex((l) => new RegExp(`\\b${key}["']?\\s*:`).test(l));
    return found < 0 ? keywordLine : found + 1;
  };
  return { lineOf, rectLines: lines.flatMap((l, i) => (/^\s*rect\s/.test(l) ? [i + 1] : [])) };
};

// The merged config and sequence DB, or null when the parser cannot read the
// diagram. parse-diagram-unparseable reports it. As for complexity, a diagram
// the parser cannot read has no colours to trust.
const parseSequence = async (
  mermaid: MermaidCore,
  source: string,
): Promise<{ config: Variables; db: SequenceDb } | null> => {
  try {
    const { config } = await mermaid.parse(source);
    const { db } = await mermaid.mermaidAPI.getDiagramFromText(source);
    return { config, db: db as SequenceDb };
  } catch {
    return null;
  }
};

// Why a sequence config cannot be modelled, as the key to blame and the
// reason, or null when it can. Under mkdocs-material a diagram's themeCSS
// replaces Material's own, so neither profile can say what it draws.
const unmodelled = (config: Variables): { selector: string; reason: string } | null => {
  if (config.themeCSS !== undefined) {
    return { selector: "themeCSS", reason: "themeCSS restyles the diagram with CSS the audit cannot model" };
  }
  const pinned = config.theme;
  if (pinned !== undefined && !SEQUENCE_THEMES.includes(String(pinned))) {
    return {
      selector: "theme",
      reason: `the ${String(pinned)} theme is not modelled, only ${SEQUENCE_THEMES.join(", ")}`,
    };
  }
  return null;
};

// The Mermaid theme drawn in each reader theme: a pinned theme in both, or
// else what the host draws.
const sequenceThemes = (pinned: unknown, host: boolean): Record<Theme, string> => {
  const theme = (fallback: string): string => (pinned === undefined ? fallback : String(pinned));
  return { light: theme("default"), dark: theme(host ? "default" : "dark") };
};

// What one reader theme's sequence pairs are scored with.
interface SequenceTheme {
  theme: Theme;
  page: string;
  vars: Variables;
  host: boolean;
  lineOf: (key: string) => number;
  out: ContrastResult;
}

type SequenceBackground = { key: string } | { colour: string };

// Scores fgKey drawn on a background: a variable, or a colour such as the page.
type SequencePair = (
  kind: PairKind,
  fgKey: string,
  bg: SequenceBackground,
  where?: { suffix?: string; at?: number | undefined },
) => void;

const sequencePair =
  ({ theme: t, page, vars, host, lineOf, out }: SequenceTheme): SequencePair =>
  (kind, fgKey, bg, { suffix = "", at } = {}) => {
    const color = (key: string): string => {
      const value = vars[key];
      if (typeof value !== "string") throw new Error(`${key} is not a resolved colour`);
      return value;
    };
    const selector = fgKey + suffix;
    const line = at ?? lineOf(fgKey);
    try {
      const box = compositeOver("key" in bg ? color(bg.key) : bg.colour, page);
      out.pairs.push({
        ...scoreHostPair(kind, themeVariable(selector, line), t, { fg: color(fgKey), bg: box }),
        advisory: host,
      });
    } catch (err) {
      out.skipped.push({ selector, line, reason: `${t} sequence pair unparseable: ${message(err)}`, blocking: true });
    }
  };

// The surfaces that escape Material's themeCSS: lifelines, arrowheads and
// activation bars.
const scoreHostSequence = (pair: SequencePair, page: string, features: SequenceFeatures): void => {
  const onPage = { colour: page };
  pair("border", "actorLineColor", onPage);
  pair("border", "signalColor", onPage, { suffix: " (arrowhead)" });
  if (features.activation) pair("border", "activationBorderColor", { key: "activationBkgColor" });
};

// Every pair a sequence diagram draws when the author controls its colours.
const scoreAuthorSequence = (
  pair: SequencePair,
  page: string,
  features: SequenceFeatures,
  rectLines: number[],
): void => {
  const onPage = { colour: page };
  pair("text", "actorTextColor", { key: "actorBkg" });
  pair("border", "actorBorder", { key: "actorBkg" });
  // A human actor's name and stick figure sit outside the box fill.
  if (features.humanActor) {
    pair("text", "actorTextColor", onPage, { suffix: " (human actor label)" });
    pair("border", "actorBorder", onPage, { suffix: " (human actor glyph)" });
  }
  pair("border", "actorLineColor", onPage);
  pair("text", "signalTextColor", onPage);
  pair("border", "signalColor", onPage);
  if (features.note) pair("text", "noteTextColor", { key: "noteBkgColor" });
  if (features.frame) {
    pair("text", "labelTextColor", { key: "labelBoxBkgColor" });
    pair("text", "loopTextColor", onPage);
    pair("border", "labelBoxBorderColor", onPage, { suffix: " (loop frame)" });
  }
  if (features.activation) pair("border", "activationBorderColor", { key: "activationBkgColor" });
  if (features.numbered) pair("text", "sequenceNumberColor", { key: "signalColor" });
  // Messages and frame text inside a rect sit on its colour, not the page.
  for (const [i, rect] of features.rects.entries()) {
    const fill = { colour: rect };
    const where = { suffix: " (rect)", at: rectLines[i] };
    pair("text", "signalTextColor", fill, where);
    pair("border", "signalColor", fill, where);
    if (features.frame) pair("text", "loopTextColor", fill, where);
  }
};

export const scoreSequence = async (
  source: string,
  profile: Profile,
  canvas: Canvas = GITHUB_CANVAS,
): Promise<ContrastResult> => {
  const out: ContrastResult = { pairs: [], skipped: [] };
  const { lineOf, rectLines } = sequenceLines(source);
  const mermaid = await getMermaidCore();
  const parsed = await parseSequence(mermaid, source);
  if (!parsed) return out;
  const { config, db } = parsed;

  const block = (selector: string, reason: string): ContrastResult => {
    out.skipped.push({ selector, line: lineOf(selector), reason, blocking: true });
    return out;
  };
  const problem = unmodelled(config);
  if (problem) return block(problem.selector, problem.reason);

  const features = sequenceFeatures(db);
  const host = profile === "mkdocs-material";
  let variables: Record<Theme, Variables>;
  try {
    variables = resolveVariables(mermaid, config, sequenceThemes(config.theme, host));
  } catch (err) {
    // A colour the theme derives others from, such as actorBorder, fails here.
    return block("themeVariables", `Mermaid could not resolve the theme: ${message(err)}`);
  }

  for (const t of THEMES) {
    const page = host ? MKDOCS_MATERIAL[t].bg : canvas[t];
    const pair = sequencePair({ theme: t, page, vars: variables[t], host, lineOf, out });
    if (host) scoreHostSequence(pair, page, features);
    else scoreAuthorSequence(pair, page, features, rectLines);
  }
  return out;
};

// What scoreDiagram reads off a diagram.
export interface ScoredDiagram {
  source: string;
  directives: StyleDirective[];
  keyword: string | null;
}

// Scores a diagram by its keyword: a sequence diagram by its theme variables,
// any other by its style directives.
export const scoreDiagram = (
  { source, directives, keyword }: ScoredDiagram,
  profile: Profile,
  canvas: Canvas = GITHUB_CANVAS,
): Promise<ContrastResult> =>
  keyword === "sequenceDiagram"
    ? scoreSequence(source, profile, canvas)
    : Promise.resolve(scoreForProfile(directives, profile, keyword, canvas));

// An ancestor mkdocs.yml or mkdocs.yaml, searched up to 20 levels, means the
// diagram is read through Material.
export const detectProfile = (filePath: string): Profile => {
  let dir = dirname(resolve(filePath));
  for (let i = 0; i < 20; i++) {
    if (existsSync(join(dir, "mkdocs.yml")) || existsSync(join(dir, "mkdocs.yaml"))) return "mkdocs-material";
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "github";
};
