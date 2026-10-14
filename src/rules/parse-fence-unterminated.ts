import { finding } from "./shared.ts";
import { type Edit, RULE, type Rule } from "./types.ts";

const OPENING = /^([ \t>]*)(`{3,}|~{3,})/;

// A fence with no closing line runs to the end of the file, so every line after
// it is read as diagram source. The fix closes it, and only when nothing but
// whitespace follows, because a fence inside a quote or a list can end at its
// container and the closing line would then be a guess.
export const parseFenceUnterminated: Rule = {
  id: RULE.FENCE_UNTERMINATED,
  category: "parse",
  summary: "a mermaid fence that is never closed",
  check: (ctx) =>
    ctx.doc.diagrams
      .filter((d) => !d.terminated)
      .map((d) =>
        finding(
          ctx,
          d,
          RULE.FENCE_UNTERMINATED,
          `mermaid fence opened at line ${d.startLine} is never closed`,
          "Add a closing fence after the last line of the diagram.",
        ),
      ),
  fix: (ctx) => {
    const edits: Edit[] = [];
    const { src } = ctx.doc;
    for (const d of ctx.doc.diagrams) {
      if (d.terminated || src.slice(d.endOffset).trim() !== "") continue;
      const opening = src.split("\n")[d.startLine - 1] ?? "";
      const m = OPENING.exec(opening);
      if (!m) continue;
      // The closing fence goes on its own line, right after the last line of
      // the diagram, whether or not that line ends with a newline.
      const onOwnLine = src.slice(0, d.endOffset).endsWith("\n");
      edits.push({
        rule: RULE.FENCE_UNTERMINATED,
        start: d.endOffset,
        end: d.endOffset,
        text: onOwnLine ? `${m[1]}${m[2]}\n` : `\n${m[1]}${m[2]}`,
        expect: { kind: "same-diagrams" },
      });
    }
    return edits;
  },
};
