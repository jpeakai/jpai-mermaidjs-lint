// A complexity rule is a band of a threshold ladder. The node count and the
// visual complexity score each have a ladder, and a diagram lands in exactly
// one band of it, so only the most severe rule of a ladder fires. Splitting a
// diagram changes what it says, so no complexity rule has a fixer.

import type { Diagram } from "../model.ts";
import { type ThresholdConfig, thresholdsFrom } from "../parse/metrics.ts";
import type { SplitAlternative } from "../split/index.ts";
import { COMPLEXITY_OPTIONS, finding, type Measured, measure, splitOutcomeOf, splitSentence } from "./shared.ts";
import type { Rule, RuleId } from "./types.ts";

export interface Hit {
  message: string;
  remediation: string;
}

// The rules whose finding says the diagram is over a threshold to split
// against. Each one's remediation ends with the split plan when one meets the
// contract, and --split-plan prints the plan for each diagram one flags.
export const SPLIT_RULES: ReadonlySet<RuleId> = new Set<RuleId>([
  "complexity-node-count-acceptable-exceeded",
  "complexity-node-count-cognitive-limit",
  "complexity-node-count-hard-limit",
  "complexity-visual-score-acceptable-exceeded",
  "complexity-visual-score-critical",
]);

// The sentence a remediation ends with when no plan is offered because a list
// or a table reads better, which --split-plan prints (MJL-0034).
const ALTERNATIVE_SENTENCE: Record<SplitAlternative["kind"], string> = {
  list: " A list reads better than a split: --split-plan prints the hub and every node it links as one.",
  matrix: " A table reads better than a split: --split-plan prints every link as an adjacency matrix.",
};

// The hit, with the split plan's sentence after its remediation when the rule
// splits and a plan meets the contract, or the sentence pointing to the list
// or table that reads better. The plan is a recommendation only, so the rule
// still has no fixer (MJL-0004).
const withPlan = async (id: RuleId, hit: Hit, diagram: Diagram, config: ThresholdConfig): Promise<Hit> => {
  if (!SPLIT_RULES.has(id)) return hit;
  const { plan, alternative } = await splitOutcomeOf(diagram, config);
  if (plan) return { ...hit, remediation: hit.remediation + splitSentence(plan) };
  return alternative ? { ...hit, remediation: hit.remediation + ALTERNATIVE_SENTENCE[alternative.kind] } : hit;
};

export const complexityRule = (spec: {
  id: RuleId;
  summary: string;
  hit: (m: Measured, c: ThresholdConfig) => Hit | null;
}): Rule => ({
  id: spec.id,
  category: "complexity",
  summary: spec.summary,
  options: COMPLEXITY_OPTIONS,
  check: async (ctx) => {
    const config = thresholdsFrom(ctx.options);
    const found = [];
    for (const diagram of ctx.doc.diagrams) {
      const measured = await measure(diagram, config);
      if (!measured) continue;
      const hit = spec.hit(measured, config);
      if (hit) found.push(finding(ctx, diagram, spec.id, await withPlan(spec.id, hit, diagram, config)));
    }
    return found;
  },
});
