---
type: Architecture Decision
title: A decision region folded far larger than the other groups opens, a span label shows both its labels whole, and a stub for a range's end shows its own label
description: When a plan opens a decision region, how long a span label is, and how a stub names a range end
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-20
provenance: Six blind raters scored 24 paired plans at a mean of 4.11 out of 5, every plan correct and every plan at 4 or more. Seventeen plans scored a unanimous 4, and the notes on them were comparisons with the earlier variant. The notes in the two rounds before named what still cost those plans. Six notes on a loan flow at the medium and high presets named its one large group, "Thin file? (+10)", folding 11 of 41 nodes. No other group in those plans held more than 7, and the medium overview stopped at 10 nodes against a target of 15. The low preset, whose target is too small for that region to fold, showed the thin-file decision and its two scoring branches apart. Raters gave the plans whose groups were named by the first and last step a point over plans naming each by its first step. One note said a pipeline's groups named only by their first step were merely acceptable. Four groups in the rated plans had a span to name, but its two labels held 45 to 54 characters, over the 40 a span label took. An incident flow scoring 4.83 named one group by a span, and a group of leaves scoring 4.00 named all four members in 69 characters. A plan for ticket ids drew "REL-0042 (in REL-0042 … REL-0044 (+1))" in four details, the range already naming REL-0042
enforced_in:
  - src/split/plan.ts oversized, OVERSIZED and foldToTarget, which walk again with a decision region far larger than the median group left open
  - src/split/rules.ts FoldRules open and src/split/tier2.ts proposeRegions, which never offer a region the plan opened
  - src/split/label.ts SPAN_CAP and spanLabel, which let a span label hold twice LABEL_CAP characters
  - src/split/label.ts groupLabels and src/split/contract.ts groupLabelViolations, which show a span label uncut
  - src/split/label.ts ownSuffices and rangeEnds, which let a stub for a member a range label names show its own label
  - tests/split/faithful.ts and tests/split/checker.ts spanOfReading, which read a span label up to twice the label cap
  - tests/split/round19.test.ts, which holds the rated diagrams to these plans and refuses forged span labels
generated: { by: jpai-mermaidjs-lint, at: 2026-10-20T00:00:00Z }
---

<!-- GENERATED from MJL-0041 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Scoped exception to [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) (a decision region folded far larger than the median group opens, and the regions inside it fold apart)
- Extends [MJL-0037](0037-stubs-for-one-group-share-a-box-and-the-lighter-detail-draws-exactly.md) (an oversized decision region opens, so the groups stay even)
- Scoped exception to [MJL-0039](0039-rows-alone-fold-nothing-and-a-plan-says-why-it-was-flagged.md) (a span label holds twice the label cap, both its labels shown uncut, where MJL-0039 held it to 40 characters)
- Extends [MJL-0039](0039-rows-alone-fold-nothing-and-a-plan-says-why-it-was-flagged.md) (a stub for a range label.s first or last member shows its own label)

## Decision

### The lens

#### Given

a reader of an overview reads groups of about one size as stages of about one weight. A decision region folds whole once every region inside it has folded. So a region holding other regions can grow far larger than the groups beside it. A reader reads a group named by where its flow enters and leaves as the stage it is. A stub's text names the outside node it stands for, and a range label already names its first and last members

#### We prefer

opening a decision region the plan folded into a group holding more than twice the median group's members. This applies when the plan has three groups or more. The plan walks again with that region left open, so its decision shows in the overview and the regions inside it fold apart. It keeps the plan walked again when that plan meets the target and its largest group holds fewer members. It opens the next such region the same way. A loan flow at the medium preset then shows "Thin file?" between "Score with open banking data → Alt score above 620? (+1)" and "Bureau score above 680? (+6)", in an overview of 12 nodes. A span label holds at most twice LABEL_CAP characters, as a list of leaves may. It is never cut, since its two labels are what it says. So a sanctions stage reads "Sanctions list hit? → Pull credit bureau file (+3)". A stub for the first or the last member a range label names shows its own label alone, as "REL-0042". The contract and both test readers accept a span label up to the longer cap, only recomputed from the members, and only uncut

#### Because

the groups raters scored highest held members of about one weight. The one group they kept naming was the one far larger than the rest. The low preset's plan, which cannot fold that region, already shows the decision and its branches apart. A span names a group by what it holds, and a count beside its first step does not. A label the overview shows whole reads better at 54 characters than a count, as raters found a list of 69 characters did. A stub repeating the range that names it says the same name twice

#### Unless

the plan has fewer than three groups, or the large group is no decision region. The plan walked again may not meet the target, or its largest group may hold as many members, and the region then stays folded. The two labels of a span may hold more than twice LABEL_CAP characters, markup, an arrow or an ellipsis. The group then keeps its count. A member of a range group that the range does not name keeps its group's label in its stub

## Consequences

### Pros

- The loan flow's medium overview shows 12 nodes, its largest group 7 members where it was 11.
- The loan flow's high overview shows the thin-file decision, at 15 nodes where it was 16.
- A release pipeline reads "Deploy docs site → SLSA provenance attestation (+4)", and an incident flow "More than 10% of users? → Assign scribe and comms lead (+4)".
- The ticket-id plan's stubs read "REL-0042" and "PLAT-1240".

### Cons

- A plan with an oversized decision region walks twice.
- The loan flow's high overview folds the senior sign-off into "Amount above 50k? (+3)", which it showed before.
- A span label up to 80 characters widens its overview node.
- The contract, the reading and the checker each accept a longer span label.
