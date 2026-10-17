// A complexity rule is a band of a threshold ladder. The node count and the
// visual complexity score each have a ladder, and a diagram lands in exactly
// one band of it, so only the most severe rule of a ladder fires. Splitting a
// diagram changes what it says, so no complexity rule has a fixer.

import { type ThresholdConfig, thresholdsFrom } from "../parse/metrics.ts";
import { COMPLEXITY_OPTIONS, finding, type Measured, measure } from "./shared.ts";
import type { Rule, RuleId } from "./types.ts";

export interface Hit {
  message: string;
  remediation: string;
}

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
      if (hit) found.push(finding(ctx, diagram, spec.id, hit));
    }
    return found;
  },
});
