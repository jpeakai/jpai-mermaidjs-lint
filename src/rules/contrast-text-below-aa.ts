import type { Diagram } from "../model.ts";
import { compositeOver, wcagRatio } from "../parse/color.ts";
import type { ContrastPair, ContrastSource, Profile } from "../parse/contrast.ts";
import { CONTRAST_OPTIONS, contrastOf, fileLine, settingsOf } from "./shared.ts";
import { type Edit, type Finding, RULE, type Rule, type RuleContext } from "./types.ts";

const AA_NORMAL = 4.5;
const CANDIDATES = ["#000000", "#ffffff"] as const;

const ratioOn = (fg: string, bg: string): number => wcagRatio(compositeOver(fg, bg), bg);

// How to fix failing text, by who controls it and what the colour is.
const remediationOf = (profile: Profile, kind: ContrastSource["kind"]): string => {
  if (profile === "mkdocs-material") {
    return "The host theme forces the label text, so change the fill until the host text reads on it in both themes.";
  }
  if (kind === "themeVariables") {
    return "A sequence diagram colour is a theme variable, and text with no box of its own sits on the page, so set the variable to a colour that reads on its background in both themes, or remove it and let the theme set it.";
  }
  if (kind === "linkStyle") {
    return "An edge label sits on Mermaid's own label box, light in one theme and grey in the other, and no one colour reads on both, so drop color: from the linkStyle and let the theme set the label text.";
  }
  return "Darken or lighten the fill, or change color:, until the ratio reaches 4.5:1 in every theme.";
};

// The finding for one failing text pair.
const textFinding = (ctx: RuleContext, diagram: Diagram, p: ContrastPair, profile: Profile): Finding => {
  const where = [p.theme, p.row].filter(Boolean).join("/");
  const line = fileLine(diagram, p.line);
  return {
    file: ctx.file,
    line,
    endLine: line,
    rule: RULE.TEXT,
    message:
      `${p.directive.kind} ${p.selector}: text ${p.assessment.ratio.toFixed(2)}:1 < ${AA_NORMAL} ` +
      `(${p.foreground} on ${p.background}${where ? `, ${where}` : ""})`,
    remediation: remediationOf(profile, p.directive.kind),
  };
};

// Label text must reach 4.5:1 against its fill, in every theme the fill is
// scored in. The fix swaps a declared color: for black or white, whichever
// reads better, and only when that clears 4.5:1 on every background the
// directive is scored against. Choosing a brand colour is a design decision, so
// anything else stays reported. A linkStyle color: takes the same path, and it
// never clears on GitHub's canvas: its label box is #e8e8e8 in light and
// #585858 in dark, where
// black and white each fail one theme, so edge label findings stay reported.
export const contrastTextBelowAa: Rule = {
  id: RULE.TEXT,
  category: "contrast",
  summary: "label text below 4.5:1 against its fill",
  options: CONTRAST_OPTIONS,
  check: async (ctx) => {
    const settings = settingsOf(ctx);
    const found: Finding[] = [];
    for (const diagram of ctx.doc.diagrams) {
      for (const p of (await contrastOf(diagram, settings)).pairs) {
        if (p.kind === "text" && !p.passes) found.push(textFinding(ctx, diagram, p, settings.profile));
      }
    }
    return found;
  },
  fix: async (ctx) => {
    const settings = settingsOf(ctx);
    // Under a host profile color: is ignored, so there is nothing to rewrite.
    if (settings.profile === "mkdocs-material") return [];
    const edits: Edit[] = [];
    for (const diagram of ctx.doc.diagrams) {
      const { pairs } = await contrastOf(diagram, settings);
      const failing = new Set(pairs.filter((p) => p.kind === "text" && !p.passes).map((p) => p.directive));
      for (const directive of failing) {
        const span = directive.spans.color;
        const start = span ? diagram.offsetOf(span) : null;
        if (!span || start === null) continue;
        const backgrounds = pairs
          .filter((p) => p.kind === "text" && p.directive === directive)
          .map((p) => p.background);
        const best = CANDIDATES.map((c) => ({ c, worst: Math.min(...backgrounds.map((bg) => ratioOn(c, bg))) })).sort(
          (a, b) => b.worst - a.worst,
        )[0];
        if (!best || best.worst < AA_NORMAL) continue;
        edits.push({
          rule: RULE.TEXT,
          start,
          end: start + (span.end - span.start),
          text: best.c,
          expect: { kind: "same-diagrams" },
        });
      }
    }
    return edits;
  },
};
