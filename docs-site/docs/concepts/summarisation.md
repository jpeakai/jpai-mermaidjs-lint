# Summarising a diagram

A complexity finding says a diagram is too big.
A split plan says where to cut it.
This page explains how a plan is found, what it promises, and what it leaves to the author.

## Why a split plan, not a fix

Splitting a diagram changes what it says, so no complexity rule has a fixer, per [MJL-0004](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/adrs/0004-complexity-is-never-autofixed.md).
A fold on its own would be a smaller diagram with less in it.
That is a summary that drops what it folds, and a reader could not tell what went missing.

A split plan keeps everything.
It has two halves:

- **An overview** keeps the diagram's shape, with some sets of nodes folded into one group node each.
- **One detail diagram per group** shows that group's members and every edge between them.

A dashed stub in a detail stands for each outside node an edge reaches, or for a whole group an edge comes in from.
Together the overview and the details recover every original node and edge.
The plan is still a recommendation that a human applies, per [MJL-0025](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/adrs/0025-a-fold-is-offered-as-a-split.md).
`--split-plan` prints it, the node count and score rules end their remediation with it, and nothing writes it to a file.

The shape follows Shneiderman's mantra: [overview first, zoom and filter, then details on demand](https://doi.org/10.1109/VL.1996.545307).
It also follows the limits of working memory.
[Miller (1956)](https://doi.org/10.1037/h0043158) put the span near seven items, and [Cowan (2001)](https://doi.org/10.1017/S0140525X01003922) revised it down to about four chunks.
A group node is a chunk: one name the reader holds in place of its members.
[Moody (2009)](https://doi.org/10.1109/TSE.2009.67) names modularisation and hierarchy as the tools for managing a notation's complexity, and a plan uses both.

## The graph theory

Summarising a graph is an old problem with a large literature.
The plan borrows a handful of its ideas, chosen because each is deterministic and each makes a claim that can be checked.

### Quotient graphs

Partition the nodes into blocks, and draw one node per block.
Two blocks are joined when some original edge runs between their members.
The result is a quotient graph, and every overview is one.

[Tian, Hankins and Patel (2008)](https://doi.org/10.1145/1376616.1376675) build summaries this way, grouping nodes that agree on attributes and relationships.
[Navlakha, Rastogi and Shrivastava (2008)](https://doi.org/10.1145/1376616.1376661) add corrections, a list of edges to add or remove, so the summary can be expanded back exactly.
A detail diagram plays the part of a correction: it holds what the overview folded.

The strongest blocks are the author's own.
A flowchart subgraph, a composite state and a class namespace each say "these belong together" in the author's words.
Folding one gives a group node that carries the author's label.

--8<-- "summarise-quotient.md"

### Twins and modules

Two nodes are twins when they have the same neighbours, joined by edges with the same labels and arrows.
One node can stand for both, and nothing that reached one or the other changes.
Twins are the smallest case of a module: a set of nodes that every outside node treats alike.
Modular decomposition finds every module of a graph, nested as a tree.

[Royer and colleagues (2008)](https://doi.org/10.1371/journal.pcbi.1000108) draw protein networks as power graphs, where a module becomes one power node.
They report that this removes a large share of the edges without losing any.
A bundle of sibling leaves is the simplest module of all: pendants of one node, each with the same kind of edge.

--8<-- "summarise-twins.md"

### Chains and stages

A run of nodes, each with one edge in and one edge out, is a chain.
Folding part of a chain keeps every path through it, so nothing new becomes reachable.
A long chain is never folded into one node, because a reader would lose how many steps it has.
It is cut into stages, each small enough for its detail diagram to meet the target.

--8<-- "summarise-chain.md"

### Leaves and the k-core

A leaf is a node with one neighbour.
Folding each leaf into the node it hangs from removes clutter but keeps the hub in view.
Repeated, the folding peels the graph towards its 2-core, the part where every node has at least two neighbours.
[TopoLayout (Archambault, Munzner and Auber 2007)](https://doi.org/10.1109/TVCG.2007.46) treats such trees as topological features, and collapses them before laying out the core.

--8<-- "summarise-leaves.md"

This fold is lossier than the ones above.
Once a leaf sits inside its hub's group, the overview may show the group reaching nodes the leaf never could.

### Communities and modularity

When structure alone finds no more folds, the plan looks for communities: sets of nodes with more edges inside than out.
Modularity scores a partition by how far its inside edges exceed what chance would give.
Greedy agglomeration starts with every node alone, then repeatedly merges the pair that gains the most modularity.
The plan only merges two nodes an edge joins, so a suggested group is always connected.
That is the method of [Clauset, Newman and Moore (2004)](https://doi.org/10.1103/PhysRevE.70.066111).

--8<-- "summarise-communities.md"

The plan uses greedy agglomeration because it is deterministic.
Ties are broken by sorted node ids, so the same graph always gives the same plan.
Louvain, the most popular modularity method, visits nodes in random order.
[Traag, Waltman and van Eck (2019)](https://doi.org/10.1038/s41598-019-41695-z) also showed it can return a community that is not connected.
Their Leiden method fixes that, but it still relies on randomness.
Label propagation was rejected for the same reason: its result depends on update order, and it can oscillate.
A merge never crosses an author region, so a suggested group never splits what the author grouped.

### Measures that did not help

Bridges and betweenness are the usual tools for finding where a network divides.
Neither helped on diagrams.
Most architecture diagrams are close to trees, and in a tree every edge is a bridge.
On the shop architecture from [Measuring complexity](complexity.md#the-full-score), most edges are bridges, so a bridge says nothing about where to cut.
Betweenness peaks at the hubs, which are the nodes an overview should keep in view, not fold away.

## The tier ladder

The plan applies its folds in tiers, least lossy first.
A diagram with author regions climbs `T3` first, since a reader finds the author's own boundaries first.
When that plan fails, it climbs in the order below.
Within a tier, it applies the fold that saves the most score per node hidden, then measures the overview again.
A chain folds in even stages and a set of twins in even runs, all in one step.
It stops at the first overview that meets the preset's `nodeTarget` and `vcsTarget`.
Once there, it folds the sibling regions of the ones folded, so the plan reads evenly.
No fold may leave the overview with fewer than four nodes, unless the diagram has fewer than eight.
The evening steps can leave the overview well below the target, since they favour even groups over a full target.
In `T5` and `T6` it gathers what is left open into groups no larger than the largest.
A detail diagram must meet the same targets, and one that does not is split once more.
A plan names the last tier that changed it.

The declared loss is the number of pairs of overview nodes where one reaches the other in the overview but not in the original.
The plan reports it after each tier.

| Tier | What it folds | What it may lose |
|---|---|---|
| `T1` | No nodes. It leaves attribute rows out of the overview. | Nothing. A detail draws its members' rows when they fit, and row diagrams draw the rest. No reachable pair. |
| `T2` | Twins, bundles of sibling leaves, and chain stages | Nothing. The declared loss after `T2` must be zero. |
| `T3` | Author regions, innermost first: subgraphs, composite states and namespaces | New reachable pairs between nodes folded into one region |
| `T4` | `erDiagram` aggregates: a root with the weak entities it identifies, and a junction table into the smaller entity it joins | New reachable pairs. Cardinalities are never merged. |
| `T5` | Leaves into the node they hang from, repeated | New reachable pairs through the hub's group |
| `T6` | Suggested groups from greedy modularity, over pairs an edge joins, with alike labels breaking ties | New reachable pairs, and groups the author may not recognise |

## What "meaning is preserved" means

A plan is offered only when a contract passes, and `src/split/contract.ts` checks it on every plan.
The contract is what this page means by "meaning is preserved".

- **Sound.** Every original node is in exactly one overview node. Each overview edge stands for original edges, in the same direction, and none is invented.
- **Sound attributes.** An overview edge keeps a label or an arrow kind only when every edge it stands for agrees.
- **Recoverable.** The overview and the details give back exactly the original nodes and edges, with their labels and kinds.
- **Labels from data.** A group's label is an author label or a member's label, followed by a count of the rest, such as `Web (+3)`. A long label is cut in its middle with an ellipsis, and a label another node shows adds the group's id.
- **One reading per stub.** A stub's text is read by every form a plan writes, against every label the diagram and its groups show, and has exactly one reading. A text that could name two things adds the id it stands for, as often as it takes.
- **Stub forms.** A stub for a kept node shows that node's label. `Refunded (Delivered)` is the member Refunded inside the group labelled Delivered. `Delivered (in group)` is the member Delivered inside the group named after it.
- **Merged start and end transitions.** The overview draws a start or end marker's transitions into one group as one transition onto the group, labelled only when they all agree. The group's detail draws each as written, and the plan declares how many were merged.
- **Protected nodes.** A decision node, a fork, a join, a choice and a composite state stay visible, unless a whole region around them folds. So does a state a composite's start or end marker reaches, unless that composite folds whole.
- **Declared loss.** The new reachable pairs the plan reports are recounted, and must be zero after `T2`.
- **Order independent.** Every tie is broken by sorted ids, so reordering the statements of a diagram gives the same plan.
- **Round trip.** Every emitted diagram parses again with the shipped parsers, and its measured size meets the target.

The contract does not promise everything a reader might assume.

- **Groups may not match intent.** A plan groups by structure and label stems, not by what the author meant.
- **The overview can overstate reachability.** That loss is declared, not prevented, from `T3` onwards.
- **A folded edge can lose its label.** When the edges a group edge stands for disagree, it carries none, and the detail keeps each one.
- **Layout is not kept.** Mermaid lays out each emitted diagram afresh.

## Label language

Labels feed grouping in two places.
A group without an author label is named after its best-connected member.
In `T6`, when two merges gain the same modularity, the pair with alike labels goes first.
Two nodes no edge joins never pair, however alike their labels.

Labels are compared by stems.
Each label is split into words by the platform's word segmenter.
Each word is reduced to its stem by the [`stemmer`](https://www.npmjs.com/package/stemmer) package, which implements Porter's algorithm.
Two labels score by the Jaccard overlap of their stems.
A role word, such as `service`, `queue` or `DB`, weighs less than a domain word.
So `Order service` and `Orders DB` are close, and `Order service` and `Payment service` are not.
An id-like label, such as `A` or `N12`, says nothing about meaning, so it adds nothing.

Compromise, a maintained natural-language library, was evaluated for the same job.
The sibling package `jpai-prose-gates` uses it to measure how well a paragraph's sentences hang together.
On diagram labels it gave the same groupings as the stemmer, for an install of about 4.4 MB, so it was not adopted.

## Per diagram type

| Diagram type | Planned | Its regions | Notes |
|---|---|---|---|
| `flowchart`, `flowchart-elk`, `graph` | Yes | Subgraphs | A decision node is protected. |
| `stateDiagram` | Yes | Composite states | A fork, a join and a choice are protected. A state's description lines are carried with it. A diagram with concurrent regions is not split. |
| `erDiagram` | Yes | None | `T4` folds aggregates. Attribute rows are drawn in details and row diagrams, and any that fit in none are counted. |
| `classDiagram` | Yes | Namespaces | Members are drawn like attribute rows. A stub carries a `<<stub>>` annotation and a group a `<<group>>` one, since the grammar takes no dashed style. A lollipop interface is never folded: the overview hangs it from the group folding its class. |
| `sequenceDiagram` | No | None | The graph drops message order, so a fold would lose the story. The finding keeps its subgraph hint. |

Every other type is not planned, and its finding keeps the subgraph hint.

## A worked example

The site build plans one diagram under every preset, with the split code itself.
Each overview, detail, tier and loss below is what `splitPlan` returns, never typed by hand.

### The diagram

This shop architecture has more services than the one on [Measuring complexity](complexity.md#the-full-score), and four author subgraphs.
It scores 62.7.

--8<-- "summarisation/architecture.md"

### Each preset's plan

A smaller target needs more folding, so it climbs further up the ladder.

--8<-- "summarisation/presets.md"

### Low density

Under `low-density`, the plan selects `T5`.
Folding author regions did not reach this target, so leaves fold into the nodes they hang from.

--8<-- "summarisation/low-density.md"

### Medium density

Under `medium-density`, the plan selects `T5`.
The larger target leaves more of the diagram as the author drew it.

--8<-- "summarisation/medium-density.md"

### High density

Under `high-density`, the plan selects `T3`.
Folding author regions is enough to reach this target.

--8<-- "summarisation/high-density.md"
