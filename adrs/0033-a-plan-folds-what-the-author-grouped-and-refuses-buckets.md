---
type: Architecture Decision
title: A plan folds ticket families whole, echoing regions alike and tangled aggregates, refuses alphabetical buckets, and draws a group whole or as members
description: How a split plan treats stars, tangled schemas, ticket families, echoing regions and groups joined both ways
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-19
provenance: A blind paired rating of 24 plans gave a mean of 3.79 out of 5, every plan correct. A gateway with 34 leaf services got three groups named "accounts-service … feature-flag-service", which carry no meaning. A university schema met its target by dropping rows alone, so its overview kept all 23 entities and 30 relationships. A film rental schema folded only LANGUAGE into FILM, leaving a 15-node overview of the original. A Jira epic graph split PLAT tickets across two groups and five loose hubs. A two-region cloud diagram folded us-east-1 whole and eu-west-1 into three subnets, so two groups showed "Public subnets (+2)" and a detail split again declared 9 new reachable pairs. An order lifecycle detail drew ReturnRequested as two stubs, and three labelled transitions from one group into Allocating side by side
enforced_in:
  - src/split/index.ts isStar and STAR, which refuse a plan whose every group is a range of one star's sibling leaves
  - src/split/plan.ts aggregatesToo, tangled and evenOut, which fold aggregates evenly in a tangled erDiagram, each fold taking an overview edge away per entity it hides
  - src/split/tier6.ts idFamilies and src/split/plan.ts byFamilies, which fold each id family whole, hubs and all, or in even contiguous runs
  - src/split/tier3.ts echoesOf and proposeT3, which fold echoing regions in one step
  - src/split/plan.ts fitting and nestedLoss, which prefer a plan holding regions to details that fit when it declares fewer new reachable pairs in all
  - src/split/quotient.ts qualifiedLabel, src/split/assemble.ts optionsOf, and src/split/contract.ts qualifiedLabels, which name echoing regions apart by the region around them
  - src/split/quotient.ts exactSide, detailView, halfKey and halfOf, which draw a group joined both ways whole or as members, and edges alike one way between a group's stub and a member once
  - src/split/contract.ts recovered, wantedHalves and detailNodes, which read a half edge from either side and refuse a group drawn whole beside a stub for its member
generated: { by: jpai-mermaidjs-lint, at: 2026-10-19T00:00:00Z }
---

<!-- GENERATED from MJL-0033 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0030](0030-a-group-is-named-where-a-reader-enters-it.md) (a star of leaves sorted by nothing is refused, as a dense mesh is)
- Scoped exception to [MJL-0029](0029-runs-meshes-and-terminals-read-as-they-are.md) (sibling-leaf runs named by range are not offered when they are every group of one star)
- Extends [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) (a tangled erDiagram folds aggregates past the target, down to the share an evened overview keeps)
- Scoped exception to [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) (id families fold whole below the share an evened overview keeps, and a family group is never undone)
- Extends [MJL-0032](0032-a-stage-folds-across-lanes-and-a-stub-draws-each-edge-once.md) (in a ticket graph a whole id family folds before any pair, hubs included)
- Extends [MJL-0026](0026-a-split-plan-follows-the-authors-structure.md) (regions drawn from one template fold to the same depth and are named by the region around them)
- Scoped exception to [MJL-0032](0032-a-stage-folds-across-lanes-and-a-stub-draws-each-edge-once.md) (a group is drawn whole or as its members, never both, and like edges to a member draw once)

## Decision

### The lens

#### Given

a reader of an overview reads its groups as the diagram's own structure. The reader compares regions drawn from one template side by side, and counts relationships as lines. A ticket key or a template is the author's own grouping, and an alphabetical range is no grouping at all

#### We prefer

refusing a plan whose every group is a run of sibling leaves of one twin class, named only by a range. Such groups must hold more than half the diagram. The reason given is "a star of leaves around one node, which no label, shape or neighbour sorts: a list reads better". An erDiagram overview is tangled when its independent cycles, edges less nodes plus one, number at least a quarter of its nodes. A tangled one folds aggregates once the target is met, even by dropping rows alone. Each fold must take away an overview edge per entity it hides and add no more new reachable pairs than it hides. It stops at 60% of node_target. When every label leads with an id naming a prefix family, as PLAT-1201, T6 first offers each family whole, hubs included. A family whose detail does not fit is offered as even contiguous runs in natural order, each connected, in one step. Once one family folds, the evening takes only families, down to the fewest nodes a fold may leave. Loosening never undoes a family's group. Two regions echo when they are siblings of one shape holding regions of their own, or children of echoing regions with one label and shape. A region's shape is its own node count and each child region's label and shape. T3 folds a region with all its echoes in one step, and waits for an echo not yet ready. Another group may be named after a region of the same label. A region's group then takes the label of the region around it in brackets, as "Public subnets (us-east-1) (+2)". It sits in that region in the overview and counts every member. A plan whose details split again with new reachable pairs is walked again, holding regions to details that fit. That walk first folds only regions adding no new reachable pair. It is offered when it declares fewer new reachable pairs in all. When edges join two groups both ways, one detail draws every edge between them exactly, with stubs for the other's members. That is the detail needing stubs for fewer members, then the first group by key. The other detail draws the group as one stub, with each edge into it from a member read as a half edge. No detail draws a group whole beside a stub for one of its members. The edges of one kind one way between a group's stub and one member draw once. They keep only the label and cardinality they all share, and an erDiagram keeps one per label and cardinality, as the overview does

#### Because

alphabetical buckets give a reader nothing to find, while a list of the leaves gives the same in reading order. An overview of every entity and relationship is the original with its rows hidden, and aggregates are the structure an erDiagram carries. A tree-like overview already reads, so it stays as it is. A ticket family scattered across groups and loose hubs reads as noise, while one group per family reads as the author's plan. Two regions drawn from one template folded to different depths read as different things. Their groups need names a reader can tell apart without an id. One outside group drawn twice in one detail reads as two things, and three lines from one stub into one member read as three sources

#### Unless

a plan has no star, or a diagram has no aggregate that takes an edge away per entity. Labels may name no id family, or regions echo none. The plan then stands as before

## Consequences

### Pros

- The gateway is refused with a reason rather than offered alphabetical buckets.
- The university and film rental overviews fold their aggregates, and the WordPress tree stays at rows dropped.
- The Jira epic graph shows one group per ticket family and no loose node.
- The two cloud regions fold into three subnets each, named apart, with no new reachable pair and no detail split again.
- No detail draws one group as two stubs, and the order lifecycle's returns fold into one group.

### Cons

- A star of interchangeable leaves gets no plan, where a split was offered before.
- An id-family overview may land below 60% of node_target.
- A qualified label is longer, and the contract and both test readers accept one more form.
- A detail on the side drawn whole no longer shows which member of the other group an edge reaches.
- An edge drawn once for several no longer shows a label they do not share.
