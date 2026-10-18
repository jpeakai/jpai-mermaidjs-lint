import { parseFailed } from "../parse/metrics.ts";
import { type DiagramStats, UNKNOWN_TYPE } from "../parse/stats.ts";
import { finding } from "./shared.ts";
import { RULE, type Rule } from "./types.ts";

// Diagram types that mermaid draws through an external add-on. Mermaid core
// does not register them, so no parser here can read them, valid or not.
const EXTERNAL_TYPES = new Set(["zenuml"]);

// What the finding says: the parser's own reason, with a note when the line it
// points at counts within the diagram. A diagram whose type mermaid does not
// detect has no type to name.
const messageOf = (stats: DiagramStats): string => {
  const type = stats.diagram_type;
  if (EXTERNAL_TYPES.has(type)) {
    return `${type} is drawn by an external mermaid add-on that mermaidjs-lint does not include, so it cannot be parsed or checked`;
  }
  const lines = stats.error_line != null ? " (its line numbers count within the diagram, not the file)" : "";
  const what = type === UNKNOWN_TYPE ? "a diagram of no type mermaid detects" : type;
  return `${what} did not parse (parser: ${stats.parser_used})${lines}: ${stats.error}`;
};

// A diagram that mermaid's parser rejects. Rules never read each other: the
// complexity rules skip the same diagrams themselves through measure() in
// shared.ts, because thresholds are meaningless against structure the parser
// never read.
export const parseDiagramUnparseable: Rule = {
  id: RULE.UNPARSEABLE,
  category: "parse",
  summary: "a diagram mermaid's parser rejects",
  check: async (ctx) => {
    const found = [];
    for (const diagram of ctx.doc.diagrams) {
      const stats = await diagram.stats();
      if (!parseFailed(stats)) continue;
      const remediation = EXTERNAL_TYPES.has(stats.diagram_type)
        ? `No fixer can help: mermaidjs-lint has no ${stats.diagram_type} parser. Redraw it as a type mermaid core includes, such as sequenceDiagram, or turn this rule off in the config.`
        : "Verify the diagram renders in mermaid.js and fix its syntax. Complexity rules are skipped for this diagram while it cannot be parsed.";
      found.push(finding(ctx, diagram, RULE.UNPARSEABLE, { message: messageOf(stats), remediation }));
    }
    return found;
  },
};
