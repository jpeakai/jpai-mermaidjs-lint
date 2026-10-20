// Why a plan was offered, in words a reader checks against the target: the
// size the complexity rules measured the diagram at, the split target, and
// which of the two measures is over (MJL-0039). A diagram over on its score
// alone may be over only for the rows it draws; its plan then says so, and
// that dropping the rows from the overview meets the target, so nothing folds.

import type { ThresholdConfig } from "../parse/metrics.ts";
import type { WorkGraph } from "./graph.ts";
import { scoreOf } from "./quotient.ts";
import type { LadderStep, Tier } from "./types.ts";

const overOn = (nodes: boolean, score: boolean): string =>
  nodes && score ? "over on both" : nodes ? "over on its node count alone" : "over on its score alone";

export const flaggedText = (
  work: WorkGraph,
  config: ThresholdConfig,
  ladder: readonly LadderStep[],
  tier: Tier,
): string => {
  const { nodes } = work.measured;
  const score = scoreOf(work.measured, work.rows, config);
  const [nt, vt] = [config.node_target, config.vcs_target];
  const lead = `flagged at ${nodes} nodes and a score of ${score}, against a split target of ${nt} nodes and ${vt}: ${overOn(nodes > nt, score > vt)}`;
  const rowsOnly = ladder[0];
  if (tier !== "T1" || work.rows === 0 || rowsOnly === undefined) return lead;
  return `${lead}. Its rows move to row diagrams, and the overview without them meets the target at ${rowsOnly.nodes} nodes and ${rowsOnly.score}, so no node folds`;
};
