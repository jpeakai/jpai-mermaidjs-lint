---
type: Architecture Decision
title: A split plan follows the author's structure, and refuses what it cannot draw faithfully
description: Regions fold first, marker states stay in their composite, and concurrency is refused
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-18
provenance: An adversarial evaluation and an independent semantic oracle found plans the first contract accepted that moved start markers, merged duplicate edges, hid regions and merged concurrent regions
enforced_in:
  - src/split/plan.ts, which climbs author regions first and folds patterns evenly
  - src/split/contract.ts and tests/split/faithful.ts, which read every emitted source back through the shipped parsers
  - tests/split/regressions.test.ts, which holds every evaluation repro
generated: { by: jpai-mermaidjs-lint, at: 2026-10-18T00:00:00Z }
---

<!-- GENERATED from MJL-0026 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0025](0025-a-fold-is-offered-as-a-split.md) (how a fold offered as a split is chosen and drawn)
- Extended by [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) (decision regions and erDiagram aggregates fold whole)
- Extended by [MJL-0033](0033-a-plan-folds-what-the-author-grouped-and-refuses-buckets.md) (regions drawn from one template fold to the same depth and are named by the region around them)
- Excepted by [MJL-0034](0034-a-refusal-prints-its-list-or-table-and-folds-stay-tight.md) (a region holding most of a diagram folds as its parts first)
- Extended by [MJL-0035](0035-a-region-folds-whole-and-a-nested-detail-names-members.md) (an author region folds whole however much of a diagram it holds)

## Decision

### The lens

#### Given

a diagram over a threshold can be folded many ways, and some folds change what it says

#### We prefer

folding the author's own regions first and folding repeated patterns evenly.
A state a composite's marker reaches stays in that composite, and each edge between kept nodes is drawn as often as it was written.
Edges from another group start at one stub for that group.
A composite with concurrent regions gets no plan

#### Because

a reader trusts the author's boundaries first.
A plan that moves a marker, merges an edge or joins concurrent regions says something the original does not

#### Unless

no plan meets the contract, when the finding keeps the subgraph hint

## Consequences

### Pros

- Every emitted overview and detail parses back to the original's nodes, regions, edges and markers.
- A diagram with subgraphs is folded along them, as an author would split it.

### Cons

- Some state diagrams with pinned composites or concurrent regions get no plan.
- Drawing region boxes in details costs score, so some details are split again.
