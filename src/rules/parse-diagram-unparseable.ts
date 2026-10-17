import { parseFailed } from "../parse/metrics.ts";
import type { DiagramStats } from "../parse/stats.ts";
import { finding } from "./shared.ts";
import { RULE, type Rule } from "./types.ts";

// Diagram types that mermaid draws through an external add-on. Mermaid core
// does not register them, so no parser here can read them, valid or not.
const EXTERNAL_TYPES = new Set(["zenuml"]);

// What the finding says: the parser's own reason when it gave one, and
// otherwise that it read the diagram as zero nodes without complaint.
const messageOf = (stats: DiagramStats): string => {
  const type = stats.diagram_type;
  if (EXTERNAL_TYPES.has(type)) {
    return `${type} is drawn by an external mermaid add-on that mermaidjs-lint does not include, so it cannot be parsed or checked`;
  }
  if (stats.error !== null) {
    const lines = /\bline \d/.test(stats.error) ? " (its line numbers count within the diagram, not the file)" : "";
    return `${type} did not parse (parser: ${stats.parser_used})${lines}: ${stats.error}`;
  }
  return `${type} parsed to 0 nodes from multi-line source with no error (parser: ${stats.parser_used}), a silent parse failure`;
};

// A diagram that mermaid's parser rejects, or that mermaid core reads as zero
// nodes from more than one line, which is a silent parse failure. Rules never
// read each other: the complexity rules skip the same diagrams themselves
// through measure() in shared.ts, because thresholds are meaningless against
// structure the parser never read.
export const parseDiagramUnparseable: Rule = {
  id: RULE.UNPARSEABLE,
  category: "parse",
  summary: "a diagram mermaid's parser rejects, or reads as zero nodes from several lines",
  check: async (ctx) => {
    const found = [];
    for (const diagram of ctx.doc.diagrams) {
      const stats = await diagram.stats();
      if (!parseFailed(diagram.source, stats)) continue;
      const remediation = EXTERNAL_TYPES.has(stats.diagram_type)
        ? `No fixer can help: mermaidjs-lint has no ${stats.diagram_type} parser. Redraw it as a type mermaid core includes, such as sequenceDiagram, or turn this rule off in the config.`
        : "Verify the diagram renders in mermaid.js and fix its syntax. Complexity rules are skipped for this diagram while it cannot be parsed.";
      found.push(finding(ctx, diagram, RULE.UNPARSEABLE, { message: messageOf(stats), remediation }));
    }
    return found;
  },
};
