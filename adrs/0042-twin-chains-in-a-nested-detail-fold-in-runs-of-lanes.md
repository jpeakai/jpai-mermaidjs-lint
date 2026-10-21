---
type: Architecture Decision
title: Twin chains in a detail split again fold in runs of lanes, by their stages where they can
description: How a detail split again folds twin chains too many to fold whole
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-21
provenance: An ETL pipeline folds its seven extract lanes whole, as "Extract/Ingest → bronze (+14)", per MJL-0038. That group's detail does not fit the low or the medium target, so it is split again, one group per lane. The detail then reads seven groups of two members, "Extract GA4 events (+1)" and the like, and seven details of four nodes each. Across four blind rounds, raters scored that plan at 4.00, 4.00, 4.00 and 3.83. Four notes in two of those rounds named its nested split over-fragmented, fiddly, repetitive inside, or seven tiny redundant details. No note called the overview's one extract group arbitrary, while MJL-0038 records a top-level cut of the lanes into two runs that a rater did. A compiler's AST group, split again into "Expression (+3)", a pair of declarations and "Statement (+3)", drew no such note
enforced_in:
  - src/split/tier2.ts laneRuns, byStage, byFit, evenLanes and MIN_LANES, which fold twin chains in a detail split no further in runs of lanes
  - src/split/label.ts stageWord, which names the word a label gives its place in a lane
  - tests/split/round20.test.ts, which holds the ETL and ingest pipelines to these runs and the compiler AST to its nested groups
generated: { by: jpai-mermaidjs-lint, at: 2026-10-21T00:00:00Z }
---

<!-- GENERATED from MJL-0042 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Scoped exception to [MJL-0038](0038-twin-chains-fold-whole-and-a-pair-names-both-members.md) (twin chains in a detail split again fold in runs of lanes, not one group per lane)

## Decision

### The lens

#### Given

a reader opens one detail per group, and a group of two members says little its detail does not.
A detail split again whose groups each hold one lane reads as many tiny diagrams of one shape.
Lanes whose labels lead with one word at every place read as one stage.
A detail split again must fit its target, since none is split a third time

#### We prefer

folding twin chains in runs of lanes in a detail split again, when they do not fit whole and every lane fits as one stage.
Lanes whose labels give the same word at every place, a dotted namespace or else a first word, form one set.
When there are two sets or more, every set fits whole, and one holds two lanes or more, each set folds as one group.
So an ETL detail at the medium preset reads "Extract → bronze (+12)" beside the one ingest lane.

Else the lanes fold in natural order of their entries' labels, in runs of as many as fit.
The runs are cut as evenly as every run still fitting allows.
So the same detail at the low preset reads "Extract → bronze (+8)" and "Extract/Ingest → bronze (+6)".
A lane in no run folds alone, as before.

Each run is a twins group named by its lanes' stages, which the contract and both test readers recompute from the members

#### Because

a few details each holding several lanes say what one per lane said, in fewer diagrams.
A set of lanes led by one word reads as a stage, so grouping by it sorts the lanes by their labels.
Runs in label order sort them where no word does, inside a group the overview already names as one stage

#### Unless

the walk is the overview's, or a detail it may split again, where twin chains still fold whole per MJL-0038.
Lanes that fit whole fold as one group.
When no two lanes fit together, each lane folds alone

## Consequences

### Pros

- The ETL detail at the low preset reads two groups and two details, where it read seven of each.
- An ingest pipeline's detail at the low preset reads "Pull → raw (+8)" and "Fetch → raw (+8)", where it read eight lanes.

### Cons

- A run cut by label order, where no stage word sorts the lanes, is a cut a reader may read as arbitrary.
- Two runs may take near-alike lane labels, such as "Extract → bronze (+8)" and "Extract/Ingest → bronze (+6)".
