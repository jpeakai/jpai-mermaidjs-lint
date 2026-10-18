// Shared helpers for the split plan tests: real parser strings in, the working
// graph or the build out, and thresholds narrowed to a target.

import { extractGraph } from "../../src/parse/graph.ts";
import { configFromPreset, type ThresholdConfig } from "../../src/parse/metrics.ts";
import { extractStats } from "../../src/parse/stats.ts";
import type { Build } from "../../src/split/assemble.ts";
import { buildWorkGraph, type WorkGraph } from "../../src/split/graph.ts";
import { directionOf } from "../../src/split/index.ts";
import { planWork } from "../../src/split/plan.ts";
import { EMPTY_PARTITION, type Partition, quotientEdges } from "../../src/split/quotient.ts";
import type { TierContext } from "../../src/split/tier.ts";

// The high-density weights with a target of the given node count and score.
export const target = (nodes: number, vcs: number): ThresholdConfig => ({
  ...configFromPreset("high-density"),
  node_target: nodes,
  vcs_target: vcs,
  preset_name: "custom",
});

export const workOf = async (source: string): Promise<WorkGraph> => {
  const [graph, stats, direction] = await Promise.all([
    extractGraph(source),
    extractStats(source),
    directionOf(source),
  ]);
  return buildWorkGraph(graph, { direction, rows: stats.rows });
};

export const ctxOf = (work: WorkGraph, config: ThresholdConfig, part: Partition = EMPTY_PARTITION): TierContext => ({
  work,
  part,
  config,
  qedges: quotientEdges(work, part),
});

export const buildOf = async (source: string, config: ThresholdConfig): Promise<Build> => {
  const built = planWork(await workOf(source), config, 1);
  if (typeof built === "string") throw new Error(built);
  return built;
};

export const lines = (...xs: string[]): string => xs.join("\n");
