---
type: Architecture Decision
title: A refused plan prints the list or table that reads better, a pipeline folds by layer, aggregates draw no relationship twice, and a region holding most of a diagram folds as its parts
description: What a split plan prints in place of a star or dense mesh, and how pipelines, aggregates and outsized regions fold
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-19
provenance: A blind paired rating of 24 plans gave a mean of 3.83 out of 5, every plan correct. A gateway star and a service mesh were refused with a reason alone, and a bare refusal gave a reader nothing to read instead. An ETL pipeline folded each extract with the bronze table it lands in, so its groups mixed two layers. A film rental schema folded its address chain into STORE, which drew CUSTOMER and STAFF twice from one group. A university schema met its target by dropping rows, yet folded a broad COURSE group with 3 new reachable pairs. A compiler's Ast namespace held 13 of 22 classes and folded into one group beside groups of one to five
enforced_in:
  - src/split/alternative.ts starList and meshMatrix, which build the list and the matrix from the parsed graph alone
  - src/split/index.ts refuseFor, which gives a refused star or dense mesh its list or matrix
  - src/split-report.ts outcomeLines and src/rules/complexity.ts withPlan, which print it and point to it
  - src/split/rules.ts RELAXED and src/split/tier2.ts proposeChains, which keep prefix families apart with hubs folded before mixing them
  - src/split/tier6.ts aligner and src/split/plan.ts byGain, which pair a family's nodes in step with the layer beside them
  - src/split/quotient.ts foldedParallels and src/split/plan.ts admits, which refuse an aggregate drawing a relationship beside another
  - src/split/tier4.ts trimmed and drawsParallels, which offer a root's aggregate without its shared parts
  - src/split/plan.ts foldEvenly and aggregatesToo, which fold aggregates past the target only when they add no new reachable pair
  - src/split/tier3.ts isOutsized and src/split/plan.ts planWork, which walk a region holding most of a diagram as its parts first
generated: { by: jpai-mermaidjs-lint, at: 2026-10-19T00:00:00Z }
---

<!-- GENERATED from MJL-0034 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) (a refused star prints its hub and every leaf as a list)
- Extends [MJL-0030](0030-a-group-is-named-where-a-reader-enters-it.md) (a refused dense mesh prints every link as an adjacency matrix)
- Scoped exception to [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) (a tangled erDiagram folds past the target only aggregates adding no new reachable pair)
- Scoped exception to [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) (an aggregate draws no relationship twice, and a root's aggregate may fold trimmed)
- Extends [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) (with hubs folded, prefix families are kept apart before they are mixed, chain stages too)
- Extends [MJL-0032](0032-a-stage-folds-across-lanes-and-a-stub-draws-each-edge-once.md) (a pair of one family sharing more overview neighbours folds first, so layers fold in step)
- Scoped exception to [MJL-0026](0026-a-split-plan-follows-the-authors-structure.md) (a region holding most of a diagram folds as its parts first)
- Excepted by [MJL-0035](0035-a-region-folds-whole-and-a-nested-detail-names-members.md) (a region holding most of a diagram folds whole, its detail split again, not as its parts first)
- Excepted by [MJL-0035](0035-a-region-folds-whole-and-a-nested-detail-names-members.md) (a chain stage may join prefix families, so an extract folds with the bronze table it lands in)

## Decision

### The lens

#### Given

a reader of a refusal has nothing to read but the reason. A reader of an overview counts lines and reads groups as the diagram's own layers. A plan that refuses because a list or table reads better owes the reader that list or table. An overview drawing two lines between one group and one entity reads as two relationships the original does not draw

#### We prefer

printing, in a refused plan's place, the list or table its reason names. A star prints as a markdown list, starting with the node with the most links. Each of its links follows by way, label and connector, each leaf an item. Every other edge follows under its source, and a node no edge touches follows last. A dense mesh prints as a markdown table, a row and a column per node. Each cell holds every edge between its row and column, drawn from the row's side in both cells. A line before the table names the pairs no edge joins. Both are built from the parsed graph alone, and a test reads each back through mdast to find every node and edge. --split-plan prints it after the reason, and the remediation points to it. Under the third set of rules, hubs and branches fold while prefix families stay apart, before a walk mixes them. A chain stage keeps to one family wherever the rules keep families apart. Of two pairs of one family tied on gain and label, T6 takes the one sharing more of its overview neighbours. An aggregate folds only where it draws no relationship beside another between the same two overview nodes that the original draws between other ends. A root whose whole aggregate would draw one is also offered trimmed. Each owned part sharing an outside neighbour with the rest is cut away, and the trimmed fold may add no new reachable pair. Past the target, an aggregate folds only when it adds no new reachable pair. A region holding more than half of a diagram's nodes, beside another region holding nodes, is walked first as its parts. It then folds whole only when its detail fits, under every set of rules, and only when no such walk plans is it folded whole

#### Because

a reader refused a plan still wants the diagram's story. A list of a hub's leaves or a matrix of a mesh tells it in full. A pipeline's layers are the author's own grouping, and a group of two layers hides where one ends. Two lines between one group and one entity read as two relationships, and a lookup chain shared by several owners belongs to none of them. A schema already within its target gains nothing from a fold that makes pairs reachable. One group holding most of a diagram beside small ones reads as that group alone

#### Unless

a plan is refused for another reason, or a diagram names no prefix family. An aggregate may draw no relationship twice, or no region hold most of the diagram. The plan then stands as before

## Consequences

### Pros

- The gateway star prints the gateway with its 3 clients and 34 services as a list.
- The service mesh prints as a 15 by 15 matrix, naming its 11 unlinked pairs.
- The ETL pipeline folds extracts, bronze, silver and gold tables apart, two lanes of extracts feeding two of bronze.
- The film rental schema folds its address chain alone, and the university schema folds 3 tight aggregates with no new reachable pair.
- The compiler's Ast namespace folds as its subtrees, no group holding a third of the diagram.

### Cons

- A star or mesh refusal prints a long list or a wide table.
- The list and the matrix name a node by its label as a reader sees it, so markup inside a label is shown as text.
- A schema whose aggregates all draw a relationship twice keeps more entities in view.
- The compiler plan declares 4 new reachable pairs, where the whole namespace declared 2.
