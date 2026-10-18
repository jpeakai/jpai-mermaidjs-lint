# Measuring complexity

A diagram stops helping once a reader cannot hold it in mind.
The complexity rules put a number on that point, so a review can say "split this" without an argument about taste.

## Two measures

**Node count** is the number of nodes mermaid's parser reads from the diagram.
What counts as a node depends on the diagram type, as [What counts as a node](#what-counts-as-a-node) lists.

**Visual complexity score** adds what nodes alone miss:

```text
score = (nodes + 0.5 × edges + 0.25 × rows + 3 × subgraphs) × (1 + 0.1 × nesting depth)
```

Edges add clutter, each subgraph adds a boundary to track, and each level of nesting makes all of it harder to follow.
A row is a line of text inside a node, such as an entity's attribute, and only an `erDiagram` or a `classDiagram` has rows.
For a `mindmap`, `treemap`, `treeView` or `ishikawa`, the nesting depth in the score is the tree's depth below its root.
The four weights are options: `edgeWeight`, `rowWeight`, `subgraphWeight` and `depthWeight`.

## The score, one idea at a time

The steps below build the score from a single idea upwards.
Each step shows a small diagram's source, then the structure mermaid's parser returned for it.
That graph is not drawn from the source text.
The site build runs the linter's own parse engine over each example, and draws the nodes, edges and subgraphs it read.
A subgraph is drawn as a dashed box around its members.
The worked score under each graph is also computed in that build, with the default weights.

### Nodes

Start with nodes and nothing else.
Each node is one thing the reader must find and name, so each adds one point.
Six unconnected nodes score 6.

--8<-- "complexity/nodes.md"

### Edges

Join the same six nodes with five edges.
An edge is a line to trace, but it is lighter than a node, so each adds half a point.
The diagram now scores 8.5.

--8<-- "complexity/edges.md"

### Subgraphs

Group five of the nodes into two subgraphs, Billing and Warehouse.
A subgraph is a boundary the reader must track, so each adds three points.
Grouping also creates one level of nesting, which scales the whole sum by 1.1.
The diagram now scores 15.95.

--8<-- "complexity/subgraphs.md"

### Nesting depth

Move Packing and Shipping into a Dispatch subgraph inside Warehouse.
The extra subgraph adds three points, and the second level of nesting raises the scale to 1.2.
Nesting multiplies the score rather than adding to it, because a deeper diagram makes every element harder to place.
The diagram now scores 21.

--8<-- "complexity/nesting.md"

At three levels, nesting also fires its own rule, as [Each measure is a ladder](#each-measure-is-a-ladder) explains.

### Tree depth

A `mindmap` draws no subgraphs, but a deep tree is as hard to follow as deep nesting.
For a tree-shaped type, the depth in the score is how far the tree reaches below its root.
Every entry is a node, and every link from parent to child is an edge.
This mindmap reaches three levels below its root, so it scores 13.

--8<-- "complexity/tree.md"

### The full score

A real diagram combines all of these.
This shop architecture has more nodes, more edges and five subgraphs, nested two levels deep.
It scores 45.

--8<-- "complexity/full.md"

The score on its own says nothing about whether 45 is too much.
That depends on the audience, which is what a preset sets.

## Presets set the thresholds

A preset is a named set of thresholds for one density of diagram.
The default is `high-density`, which follows [Huang et al. 2020](https://arxiv.org/abs/2008.07944).
That study found that around 50 nodes is where a network diagram becomes hard to read, and that 100 is the limit.

--8<-- "presets-table.md"

Pick `low-density` or `medium-density` for audiences that read diagrams quickly, such as slides or onboarding docs.

## Each measure is a ladder

The thresholds form bands, and a diagram lands in exactly one band per measure.
Only the rule for that band fires, so one diagram never gets three findings for the same problem.

| Measure | Band | Rule |
|---|---|---|
| Nodes | above `nodeAcceptable`, up to `nodeComplex` | `complexity-node-count-acceptable-exceeded` |
| Nodes | above `nodeComplex`, up to `nodeHardLimit` | `complexity-node-count-cognitive-limit` |
| Nodes | above `nodeHardLimit` | `complexity-node-count-hard-limit` |
| Score | above `vcsAcceptable`, up to `vcsComplex` | `complexity-visual-score-acceptable-exceeded` |
| Score | above `vcsComplex` | `complexity-visual-score-critical` |

`nodeComplex`, `nodeHardLimit` and `vcsComplex` each bound two neighbouring bands, so two rules read each of them.
`nodeAcceptable` and `vcsAcceptable` bound only the lowest band, so one rule reads each.

The shop architecture from [The full score](#the-full-score) lands in a different band under each preset.
Each row below is a real run of the complexity rules over that diagram.

--8<-- "complexity/presets.md"

Nesting has its own rule: subgraphs nested three or more levels deep fire `complexity-subgraph-nesting-too-deep`.
That limit is fixed at three, and no preset or option changes it.
The rule reads only real subgraphs, such as a flowchart `subgraph` or a composite state.
A deep `mindmap`, `treemap`, `treeView` or `ishikawa` draws no subgraphs, so the rule never fires on it.
Its depth counts only toward the score.

!!! warning "Some threshold options have no effect yet"

    The presets also define `nodeIdeal`, `vcsIdeal` and `vcsCritical`, and the config accepts them, but no rule reads them today.
    `complexity-visual-score-critical` fires above `vcsComplex`, the complex threshold, and its message names that threshold.

Because each rule covers one band, set the preset for the whole ladder at once with `--preset`.
Setting `preset` or a threshold on one complexity rule in the config moves only that rule's band.
That can leave a gap between bands, or an overlap where two rules report the same diagram.
[Rule settings](../reference/configuration.md#rule-settings) shows a threshold set on both rules that read it.

## What counts as a node

Each diagram type has its own unit, read from mermaid's parser result.
`src/parse/stats.ts` holds one adapter per type, and it is the authority when this table and the code disagree.

| Diagram type | A node is | A subgraph is |
|---|---|---|
| `flowchart`, `flowchart-elk`, `graph` | A vertex, but not a subgraph's id used as an edge's end, since that edge runs to the subgraph | A `subgraph` |
| `classDiagram` | A class, whose attributes and methods are rows | A `namespace`, and one inside another adds nesting |
| `sequenceDiagram` | A participant or actor | A `box`, and a block such as `loop`, `alt` or `par` |
| `stateDiagram` | A state, including a composite state, a fork and a choice | A composite state |
| `erDiagram` | An entity, whose attributes are rows | None |
| `block` | A leaf block | A block that holds others |
| `C4` diagrams | A shape, such as a person or system | A boundary |
| `requirementDiagram` | A requirement or an element | None |
| `gantt` | A task | A section |
| `journey` | A task | A section |
| `timeline` | A period, and each event under it | A section |
| `kanban` | A task | A column |
| `mindmap`, `ishikawa` | Every entry in the tree | None |
| `quadrantChart` | A plotted point, and a quadrant that has a label | None |
| `xychart` | An x position: a category, or a point of the longest series | None |
| `sankey` | A node | None |
| `venn` | A set | None |
| `pie` | A slice | None |
| `packet` | A block | None |
| `gitGraph` | A commit | A branch |
| `radar` | An axis or a curve | None |
| `treemap`, `treeView` | Every entry in the tree | None |
| `architecture-beta` | A service | A group |
| `wardley` | An anchor or a component | None |
| `info` | None | None |

A note is never counted, in any diagram type.

## Sequence, entity and state diagrams

These three types draw something other than boxes joined by lines, so each counts its own parts.
As in the steps above, each graph is what the parser returned, and each score is computed by the site build.

### Sequence diagrams

A participant is a node, and each message from one participant to another is an edge.
A `box` around participants is a subgraph, and so is each block, such as `loop`, `alt`, `opt` or `par`.
A block inside another block adds a level of nesting.
An `else` divides its block rather than opening a new one.
A note, an activation and `autonumber` add nothing.
Neither does a `rect`, which tints the background behind its messages rather than drawing a boundary.
This checkout has three participants, six messages, a box and an `alt` block, so it scores 13.2.

--8<-- "complexity/sequence.md"

A block frames messages rather than participants, so the graph draws it as an empty boundary.

### Entity relationship diagrams

An entity is a node, and a relationship is an edge.
Each attribute is a row, which adds a quarter of a point.
A row is text to read, but it sits inside a box the reader has already found, so it weighs less than an edge.
These four entities, three relationships and five attributes score 6.75.

--8<-- "complexity/er.md"

### State diagrams

A state is a node, and a transition between two states is an edge.
A composite state is a node and also a subgraph around the states inside it.
A start or end marker, `[*]`, only marks where a path begins or ends.
It is not a state, and its transition is not an edge.
A fork and a choice are nodes, because each is a point where the path divides.
This order flow has five states, three transitions and one composite state, so it scores 10.45.

--8<-- "complexity/state.md"

## Why complexity is never fixed automatically

Splitting a diagram changes what it says.
A finding names the existing subgraphs to split along and a target size, and a human decides where the seams go.

## Diagrams that cannot be measured

A diagram the parser cannot read has no trustworthy count.
It is reported as `parse-diagram-unparseable`, and no complexity rule is evaluated against it.
