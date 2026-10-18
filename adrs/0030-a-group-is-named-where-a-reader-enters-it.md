---
type: Architecture Decision
title: A group is named where a reader enters it, a dense mesh is refused, and a state that ends the flow stays in view
description: How a split plan names, refuses and keeps nodes so its overview reads as the diagram does
tags: [complexity, split]
status: accepted
accepted_on: 2026-10-19
provenance: A blind evaluator rated 24 plans at a mean of 3.58 out of 5, with every plan correct. The Sakila overview named FILM's aggregate after the LANGUAGE lookup it hangs from, so it read "LANGUAGE casts FILM_ACTOR". A CI pipeline's first group was named after its exit, "tsc --noEmit", not "git push". Twin extract-and-load chains were named "bronze.accounts (+7)". A fifteen-node service mesh got an eleven-node overview joining every pair. A Cancelled state every failed payment reaches was folded into the happy path's group. A detail drew one stub edge twice, an overview scattered five parallel erDiagram edges between two groups, and a decision region hid a single node
enforced_in:
  - src/split/quotient.ts, whose chainEntries and rankedMembers name a chain-like group by its entry, and whose labelChoices names an aggregate with a lookup root by its most crossed member
  - src/split/assemble.ts, which offers no range for twin chains, and src/split/tier2.ts, which orders twin chains by their entries
  - src/split/stem.ts and src/split/tier6.ts, which break a tie between equal gains against a pair that mixes two pipeline stages
  - src/split/index.ts, which refuses a dense mesh before planning and an overview that is one
  - src/split/rules.ts, whose shared terminal also covers a node whose every successor leads nowhere
  - src/split/quotient.ts detailView, which draws edges from one group that would repeat from a stub each
  - src/split/graph.ts byOverviewEdge and src/split/contract.ts check 8, which order an overview's edges by the pair they join
  - src/split/plan.ts better, which prefers the aggregate leaving fewer overview edges at an equal saving
  - src/split/plan.ts tidy, which undoes a decision region hiding one node when the target still holds
generated: { by: jpai-mermaidjs-lint, at: 2026-10-19T00:00:00Z }
---

<!-- GENERATED from MJL-0030 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0029](0029-runs-meshes-and-terminals-read-as-they-are.md) (how groups are named and when a dense mesh is planned at all, beyond ranges, cliques and terminals)
- Scoped exception to [MJL-0028](0028-decision-regions-and-aggregates-fold-whole.md) (an aggregate whose root is a lookup is named after another member, not its root)
- Extended by [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) (stubs drawn apart for one group are told apart by the member each one's edges leave)
- Excepted by [MJL-0031](0031-a-plan-keeps-groups-even-and-names-each-stub-once.md) (under the strict rules a pair never crosses two prefix families)

## Decision

### The lens

#### Given

a group's name is the first thing a reader reads of it, and the overview's edges are read between those names. Some diagrams cannot be summarised by folding at all, and some states end every failure path without being sinks themselves

#### We prefer

naming a chain-like group in a flowchart or stateDiagram after its entry, the member no member leads into. A chain-like group's members form one directed path, or several disjoint ones for twin chains. Twin chains are named after the entry the flow reaches first, then the first by label, and never by a range spanning two stages. An aggregate whose root is a lookup is named after the member with the most edges crossing the group's boundary. A lookup root is one every edge of which joins one other member. A pair that would mix two pipeline stages, read from a dotted label prefix such as bronze. or an id prefix such as br_, loses a tie between equal modularity gains, and only a tie. A dense mesh is refused with the reason "dense mesh: a matrix or table reads better than a diagram". A graph is a dense mesh when it joins at least half of all its node pairs and more pairs than twice its nodes. Its nodes then average more than four links. The check runs on the diagram before planning and on each plan's overview after it. A shared terminal also covers a node at least three nodes lead into whose every successor leads nowhere. An example is Cancelled, leading only to Refunded and Voided. Two edges from different members of one outside group can draw one edge twice in a detail. Each then gets a stub of its own, when the detail still meets its target, as its rows are drawn. An overview's edges are ordered by the pair of nodes they join, whichever way each is written, so parallel edges sit side by side. Of two aggregates that save as much score per node hidden, the one leaving fewer edges between overview nodes goes first. A decision region hiding one node is undone when the overview and every detail still meet the target without it. That is how a suggested group hiding one node is undone, but a region is never merged into a neighbour

#### Because

a reader enters a chain where it starts, and a lookup's name says nothing of the aggregate whose edges all leave from another member. Folding a dense mesh leaves a dense mesh, since its groups are joined to each other too, so no fold makes it readable. A state every failure ends at reads as one branch's end when folded into that branch. One edge drawn twice from one stub reads as a duplicate, not as two sources

#### Unless

a group has an author region or a decision region's head, whose label still comes first. An erDiagram keeps every parallel edge, since cardinalities and labels are never merged

## Consequences

### Pros

- The Sakila overview reads "FILM (+1) casts FILM_ACTOR", and a pipeline's first group reads "git push to main (+5)".
- A mesh gets a reason a reader can act on, not an overview that still joins every pair.
- A happy path's group no longer hides the state its failures end at.

### Cons

- A detail may hold one more stub than before, so its target is met a little later.
- A stage read from an id prefix can be wrong, which is why it only breaks ties.
- A dense diagram that a reader might still want folded gets no plan.
