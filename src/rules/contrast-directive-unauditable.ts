import { CONTRAST_OPTIONS, contrastOf, fileLine, profileOf } from "./shared.ts";
import { type Finding, RULE, type Rule } from "./types.ts";

// A directive the profile requires to be scoreable but cannot be: a github fill
// with no color:, or a colour that will not parse. Reporting it as an
// informational skip is how a gate exits clean on a diagram it never checked,
// so it is a failure to audit.
export const contrastDirectiveUnauditable: Rule = {
  id: RULE.UNAUDITABLE,
  category: "contrast",
  summary: "a style directive whose contrast cannot be audited",
  options: CONTRAST_OPTIONS,
  check: (ctx) => {
    const profile = profileOf(ctx);
    const found: Finding[] = [];
    for (const diagram of ctx.doc.diagrams) {
      for (const s of contrastOf(diagram, profile).skipped) {
        if (!s.blocking) continue;
        const line = fileLine(diagram, s.line);
        found.push({
          file: ctx.file,
          line,
          endLine: line,
          rule: RULE.UNAUDITABLE,
          message: `${s.selector}: unaudited, ${s.reason}`,
          remediation: "Declare the missing property or fix the colour so the pair can be scored.",
        });
      }
    }
    return found;
  },
};
