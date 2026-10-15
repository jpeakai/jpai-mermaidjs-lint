import { complexityRule } from "./complexity.ts";
import { boundaryHint, splitTarget } from "./shared.ts";
import { RULE } from "./types.ts";

export const complexityVisualScoreCritical = complexityRule({
  id: RULE.VCS_CRITICAL,
  summary: "a visual complexity score above the preset's complex threshold",
  hit: ({ stats, metrics }, c) =>
    metrics.visual_complexity_score > c.vcs_complex
      ? {
          message: `VCS ${metrics.visual_complexity_score.toFixed(1)} > ${c.vcs_complex} complex threshold`,
          remediation:
            `Reduce diagram complexity. Split ${boundaryHint(stats.subgraph_names)}, remove redundant edges, ` +
            `or collapse leaf nodes into labelled groups. ${splitTarget(c)}`,
        }
      : null,
});
