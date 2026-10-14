import { complexityRule } from "./complexity.ts";
import { boundaryHint, splitTarget } from "./shared.ts";
import { RULE } from "./types.ts";

export const complexityNodeCountCognitiveLimit = complexityRule({
  id: RULE.NODES_COGNITIVE,
  summary: "more nodes than a reader can follow, above the cognitive limit",
  hit: ({ stats }, c) =>
    stats.nodes > c.node_complex && stats.nodes <= c.node_hard_limit
      ? {
          message: `${stats.nodes} nodes > ${c.node_complex} (Huang 2020 cognitive limit)`,
          remediation: `Split into sub-diagrams ${boundaryHint(stats.subgraph_names)}. ${splitTarget(c)}`,
        }
      : null,
});
