import { complexityRule } from "./complexity.ts";
import { RULE } from "./types.ts";

export const MAX_NESTING = 3;

export const complexitySubgraphNestingTooDeep = complexityRule({
  id: RULE.NESTING,
  summary: "subgraphs nested three or more levels deep",
  hit: ({ stats }) =>
    stats.max_subgraph_depth >= MAX_NESTING
      ? {
          message: `subgraph nesting depth ${stats.max_subgraph_depth} (at least ${MAX_NESTING}) hinders readability`,
          remediation:
            "Flatten nesting by inlining inner subgraphs, or promote deeply nested groups into their own top-level sub-diagrams.",
        }
      : null,
});
