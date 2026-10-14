import { complexityRule } from "./complexity.ts";
import { boundaryHint, splitTarget } from "./shared.ts";
import { RULE } from "./types.ts";

export const complexityNodeCountHardLimit = complexityRule({
  id: RULE.NODES_HARD,
  summary: "more nodes than any diagram can hold, above the hard limit",
  hit: ({ stats }, c) =>
    stats.nodes > c.node_hard_limit
      ? {
          message: `${stats.nodes} nodes > ${c.node_hard_limit} hard limit`,
          remediation:
            "Split immediately. This diagram is beyond any comprehensible size. " +
            `${boundaryHint(stats.subgraph_names).replace(/^along /, "Split along ")}. ${splitTarget(c)}`,
        }
      : null,
});
