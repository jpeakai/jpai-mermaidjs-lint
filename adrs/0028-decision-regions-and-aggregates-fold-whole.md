---
type: Architecture Decision
title: Decision regions and erDiagram aggregates fold whole, named after their decision or root
description: A decision folds with its single-entry single-exit region, and an entity with the aggregate its root owns
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-19
provenance: A usefulness evaluation rated split plans 3.75 out of 5 on realistic diagrams. A decision-heavy flowchart got no plan under any preset, since every decision was protected and blocked every fold. erDiagram plans folded a junction table into one side, giving lines such as a product joined to a customer group by "receives"
enforced_in:
  - src/split/dominators.ts, which computes dominators and post-dominators by the algorithm of Cooper, Harvey and Kennedy
  - src/split/flow.ts, which finds each decision's single-entry single-exit region
  - src/split/tier2.ts, which folds decision regions innermost first, and chain stages through them
  - src/split/aggregate.ts and src/split/tier4.ts, which group entities by aggregate root and keep junctions out of either side
  - src/split/contract.ts check 6 and tests/split/faithful.ts, which accept a folded decision only inside a whole region, each by its own search
  - tests/split/regions.test.ts and tests/split/tiers.test.ts
generated: { by: jpai-mermaidjs-lint, at: 2026-10-19T00:00:00Z }
---

<!-- GENERATED from MJL-0028 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0026](0026-a-split-plan-follows-the-authors-structure.md) (the author's structure now includes the regions a flow's decisions make and the aggregates an erDiagram's identifying relationships make)
- Extended by [MJL-0029](0029-runs-meshes-and-terminals-read-as-they-are.md) (runs named by range, dense meshes folded by cliques, shared terminals kept in view)
- Excepted by [MJL-0030](0030-a-group-is-named-where-a-reader-enters-it.md) (an aggregate whose root is a lookup is named after its most crossed member)
- Excepted by [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) (any owner's aggregate may fold uncapped, never one swallowing a group over the target)
- Extended by [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) (a tangled erDiagram folds aggregates past the target, down to the share an evened overview keeps)
- Excepted by [MJL-0034](0034-a-refusal-prints-its-list-or-table-and-folds-stay-tight.md) (an aggregate draws no relationship twice, and a root's aggregate may fold trimmed)
- Excepted by [MJL-0038](0038-twin-chains-fold-whole-and-a-pair-names-both-members.md) (a group of two shows the other member's label in place of the count)

## Decision

### The lens

#### Given

some diagrams are mostly decisions, a flowchart or stateDiagram. In others, an erDiagram overview groups entities by leaves and junctions, not by what owns what

#### We prefer

folding a decision with its region, from the decision to its immediate post-dominator, where its branches rejoin. Dominators and post-dominators come from the algorithm of Cooper, Harvey and Kennedy (2001), with a virtual entry and exit. A branch ending at a terminal node is an outcome folded inside the region, not an exit from it. Every edge into the region enters the decision, and every edge out reaches the rejoin node. These are the regions of the program structure tree of Johnson, Pearson and Pingali (1994). Such a fold invents no path, so it belongs to T2, the lossless tier. Regions fold innermost first, are named after their decision, and keep their branch labels in the detail. A chain stage may pass through a folded region. In an erDiagram an entity is owned by its single identifying parent, or as a leaf by the one entity it depends on. T4 folds the largest aggregate whose detail fits, named after its root, or each root's aggregate split again when none fits. A junction identified by two roots folds into neither side, and T5 and T6 keep it in view

#### Because

a decision's branches only make sense together, and a region folded whole keeps them together without adding reachability. Identifying relationships are the author's statement of ownership, so an overview whose edges run between aggregate roots reads as the author's model

#### Unless

a region has a second entry or a second exit. Then the decision stays protected. An erDiagram with no identifying relationship is folded by T5 and T6 as before

## Consequences

### Pros

- Decision-heavy flowcharts get plans that read as a sequence of named checks.
- The declared loss after T2 stays zero, since a decision region adds no reachable pair.
- erDiagram overviews connect aggregate roots, and a junction table stays a junction.

### Cons

- A decision whose branches leave through two different nodes is still protected, so some flows get no region.
- An aggregate split again draws no rows, so more attribute rows are declared dropped.
