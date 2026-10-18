import { complexityRule } from "./complexity.ts";
import { boundaryHint, splitTarget } from "./shared.ts";
import { RULE } from "./types.ts";

export const complexityNodeCountHardLimit = complexityRule({
  id: RULE.NODES_HARD,
  summary: "more nodes than the preset's hard limit",
  hit: ({ stats }, c) =>
    stats.nodes > c.node_hard_limit
      ? {
          message: `${stats.nodes} nodes > ${c.node_hard_limit} hard limit`,
          remediation:
            "Split immediately. This diagram is beyond any comprehensible size. " +
            `Split ${boundaryHint(stats.subgraph_names)}. ${splitTarget(c)}`,
        }
      : null,
});
