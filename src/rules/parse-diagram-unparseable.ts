import { parseFailed } from "../parse/metrics.ts";
import { finding } from "./shared.ts";
import { RULE, type Rule } from "./types.ts";

// A multi-line diagram whose parser yields no nodes is a silent parse failure.
// It short-circuits the complexity rules, because thresholds are meaningless
// against structure the parser never read.
export const parseDiagramUnparseable: Rule = {
  id: RULE.UNPARSEABLE,
  category: "parse",
  summary: "a multi-line diagram that mermaid's parser reads as zero nodes",
  check: async (ctx) => {
    const found = [];
    for (const diagram of ctx.doc.diagrams) {
      const stats = await diagram.stats();
      if (!parseFailed(diagram.source, stats)) continue;
      const why = stats.error ? `: ${stats.error}` : "";
      found.push(
        finding(
          ctx,
          diagram,
          RULE.UNPARSEABLE,
          `${stats.diagram_type} yielded 0 nodes from multi-line source (parser: ${stats.parser_used})${why}`,
          "Verify the diagram renders in mermaid.js and fix its syntax. Complexity rules are skipped for this diagram while it cannot be parsed.",
        ),
      );
    }
    return found;
  },
};
