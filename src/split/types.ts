// The shape of a split plan: an overview where some node sets are folded into
// one group node, plus one detail diagram per group. Overview and details
// together recover every original node and edge, which contract.ts proves
// before a plan is offered.

import type { DiagramGraph } from "../parse/graph.ts";

// The tiers, least lossy first. T1 is presentation only (rows dropped, exact
// duplicate edges merged) and folds no node.
export type Tier = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

export const FOLD_TIERS: readonly Tier[] = ["T2", "T3", "T4", "T5", "T6"];

export interface SplitGroup {
  // g1, g2 and on, in the order of the sorted member tuples.
  id: string;
  // The label shown: an author label, or a member's label (the member with
  // the highest degree then smallest id, unless another group shows its
  // label), cut to LABEL_CAP characters, followed by " (+N)".
  label: string;
  // The label's two parts: the whole author or member label, and N.
  labelBase: string;
  hidden: number;
  // Whether the label is a markdown string, as the label it is taken from.
  markdown?: true;
  members: string[];
  // The author regions folded whole into the group: flowchart subgraphs,
  // composite state boxes and class namespaces, by their graph id.
  regions: string[];
  // The region the group node sits in, or null at the top level.
  parent: string | null;
  tier: Tier;
  reason: string;
  // Every member's shape, when all members agree.
  shape?: string;
}

export interface SplitDetail {
  // The id of the group this diagram details.
  group: string;
  graph: DiagramGraph;
  // Each stub's id in this diagram, mapped to the original node, subgraph or
  // interface it stands for, or to the id of the group it stands for whole.
  stubs: Record<string, string>;
  // Whether the members' rows (erDiagram attributes, class members) are drawn.
  rows: boolean;
  source: string;
  nodes: number;
  score: number;
  // A detail too large for the target is split once more, bounded at depth 2.
  split: SplitPlan | null;
}

// A diagram drawing the rows of nodes kept in the overview, which draws no
// rows: an erDiagram's entities with their attributes, or a classDiagram's
// classes with their members.
export interface RowDetail {
  members: string[];
  graph: DiagramGraph;
  source: string;
  nodes: number;
  score: number;
}

export interface SplitLoss {
  // Overview node pairs reachable in the overview but not in the original.
  newReachablePairs: number;
  // The same count after each tier the plan walked, as the partition stood.
  byTier: Partial<Record<Tier, number>>;
  // ER attributes and class members drawn in no diagram of the plan.
  droppedRows: number;
  // Start and end transitions the overview draws merged onto a group, beyond
  // the one drawn for them: each is drawn as written in the group's detail.
  mergedMarkers: number;
  // Undirected edges the overview draws on the edge between the same two nodes
  // written the other way, at least one a group: each is drawn as written in
  // a detail.
  reversedEdges: number;
}

export interface LadderStep {
  tier: Tier;
  nodes: number;
  score: number;
}

export interface SplitPlan {
  diagram_type: string;
  // The last tier that changed the plan.
  tier: Tier;
  groups: SplitGroup[];
  overview: DiagramGraph;
  overviewSource: string;
  overviewNodes: number;
  overviewScore: number;
  details: SplitDetail[];
  rowDetails: RowDetail[];
  loss: SplitLoss;
  // The overview after each tier the plan walked, as the partition stood: how
  // the ladder climbed to the tier that met the target.
  ladder: LadderStep[];
}

// What reads better than the diagram where no plan is offered because a list
// or a table would: a star's hub and leaves as a markdown list, or a dense
// mesh as a markdown adjacency matrix, drawing every node and edge.
export interface SplitAlternative {
  kind: "list" | "matrix";
  markdown: string;
}

// Why no plan was offered, beside the plan when there is one, and when a list
// or a table reads better, that list or table.
export interface SplitOutcome {
  plan: SplitPlan | null;
  reason: string;
  violations: string[];
  alternative?: SplitAlternative;
}
