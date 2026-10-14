import { compositeOver, wcagRatio } from "../parse/color.ts";
import { CONTRAST_OPTIONS, contrastOf, fileLine, profileOf } from "./shared.ts";
import { type Edit, type Finding, RULE, type Rule } from "./types.ts";

const AA_NORMAL = 4.5;
const CANDIDATES = ["#000000", "#ffffff"] as const;

const ratioOn = (fg: string, bg: string): number => wcagRatio(compositeOver(fg, bg), bg);

// Label text must reach 4.5:1 against its fill, in every theme the fill is
// scored in. The fix swaps a declared color: for black or white, whichever
// reads better, and only when that clears 4.5:1 on every background the
// directive is scored against. Choosing a brand colour is a design decision, so
// anything else stays reported.
export const contrastTextBelowAa: Rule = {
  id: RULE.TEXT,
  category: "contrast",
  summary: "label text below 4.5:1 against its fill",
  options: CONTRAST_OPTIONS,
  check: (ctx) => {
    const profile = profileOf(ctx);
    const found: Finding[] = [];
    for (const diagram of ctx.doc.diagrams) {
      for (const p of contrastOf(diagram, profile).pairs) {
        if (p.kind !== "text" || p.passes) continue;
        const where = [p.theme, p.row].filter(Boolean).join("/");
        const line = fileLine(diagram, p.line);
        found.push({
          file: ctx.file,
          line,
          endLine: line,
          rule: RULE.TEXT,
          message:
            `${p.directive.kind} ${p.selector}: text ${p.assessment.ratio.toFixed(2)}:1 < ${AA_NORMAL} ` +
            `(${p.foreground} on ${p.background}${where ? `, ${where}` : ""})`,
          remediation:
            profile === "mkdocs-material"
              ? "The host theme forces the label text, so change the fill until the host text reads on it in both themes."
              : "Darken or lighten the fill, or change color:, until the ratio reaches 4.5:1 in every theme.",
        });
      }
    }
    return found;
  },
  fix: (ctx) => {
    const profile = profileOf(ctx);
    // Under a host profile color: is ignored, so there is nothing to rewrite.
    if (profile === "mkdocs-material") return [];
    const edits: Edit[] = [];
    for (const diagram of ctx.doc.diagrams) {
      const { pairs } = contrastOf(diagram, profile);
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
