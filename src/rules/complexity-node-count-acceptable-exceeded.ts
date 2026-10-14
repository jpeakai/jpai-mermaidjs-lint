import { complexityRule } from "./complexity.ts";
import { boundaryHint, splitTarget } from "./shared.ts";
import { RULE } from "./types.ts";

export const complexityNodeCountAcceptableExceeded = complexityRule({
  id: RULE.NODES_ACCEPTABLE,
  summary: "more nodes than the preset's readable threshold",
  hit: ({ stats }, c) =>
    stats.nodes > c.node_acceptable && stats.nodes <= c.node_complex
      ? {
          message: `${stats.nodes} nodes > ${c.node_acceptable} acceptable threshold`,
          remediation: `Split ${boundaryHint(stats.subgraph_names)}. ${splitTarget(c)}`,
        }
      : null,
});
