---
type: Architecture Decision
title: Stubs for one group's members share a box, the lighter detail draws edges joining two groups one way, and a leaf fold saving alike keeps groups even
description: How a detail draws several stubs for one group, and which detail draws edges joining two groups one way
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-20
provenance: Three blind raters scored 24 paired plans at a mean of 4.06 out of 5, every plan correct. Across the plans, the complaint raters made most was a detail drawing several stubs for one group. A streaming platform scored 4, 4 and 3. Its Edge tier detail drew seven stubs, two each for the Discovery and Member domains, as "Discovery domain (in Discovery domain (+3))" beside "Row ranking (in Discovery domain (+3))". Its Playback detail drew three stubs for the Edge tier. A compiler's class diagram scored 3, 4 and 3. Its nested Ast overview named a group holding Node and the whole Expression family "Node (+4)", and that group's detail drew "Statement (in Statement (+3))". A leaf fold of Statement saved as much as the fold of Node and reached the target as well, and lost only on member order
enforced_in:
  - src/split/assemble.ts boxChoices, boxedShape and boxesOf, which draw a flowchart detail's stubs for one group's members inside one box while the detail meets its target
  - src/split/quotient.ts soleRegion, which finds the author region a group stands for whole
  - src/split/contract.ts boxNames, which reads a box and the stubs inside it by their form, each with exactly one reading
  - tests/split/faithful.ts and tests/split/checker.ts, which read boxes and the stubs inside them on their own
  - src/split/quotient.ts asksExact, holdsExact and oneWayExact, which pick the detail drawing exactly the edges joining two groups one way
  - tests/split/checker.ts fromOne, which accepts a stub for another group's member at a source end in exactly those cases
  - src/split/plan.ts better, which ranks first the T5 fold leaving the smaller largest group at an equal saving
  - tests/split/round15.test.ts, which holds the two rated diagrams to these drawings and refuses a box naming another group or member
generated: { by: jpai-mermaidjs-lint, at: 2026-10-20T00:00:00Z }
---

<!-- GENERATED from MJL-0037 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Scoped exception to [MJL-0036](0036-a-group-is-named-by-its-family-or-lanes-and-a-stub-by-its-group.md) (a stub inside a box shows its member's own label)
- Extends [MJL-0036](0036-a-group-is-named-by-its-family-or-lanes-and-a-stub-by-its-group.md) (a one-way pair's target draws its edges when it needs fewer stubs)
- Extends [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) (of two leaf folds saving alike, the one leaving groups more even goes first)

## Decision

### The lens

#### Given

a reader of a detail reads each stub as one outside thing, and finds it in the overview by its text. Several stubs showing one group's label in brackets read as that group drawn several times. A detail is read faster when its stubs are few, and a plan reads evenly when no detail carries most of them

#### We prefer

drawing a flowchart detail's stubs for two or more members of one other group inside one box. The box is a subgraph at the top level, showing the label the overview shows for that group. Each stub inside it shows its member's own label, as "Zuul edge proxy" inside "Edge tier (+2)". A group may stand for one author region whole, when it folds that region and every member sits inside it. Its box then stands for the region, and an edge to the region meets the box. Any other group's box stands for the group and draws no edge. A group is boxed only when every stub for it stands for a member or for that region. Each stub must also show its plain text, and each member's label must name one member of the group. A detail draws its boxes, most stubs first, while it still meets its target, and a detail split again draws none. The contract and both test readers read a box as that group's region, or as the group. They read each stub inside it as the one member its label names. Edges may join two groups one way only. The target draws them exactly when it needs stubs for fewer of the source's members than the source needs of the target's. With as many, two or more, the target draws them when its detail meets fewer outside overview nodes than the source's. The target then draws a stub for each source member, and the source draws the target as one stub. That holds only while the target's detail still meets its target, with every group asking so drawn as stubs. Otherwise, or when the source's detail is split again, the source draws them, as before. In T5, of two folds saving as much per node hidden, the one whose largest group holds fewer members goes first

#### Because

a box shows at a glance that its stubs belong to one group, where repeated brackets read as duplicates. A box standing for a region draws the edges to the region and to its members as the author drew them. Moving the exact edges to the detail that needs as few stubs or fewer, and meets fewer outside nodes, takes stubs from the heaviest detail. A detail's stubs for one group then usually fit one box. Two groups of one size read as two parts of one story. A group swallowing its neighbour's family is named after one member and hides the rest

#### Unless

the diagram is not a flowchart, since a classDiagram namespace and an erDiagram take no label to show the group's. A box may not fit the target, or a member's label may name two members. The target's detail may not meet its target with the stubs it would need. The plan then draws stubs as before

## Consequences

### Pros

- The streaming platform's Edge tier detail drops from seven stubs to five, one per domain, and each domain's detail boxes the Edge tier's stubs.
- The boutique's Checkout detail drops from nine stubs to six, and its external API group boxes the four Checkout members it hears from.
- The ETL pipeline, ticket graph and multiregion plans draw each group's stubs in one box.
- The compiler's nested Ast overview keeps Node in view, names "Expression (+3)", and no longer draws "Statement (in Statement (+3))".

### Cons

- A box adds a subgraph, which weighs on a detail's score, so a tight detail keeps its bracketed stubs.
- A stub inside a box no longer reads alone, since the box names its group.
- A detail drawing a group whole may show two edges into its stub, from the detail's own region and from a member inside it.
- The contract, the reading and the checker each accept one more stub form.
- The checker accepts one more case of a stub for another group's member.
