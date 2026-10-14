import { CONTRAST_OPTIONS, contrastOf, fileLine, profileOf } from "./shared.ts";
import { type Finding, RULE, type Rule } from "./types.ts";

const AA_NON_TEXT = 3;

// A border is a UI component, so WCAG asks 3:1 of it against its fill. Under a
// host profile, and in an erDiagram, the author cannot make a saturated hue
// clear 3:1 in both themes, and the category is also carried by the label and
// the tint. Those pairs are not findings, because there is no warning level.
export const contrastBorderBelowUiMinimum: Rule = {
  id: RULE.BORDER,
  category: "contrast",
  summary: "a border below 3:1 against its fill",
  options: CONTRAST_OPTIONS,
  check: (ctx) => {
    const profile = profileOf(ctx);
    const found: Finding[] = [];
    for (const diagram of ctx.doc.diagrams) {
      for (const p of contrastOf(diagram, profile).pairs) {
        if (p.kind !== "border" || p.passes || p.advisory) continue;
        const line = fileLine(diagram, p.line);
        found.push({
          file: ctx.file,
          line,
          endLine: line,
          rule: RULE.BORDER,
          message:
            `${p.directive.kind} ${p.selector}: border ${p.assessment.ratio.toFixed(2)}:1 < ${AA_NON_TEXT} ` +
            `(${p.foreground} on ${p.background}${p.theme ? `, ${p.theme}` : ""})`,
          remediation: "Darken the stroke or lighten the fill until the ratio reaches 3:1.",
        });
      }
    }
    return found;
  },
};
