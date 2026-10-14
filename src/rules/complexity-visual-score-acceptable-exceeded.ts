import { complexityRule } from "./complexity.ts";
import { boundaryHint, splitTarget } from "./shared.ts";
import { RULE } from "./types.ts";

export const complexityVisualScoreAcceptableExceeded = complexityRule({
  id: RULE.VCS_ACCEPTABLE,
  summary: "a visual complexity score above the preset's readable threshold",
  hit: ({ stats, metrics }, c) =>
    metrics.visual_complexity_score > c.vcs_acceptable && metrics.visual_complexity_score <= c.vcs_complex
      ? {
          message: `VCS ${metrics.visual_complexity_score.toFixed(1)} > ${c.vcs_acceptable} acceptable threshold`,
          remediation: `Reduce complexity by splitting ${boundaryHint(stats.subgraph_names)} or pruning edges. ${splitTarget(c)}`,
        }
      : null,
});
