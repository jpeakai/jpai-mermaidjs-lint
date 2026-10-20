---
type: Architecture Decision
title: A diagram over its target only for its rows folds nothing more, a plan says why it was flagged, and a group is named by every member or by where its flow enters and leaves
description: When a plan stops at rows dropped, why it says it was offered, and how small groups and runs are named
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-20
provenance: Three blind raters scored 24 paired plans at a mean of 4.08 out of 5, every plan correct, 23 of them at 4 or more. A university schema scored 4, 4 and 3, the third rating unchanged across three rounds. That rater read the schema as already under the high target, so folding its aggregates into pairs hid what needed no hiding. Mermaid's parser reads it as 23 entities, within the target of 25, and a score of 63.75, over the target of 40. The complexity rule flags it at 63.8 over the acceptable 60, on its score alone. Its attribute rows add 25.75 of that score, and dropping them from the overview gives 23 entities and 38, within the target. Across five blind rounds raters gave the folded schema 57 points and the schema shown whole 56. Nothing in the plan said why a diagram within its node target was split at all. The plans raters scored 5 named every group by what it holds, an author region or a whole family. Plans at a unanimous 4 named groups of three by one member and a count, as "ADDRESS (+2)" for COUNTRY, CITY and ADDRESS. One rater noted a pipeline's groups were named only by their first step, as "git push to main (+5)"
enforced_in:
  - src/split/plan.ts foldToTarget, which stops at T1 when dropping rows alone meets the target
  - src/split/flagged.ts flaggedText and src/split/graph.ts Measured, which say at what size the diagram was flagged, against which target, and on which measure
  - src/split/index.ts measuredOf and src/split/assemble.ts buildDetail, which hand the measured size to the plan and to a detail split again
  - src/split-report.ts outcomeLines and planLines, which print the flagged text under each plan's heading
  - src/split/label.ts listedOthers and MAX_LISTED, src/split/quotient.ts pairChoices and labelChoices, and src/split/assemble.ts alikePairs, which name a group of three by every member
  - src/split/label.ts spanLabel and src/split/quotient.ts spanOf, which name a flowchart group by the member its flow enters at and the one it leaves from
  - src/split/label.ts ownSuffices, which lets a stub for a member a span label names show its own label
  - src/split/contract.ts pairViolations and spanName, which accept a list or span label only as recomputed from the members
  - tests/split/faithful.ts and tests/split/checker.ts listOk and spanOfReading, which read the list and span labels on their own
  - tests/split/round17.test.ts, which holds the rated diagrams to these plans and refuses forged labels
generated: { by: jpai-mermaidjs-lint, at: 2026-10-20T00:00:00Z }
---

<!-- GENERATED from MJL-0039 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Scoped exception to [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) (a tangled schema that meets its target by rows alone folds no aggregate)
- Scoped exception to [MJL-0038](0038-twin-chains-fold-whole-and-a-pair-names-both-members.md) (a tangled schema that meets its target by rows alone stays at rows dropped, over folding its aggregates into pairs)
- Extends [MJL-0038](0038-twin-chains-fold-whole-and-a-pair-names-both-members.md) (a group of three names every member, as a group of two does)
- Extends [MJL-0036](0036-a-group-is-named-by-its-family-or-lanes-and-a-stub-by-its-group.md) (a flowchart run is named by where its flow enters and leaves, before a member's name)

## Decision

### The lens

#### Given

a reader of a plan for a diagram within its node target wants to know why it was split. A score can be over its target only for the attribute rows a diagram draws, and dropping rows from the overview hides no entity. A reader of an overview reads a group's name as what it holds

#### We prefer

the fewest changes that meet the target. A diagram that meets the target with its rows dropped from the overview stays at T1, rows dropped, and folds nothing more, tangled or not. Every plan says why it was offered. The university schema's reads "flagged at 23 nodes and a score of 63.75, against a split target of 25 nodes and 40". It ends with which measure is over, here "over on its score alone". The size is the one the complexity rules measured, rows counted, and a detail split again reports its own. A plan at T1 adds that its rows move to row diagrams, the size of the overview without them, and that no node folds. --split-plan prints that text under each plan's heading. A group of three shows the label it is named after, then the other two labels in brackets after a plus. They come in natural order, joined by a comma, as "ADDRESS (+CITY, COUNTRY)". Each other label meets the pair rules and holds no comma, and the whole label holds 40 characters at most. A group a range, family or lane label names keeps that label. Groups of two or three folded alike take pair or list labels only when every one of them can. A stub for any member of such a group shows its own label alone. A flowchart group of three members or more, folding no region, may be entered at one member and left from another. The entry is the one member every edge from outside reaches, else the one member no edge reaches. The exit is the one member every edge to outside leaves, else the one member no edge leaves. Such a group with no decision or aggregate head is named by both labels joined by an arrow. So a run of setup steps reads "git push to main → tsc --noEmit (+4)". Neither label holds markup, an arrow or an ellipsis, and the two labels hold 40 characters at most. The count is of the members neither names. It comes after a region's label, a head, a family, a lane, a range and a fan, and before a member's label. A stub for the entry or the exit shows its own label alone. The contract and both test readers accept each label only as recomputed from the members

#### Because

a plan that folds what the target did not ask to fold hides names for no reason a reader can see. Raters across five rounds were split on the folded schema, so the fewer changes win. A reader sees why a diagram was flagged, and that rows alone put it over. That reader takes a plan at rows dropped as the whole answer. A name showing every member of a small group hides nothing. A run named by its first and last step reads as the stage it is, where one member's name promises only that member

#### Unless

the diagram is over its target with its rows dropped, and folds as before. A group may be larger than three, or a label may hold a comma, markup or a bracket. A label may be too long. Its group then keeps its count. A flowchart group may be entered or left at more than one member, and is then named as before

## Consequences

### Pros

- The university schema shows all 23 entities at rows dropped, and its plan says it was over on its score alone.
- A sakila schema's address chain reads "ADDRESS (+CITY, COUNTRY)", and a billing schema's price "PRICE (+PRICE_TIER, PRODUCT)".
- A CI pipeline's stages read "git push to main → tsc --noEmit (+4)" where they read "git push to main (+5)".
- Every plan states the size it was flagged at and the target it meets.

### Cons

- A tangled schema within its node target keeps every relationship in its overview.
- A list or span label is longer than a count, and the overview gives it more room.
- The contract, the reading and the checker each accept two more label forms.
- A plan's JSON carries one more field, flagged.
