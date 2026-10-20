// Why a plan was offered, in words a reader checks against the target: the
// size the complexity rules measured the diagram at, the split target, and
// which of the two measures is over (MJL-0039). A diagram over on its score
// alone may be over only for the rows it draws; its plan then says so, and
// that dropping the rows from the overview meets the target. Nothing folds
// then, or only closed aggregates, which the plan says (MJL-0040).

import type { ThresholdConfig } from "../parse/metrics.ts";
import type { WorkGraph } from "./graph.ts";
import { meets, scoreOf } from "./quotient.ts";
import type { LadderStep, Tier } from "./types.ts";

const overOn = (nodes: boolean, score: boolean): string =>
  nodes && score ? "over on both" : nodes ? "over on its node count alone" : "over on its score alone";

// What folds once rows dropped meet the target: nothing at T1, else only the
// aggregates whose other members relate to nothing outside them.
const ROWS_ONLY_FOLDS: Partial<Record<Tier, string>> = {
  T1: "so no node folds",
  T4: "so only aggregates whose other members relate to nothing else fold",
};

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
  const folds = ROWS_ONLY_FOLDS[tier];
  if (work.rows === 0 || rowsOnly === undefined || folds === undefined) return lead;
  if (!meets(rowsOnly.nodes, rowsOnly.score, config)) return lead;
  return `${lead}. Its rows move to row diagrams, and the overview without them meets the target at ${rowsOnly.nodes} nodes and ${rowsOnly.score}, ${folds}`;
};
