// Contrast scoring of a diagram's style directives, by the context the diagram
// is read in. Two kinds of pair are scored: text (fill x color, at least 4.5)
// and border (fill x stroke, at least 3, the UI-component rule). Under github a
// flowchart pair is scored only when both sides are declared, because an unset
// property falls back to a theme default that cannot be resolved without
// rendering. mkdocs-material scores the host text colour instead, and
// erDiagram substitutes known theme text when no color is set.
//
// Profiles, by who controls the label text:
//   github           the author does, so the declared pairs are scored as written
//   mkdocs-material  the host theme forces the text and ignores color:, so each
//                    fill is composited over both theme backgrounds and the
//                    host text is scored in light and dark

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { alphaOf, type ContrastAssessment, compositeOver, type StyleDirective, wcagAssess } from "./color.ts";

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

// GitHub's page canvas, which a translucent fill composites against. The dark
// value is measured from a rendered diagram: the Mermaid container paints no
// surface of its own, so the canvas is the true backdrop.
const GITHUB = { light: { bg: "#ffffff" }, dark: { bg: "#0d1117" } } as const;

const THEMES: Theme[] = ["light", "dark"];

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

export interface ContrastPair {
  kind: PairKind;
  selector: string;
  directive: StyleDirective;
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

const scorePair = (kind: PairKind, d: StyleDirective, fg: string, bg: string): ContrastPair => {
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

export const scoreGithub = (directives: StyleDirective[]): ContrastResult => {
  const pairs: ContrastPair[] = [];
  const skipped: SkippedDirective[] = [];
  for (const d of directives) {
    if (d.kind !== "classDef" && d.kind !== "style") continue;
    const { fill, color, stroke } = d.properties;
    const note = (reason: string, blocking?: boolean): void => {
      skipped.push({ selector: d.selector, line: d.line, reason, ...(blocking && { blocking }) });
    };
    if (!fill) {
      note(color || stroke ? "no fill declared, so text and border contrast have no anchor" : "no color properties");
      continue;
    }
    let alpha: number;
    try {
      alpha = alphaOf(fill);
    } catch (err) {
      note(`fill unparseable: ${message(err)}`, true);
      continue;
    }
    // A fully transparent fill declares "no box": nothing to anchor contrast to,
    // and the renderer's own theme text already tracks light and dark.
    if (alpha === 0) {
      note("fill is fully transparent, so there is no box to anchor contrast");
      continue;
    }
    // A translucent fill is scored on both GitHub canvases and the worse result
    // gates. An opaque fill resolves the same on both and keeps one pair.
    const boxes: Array<[string, Theme | undefined]> =
      alpha < 1 ? THEMES.map((t): [string, Theme] => [compositeOver(fill, GITHUB[t].bg), t]) : [[fill, undefined]];
    if (!color) {
      note(
        "no color: declared beside fill:, and the github profile requires one " +
          "(if the host forces label text, use the mkdocs-material profile)",
        true,
      );
    }
    for (const [box, theme] of boxes) {
      if (color) {
        try {
          pairs.push({ ...scorePair("text", d, color, box), ...(theme && { theme }) });
        } catch (err) {
          note(`text pair unparseable: ${message(err)}`, true);
        }
      }
      if (stroke) {
        try {
          pairs.push({ ...scorePair("border", d, stroke, box), ...(theme && { theme }) });
        } catch (err) {
          note(`border pair unparseable: ${message(err)}`, true);
        }
      }
    }
  }
  return { pairs, skipped };
};

const scoreHostPair = (kind: PairKind, d: StyleDirective, theme: Theme, fgRaw: string, box: string): ContrastPair => {
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

export const scoreMkdocs = (directives: StyleDirective[]): ContrastResult => {
  const pairs: ContrastPair[] = [];
  const skipped: SkippedDirective[] = [];
  for (const d of directives) {
    if (d.kind !== "classDef" && d.kind !== "style") continue;
    const { fill, stroke, color } = d.properties;
    const note = (reason: string): void => {
      skipped.push({ selector: d.selector, line: d.line, reason });
    };
    if (!fill) {
      note("no fill declared, and the host theme controls the text");
      continue;
    }
    if (color) note("color: ignored, because the host theme forces label text");
    for (const theme of THEMES) {
      let box: string;
      try {
        box = compositeOver(fill, MKDOCS_MATERIAL[theme].bg);
      } catch (err) {
        skipped.push({
          selector: d.selector,
          line: d.line,
          reason: `fill unparseable: ${message(err)}`,
          blocking: true,
        });
        break;
      }
      pairs.push(scoreHostPair("text", d, theme, MKDOCS_MATERIAL[theme].text, box));
      if (stroke) {
        try {
          pairs.push(scoreHostPair("border", d, theme, stroke, box));
        } catch (err) {
          skipped.push({
            selector: d.selector,
            line: d.line,
            reason: `border pair unparseable: ${message(err)}`,
            blocking: true,
          });
        }
      }
    }
  }
  return { pairs, skipped };
};

// An erDiagram under the github profile. The flowchart model, where the
// declared fill backs every label, does not hold: the fill paints even rows only
// and the odd rows keep a theme surface that flips with the reader. So every
// label is scored against both rows in both Mermaid themes. A missing color is
// not a blocking gap here, because dropping it for a translucent fill is the
// recipe that reads in both themes.
export const scoreEr = (directives: StyleDirective[]): ContrastResult => {
  const pairs: ContrastPair[] = [];
  const skipped: SkippedDirective[] = [];
  for (const d of directives) {
    if (d.kind !== "classDef" && d.kind !== "style") continue;
    const { fill, color, stroke } = d.properties;
    if (!fill && !color && !stroke) {
      skipped.push({ selector: d.selector, line: d.line, reason: "no color properties" });
      continue;
    }
    const scored: ContrastPair[] = [];
    const score = (kind: PairKind, theme: Theme, row: ErRow, fg: string, bg: string): void => {
      scored.push({ ...scoreHostPair(kind, d, theme, fg, bg), row, advisory: kind === "border" });
    };
    try {
      for (const theme of THEMES) {
        const anchor = MERMAID_ER[theme];
        const rows: Array<[ErRow, string]> = [
          ["odd", anchor.odd],
          ["even", fill ? compositeOver(fill, anchor.even) : anchor.even],
        ];
        for (const [row, bg] of rows) {
          if (color || (row === "even" && fill)) score("text", theme, row, color ?? anchor.label, bg);
          if (stroke) score("border", theme, row, stroke, bg);
        }
      }
      pairs.push(...scored);
    } catch (err) {
      skipped.push({
        selector: d.selector,
        line: d.line,
        reason: `erDiagram pair unparseable: ${message(err)}`,
        blocking: true,
      });
    }
  }
  return { pairs, skipped };
};

export const scoreForProfile = (
  directives: StyleDirective[],
  profile: Profile,
  keyword: string | null,
): ContrastResult => {
  if (profile === "mkdocs-material") return scoreMkdocs(directives);
  return keyword === "erDiagram" ? scoreEr(directives) : scoreGithub(directives);
};

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
