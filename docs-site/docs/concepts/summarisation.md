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
Each outside node or group gets one stub.
Two edges from different members of one group into one member, with one label and kind, are drawn once from the group's stub.
The group's own detail draws each of them to that member, so nothing is lost.
A stub for a whole group beside a stub for its namesake member names the member its edges leave.
So `ORDER (+6) from PAYMENT` sits beside `ORDER (in group)`.
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

A large set of twins is cut into runs, each small enough for its detail to meet the target.
The twins are first put in natural order of their labels, so each run reads as an alphabetical volume of an index.
A gateway's twenty services become runs such as `accounts-service … feature-flag-service (+9)`.

### Chains and stages

A run of nodes, each with one edge in and one edge out, is a chain.
Folding part of a chain keeps every path through it, so nothing new becomes reachable.
A long chain is never folded into one node, because a reader would lose how many steps it has.
It is cut into stages, each small enough for its detail diagram to meet the target.

--8<-- "summarise-chain.md"

### Dominators and decision regions

A decision is a step whose branches split the flow, such as a diamond or an edge labelled `Yes`.
Its branches only make sense together, so a plan folds a decision with everything between it and the point where its branches rejoin.

A node d dominates a node v when every path from where the flow enters to v passes through d.
Run on the reversed graph, from where the flow leaves, the same idea gives post-dominators.
The immediate post-dominator of a decision is the nearest node every one of its branches must reach, the rejoin point.
The plan computes both with the iterative algorithm of [Cooper, Harvey and Kennedy (2001)](https://www.cs.tufts.edu/comp/150FP/archive/keith-cooper/dom14.pdf).
It starts from a virtual entry joined to every node nothing leads into, and works towards a virtual exit.

The region from a decision to its rejoin point is single-entry single-exit (SESE).
Every edge into it enters the decision, and every edge out of it reaches the rejoin point.
[Johnson, Pearson and Pingali (1994)](https://doi.org/10.1145/178243.178258) build the program structure tree from these regions, nested one inside another.
A branch that ends the flow, such as `Decline`, is an outcome of the decision, not a way out of its region.
So post-dominators are computed without the nodes where the flow ends, and those nodes fold inside the region.

Folding a SESE region whole invents no path.
Everything that reached the decision reaches the group, and the group reaches only what the rejoin point reaches.
So the fold belongs to `T2`, the lossless tier.
Regions fold innermost first, and each group is named after its decision.
The branch labels stay in the detail diagram, and a chain stage may pass through a folded region.

--8<-- "summarise-regions.md"

A region with a second entry, or a branch leaving through a second node, is not SESE, so its decision stays protected.

### Aggregates

An `erDiagram` says who owns what with identifying relationships, drawn as a solid line.
An entity is owned by its single identifying parent.
With none, an entity with one relationship is owned by the entity it depends on, the one with exactly one at its end.
Owners chain to a root, and an aggregate is a root with everything it owns.
This is the aggregate of domain-driven design, read from the author's own notation.

`T4` folds the largest aggregate whose detail fits, named after its root, so the overview's edges run between roots.
When none fits, it may fold any owner's aggregate and split the detail again.
An aggregate folded over the target is never folded again into its owner's, so no one group takes most of the diagram.
A junction, an entity identified by entities in two aggregates, such as a review joining a product and a customer, is owned by neither.
It stays in the overview, since folding it into one side would draw the other side's relationship onto the wrong root.

--8<-- "summarise-aggregates.md"

### Leaves and the k-core

A leaf is a node with one neighbour.
Folding each leaf into the node it hangs from removes clutter but keeps the hub in view.
Repeated, the folding peels the graph towards its 2-core, the part where every node has at least two neighbours.
[TopoLayout (Archambault, Munzner and Auber 2007)](https://doi.org/10.1109/TVCG.2007.46) treats such trees as topological features, and collapses them before laying out the core.

--8<-- "summarise-leaves.md"

This fold is lossier than the ones above.
Once a leaf sits inside the group of the node it hangs from, the overview may show the group reaching nodes the leaf never could.

### Communities and modularity

When structure alone finds no more folds, the plan looks for communities: sets of nodes with more edges inside than out.
Modularity scores a partition by how far its inside edges exceed what chance would give.
Greedy agglomeration starts with every node alone, then repeatedly merges the pair that gains the most modularity.
The plan merges two nodes an edge joins.
It also merges two nodes of one prefix family that share a neighbour, as two `silver.` tables fed by one quality suite.
They are one stage of a pipeline, which no edge joins.
So a suggested group is always connected, through its own edges or the neighbours its members share, and the contract checks it.
That is the method of [Clauset, Newman and Moore (2004)](https://doi.org/10.1103/PhysRevE.70.066111).

--8<-- "summarise-communities.md"

The plan uses greedy agglomeration because it is deterministic.
Ties are broken by sorted node ids, so the same graph always gives the same plan.
Louvain, the most popular modularity method, visits nodes in random order.
[Traag, Waltman and van Eck (2019)](https://doi.org/10.1038/s41598-019-41695-z) also showed it can return a community that is not connected.
Their Leiden method fixes that, but it still relies on randomness.
Label propagation was rejected for the same reason: its result depends on update order, and it can oscillate.
A merge never crosses an author region, so a suggested group never splits what the author grouped.

### Cliques in a dense mesh

In a dense mesh nearly every pair of nodes is joined, so merging one pair says little.
A mesh counts as dense when its overview joins at least half of all node pairs.
There `T6` also proposes cliques: sets of nodes that all talk to each other.
It finds the maximal cliques of the nodes not yet grouped with the algorithm of [Bron and Kerbosch (1973)](https://doi.org/10.1145/362342.362367).
It uses the pivot rule of [Tomita, Tanaka and Takahashi (2006)](https://doi.org/10.1016/j.tcs.2006.06.015), so each maximal clique is found once.
Nodes are taken in natural order, and ties go to the first.
At most 256 cliques are listed, so the same graph always gives the same cliques.
Each clique is cut into runs whose detail meets the target.
A run ranks by the modularity gained by merging it whole, the sum of its pairs' gains, so a larger clique goes first.

A diagram that is a dense mesh from the start gets no plan.
It counts as one when it joins at least half of all node pairs and more pairs than twice its nodes.
Its nodes then average more than four links.
Folding such a mesh leaves a mesh, since its groups are joined to each other too, and no fold makes it readable.
So the plan is refused with the reason "dense mesh: a matrix or table reads better than a diagram".
The same check runs on each plan's overview, so a plan never offers one, per [MJL-0030](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/adrs/0030-a-group-is-named-where-a-reader-enters-it.md).

### Measures that did not help

Bridges and betweenness are the usual tools for finding where a network divides.
Neither helped on diagrams.
Most architecture diagrams are close to trees, and in a tree every edge is a bridge.
On the shop architecture from [Measuring complexity](complexity.md#the-full-score), most edges are bridges, so a bridge says nothing about where to cut.
Betweenness peaks at the hubs, which are the nodes an overview should keep in view, not fold away.

## The tier ladder

The plan applies its folds in tiers, least lossy first.
A diagram with author regions climbs `T3` first, since a reader finds the author's own boundaries first.
In `T3`, a region folds in one step with every region that echoes it.
An echo is a sibling of the same shape holding regions of its own, or the same-labelled child of an echoing region.
A region's shape is how many nodes it holds and each child region's label and shape.
So two cloud regions with the same subnets fold to the same depth.
Another group may be named after a region of the same label.
A group then takes the label of the region around it in brackets, as `Public subnets (us-east-1) (+2)`.
A plan may split a detail again with new reachable pairs.
It is then walked again holding regions to details that fit, first folding only regions that add no new reachable pair.
That plan is offered when it declares fewer new reachable pairs in all.
When that plan fails, it climbs in the order below.
Within a tier, it applies the fold that saves the most score per node hidden, then measures the overview again.
In `T4`, of two aggregates that save as much, the one leaving fewer edges between overview nodes goes first.
In `T4`, `T5` and `T6`, some folds come within 5% of the best one's saving, or in `T6` its gain.
Of those, the one leaving the fewest parallel edges goes first.
A parallel edge is an overview edge beside another between the same two nodes, at least one of them a group.
A chain folds in even stages and a set of twins in even runs, all in one step.
It stops at the first overview that meets the preset's `nodeTarget` and `vcsTarget`.
No fold may leave the overview with fewer than four nodes, unless the diagram has fewer than eight.

Once the target is met, the plan evens out what it folded.
It does so only while the overview keeps at least 60% of `nodeTarget`, rounded up, so an overview lands near its target.
If a detail then fails its target, the evening goes on below that share, down to the fewest nodes a fold may leave.
A greedy walk can also overshoot below that share, when an early fold leaves a later one needed.
The plan then undoes the group whose undoing gives back the most nodes and still meets every target, until the share is met.
A `T2` group stays, since undoing one run would leave its pattern half folded.
In `T2` it folds the remaining decision regions, so every decision reads alike.
In `T3` it folds the sibling regions of the ones folded, so sibling regions read alike.
In `T4` it folds more aggregates when the `erDiagram` overview is tangled, meeting a cycle for every four nodes.
Each such fold takes away an overview edge per entity it hides and adds no more new reachable pairs than it hides.
A tangled overview folds so even when dropping rows alone meets the target, while a tree-like one stays as it is.
In `T5` and `T6` it gathers what is left open into groups of three or more, no larger than the largest.
When every label leads with an id naming a family, such as `PLAT-1201`, `T6` first folds each family whole, hubs included.
A family too large for one detail folds as even contiguous runs, each connected.
Once a family folds, the evening takes only families, below the 60% share, and a family's group is never undone.
A detail diagram must meet the same targets, and one that does not is split once more.
A plan names the last tier that changed it.

`T5` and `T6` follow five rules, so the overview still tells the diagram's story:

- **Hubs stay in view.** A hub is a node of degree at least four and at least the 90th percentile degree. It keeps its own overview node, and the leaves hanging from it fold beside it as one group. An `erDiagram` never merges two relationship labels, so there its leaves stay open.
- **Shared terminals stay in view.** A shared terminal is a flowchart or `stateDiagram` node that at least three other nodes lead into and that ends the flow, by directed edges. It leads nowhere, or everything it leads to leads nowhere. A `Notify on-call` step every failure ends at is one, and so is a final `Refunded` state. So is a `Cancelled` state that leads only to `Refunded` and `Voided`. Folded into one branch's group, it would read as that branch's own end.
- **A decision's branches stay apart.** A decision is a node whose outgoing edges carry two labels or more, in a flowchart or a `stateDiagram`. Two targets of its differently labelled branches never share a group, unless one reaches the other, or both reach a common member, inside the group.
- **A group keeps to one prefix family.** A prefix family is the dotted prefix leading a label, such as `bronze.`. Failing that, it is the letters leading an id-led label, such as `PLAT-`. Failing that, it is the letters and underscore leading an id, such as `br_`. Failing that, a label leading with a bare id takes a status stem it shares with another. So `10008 Ready for Release` and `10009 Released` share `releas`. No suggested group holds members of two families. In `T6`, a pair within one family goes before any other pair, joined by an edge or by a neighbour they share.
- **Every group hides two nodes or more.** Once the target is met, a group hiding one node is undone when the overview and every detail still meet the target without it. Otherwise it is merged into a neighbouring node or suggested group. One that can be neither stays. A decision region from `T2` hiding one node is undone the same way. It is never merged, since a merged region would no longer be a region.

When the target cannot be met under these rules, the plan is walked again with prefix families mixed.
When that fails, it is walked with hubs and branches folded too, while shared terminals stay in view.
When that fails too, it is walked without the first four rules, and the last still holds.
As a last resort, the plan is walked once more with groups that hide one node allowed.
A decision node drawn as a diamond, a fork, a join and a choice are protected on every walk.
Each folds only with a whole decision region or author region around it.
An `erDiagram` junction between two aggregates is kept in view under the first two rules, like a hub.

A plan may group only runs of one hub's sibling leaves, each named only by a range.
It is refused when those groups hold more than half the diagram.
Nothing the author drew sorts those leaves, so the groups would be alphabetical buckets, and a list reads better.

The declared loss is the number of pairs of overview nodes where one reaches the other in the overview but not in the original.
The plan reports it after each tier.

| Tier | What it folds | What it may lose |
|---|---|---|
| `T1` | No nodes. It leaves attribute rows out of the overview. | Nothing. A detail draws its members' rows when they fit, and row diagrams draw the rest. No reachable pair. |
| `T2` | Twins, bundles of sibling leaves, chain stages, and decision regions, innermost first | Nothing. The declared loss after `T2` must be zero. |
| `T3` | Author regions, innermost first: subgraphs, composite states and namespaces | New reachable pairs between nodes folded into one region |
| `T4` | `erDiagram` aggregates: the largest aggregate that fits, named after its root, or after its most crossed member when the root is a lookup. A junction stays out of both sides. | New reachable pairs. Cardinalities are never merged. |
| `T5` | Leaves into the node they hang from, repeated, or beside it as one group when it is a hub | New reachable pairs through the group |
| `T6` | Suggested groups from greedy modularity, over pairs an edge joins, within one prefix family first, with pairs of one family sharing a neighbour too, alike labels breaking ties, and tight cliques once the overview is dense | New reachable pairs, and groups the author may not recognise |

## What "meaning is preserved" means

A plan is offered only when a contract passes, and `src/split/contract.ts` checks it on every plan.
The contract is what this page means by "meaning is preserved".

- **Sound.** Every original node is in exactly one overview node. A suggested group is connected. Two members are joined by an edge, or by an author region the group folds whole. They are also joined by a neighbour they share, when both name one prefix family or both are leaves. Each overview edge stands for original edges, in the same direction, and none is invented. The one exception is an undirected edge, below.
- **Sound attributes.** An overview edge keeps a label or an arrow kind only when every edge it stands for agrees.
- **Recoverable.** The overview and the details give back exactly the original nodes and edges, with their labels and kinds. Each edge between two groups is drawn exactly in its source's detail. Its target's detail draws it once for every edge from the source group into that member that draws alike.
- **Labels from data.** A group's label is an author label or a member's label, followed by a count of the rest, such as `Web (+3)`. A long label is cut in its middle with an ellipsis, and a label another node shows adds the group's id.
- **Honest ranges.** A range label, such as `DATA-0381 … DATA-0383 (+1)`, is the group's first and last member labels in natural order. Its count is of the members neither names. No member of another group has a label from the first to the last.
- **One reading per stub.** A stub's text is read by every form a plan writes, against every label the diagram and its groups show, and has exactly one reading. A text that could name two things adds the id it stands for, as often as it takes.
- **Stub forms.** A stub for a kept node shows that node's label. `Refunded (Delivered)` is the member Refunded inside the group labelled Delivered. `Delivered (in group)` is the member Delivered inside the group named after it. `ORDER (+6) from PAYMENT` is the whole group, drawn from its member PAYMENT, beside `ORDER (in group)`, and PAYMENT must draw every edge the stub draws.
- **Undirected edges written both ways.** Take a link with no arrowhead or end marker, written both ways between two overview nodes, at least one a group. When both ways agree on kind and label, the overview draws it once. Each detail draws each one as written, and the plan declares how many the overview draws the other way.
- **Merged start and end transitions.** The overview draws a start or end marker's transitions into one group as one transition onto the group, labelled only when they all agree. The group's detail draws each as written, and the plan declares how many were merged.
- **Protected nodes.** A decision node, a fork, a join, a choice and a composite state stay visible, unless a whole region around them folds. That region is an author region, or a decision region that is single-entry single-exit in the original graph, every node of which the group holds. So does a state a composite's start or end marker reaches, unless that composite folds whole.
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
A group without an author label is named after one of its members.
In a flowchart or `stateDiagram`, a chain-like group is named after its entry, the member no other member leads into.
A group is chain-like when its members form one directed path, so a pipeline's first group reads `git push to main (+5)`, not its exit.
Twin chains, several disjoint paths, are named after the entry the flow reaches first, then the first by label.
They are never named by a range across two stages.
Any other suggested group, from `T5` or `T6`, is named after the member on its main path.
That is the member with the most edges crossing the group's boundary, a start or end transition counted as one.
A tie goes to the member the flow reaches first from where it enters the diagram.
Any other group is named after its best-connected member.
An aggregate is named after its root, unless the root is a lookup, every edge of which joins one other member.
Then it is named after the member with the most edges crossing its boundary, so Sakila's `LANGUAGE` and `FILM` read `FILM (+1)`.

Some groups hold members no single label names.
These are twins, sibling leaves, and members whose labels all lead with an id, such as `S10004` or `10011 Wont Do`.
Such a group is named by a range: its first and last member labels in natural order, joined by a spaced ellipsis.
An example is `10002 Backlog … 10011 Wont Do (+1)`, where the count is of the members neither end names.
A range is offered for three members or more, with no markup, within 40 characters.
It must not mislead a reader.
So it is refused when a member of another group has a label from its first to its last.
A reader would look for that member here.
An author region's label and a decision region's question still come first.
An id-led group with no honest range is named by its first label in natural order, so `10002 Backlog (+2)` rather than a side state.

In `T6`, a pair within one prefix family goes before any other.
Under the strict rules, a pair across two families is never proposed.
A family is a dotted prefix leading a label, such as `bronze.`, or the letters leading an id-led label, such as `PLAT-`.
Failing that, it is letters and an underscore leading an id, such as `br_`.
Failing that, for a label leading with a bare id, it is the one status stem the label shares with another such label.
So `10008 Ready for Release` and `10009 Released` form one family, and no other status of that workflow joins it.
When families are mixed, a pair across two still loses a tie between equal gains.
Among the rest, the pair with alike labels goes first.
Two nodes no edge joins pair only when they name one family and share a neighbour, however alike their labels.

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
| `flowchart`, `flowchart-elk`, `graph` | Yes | Subgraphs | A decision node folds only with its decision region. |
| `stateDiagram` | Yes | Composite states | A fork, a join and a choice fold only with a whole region. A state's description lines are carried with it. A diagram with concurrent regions is not split. |
| `erDiagram` | Yes | None | `T4` folds aggregates by root, and keeps junctions out of both sides. Attribute rows are drawn in details and row diagrams, and any that fit in none are counted. |
| `classDiagram` | Yes | Namespaces | Members are drawn like attribute rows. A stub carries a `<<stub>>` annotation and a group a `<<group>>` one, since the grammar takes no dashed style. A lollipop interface is never folded: the overview hangs it from the group folding its class. |
| `sequenceDiagram` | No | None | The graph drops message order, so a fold would lose the story. The finding keeps its subgraph hint. |

Every other type is not planned, and its finding keeps the subgraph hint.

## A worked example

The site build plans two diagrams under every preset, with the split code itself.
Each overview, detail, tier and loss below is what `splitPlan` returns, never typed by hand.
Each plan's `ladder` line lists the overview after each tier that changed it.
So every preset shows the climb to the tier that met its target.

### The diagram

This shop architecture has more services than the one on [Measuring complexity](complexity.md#the-full-score), and four author subgraphs.
It scores 62.7.

--8<-- "summarisation/architecture.md"

### Each preset's plan

A smaller target needs more folding, so it climbs further up the ladder.

--8<-- "summarisation/presets.md"

### Low density

Under `low-density`, the plan selects `T5`.
Folding author regions in `T3`, then a chain stage and twins in `T2`, did not reach this target.
So in `T5` leaves fold into the nodes they hang from.

--8<-- "summarisation/low-density.md"

### Medium density

Under `medium-density`, the plan selects `T5`.
It climbs the same steps, `T3`, `T2` and `T5`, but the larger target leaves more of the diagram as the author drew it.

--8<-- "summarisation/medium-density.md"

### High density

Under `high-density`, the plan selects `T3`.
Folding author regions in `T3` is enough to reach this target.

--8<-- "summarisation/high-density.md"

## A decision-heavy example

The second diagram is a loan underwriting flow with no author subgraphs, where most steps are decisions.
Every decision is protected, so before decision regions no tier could fold it under any preset.
It scores 65.

--8<-- "summarisation/decisions.md"

### Each preset's plan

Each group named after a question is a decision region: the decision with its branches and outcomes, up to where they rejoin.

--8<-- "summarisation/decisions-presets.md"

### Low density, decisions

Under `low-density`, the plan selects `T5`.
Decision regions and chain stages through them, in `T2`, leave the overview just over its target.
So in `T5` a leaf folds into the node it hangs from.

--8<-- "summarisation/decisions-low-density.md"

### Medium density, decisions

Under `medium-density`, the plan selects `T2`.
Decision regions in `T2` alone reach the target, and the remaining ones fold evenly.

--8<-- "summarisation/decisions-medium-density.md"

### High density, decisions

Under `high-density`, the plan selects `T2`.
Fewer regions fold in `T2`, so more of the decisions stay in view.

--8<-- "summarisation/decisions-high-density.md"
