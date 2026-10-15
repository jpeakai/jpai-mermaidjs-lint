# Measuring complexity

A diagram stops helping once a reader cannot hold it in mind.
The complexity rules put a number on that point, so a review can say "split this" without an argument about taste.

## Two measures

**Node count** is the number of nodes mermaid's parser reads from the diagram.

**Visual complexity score** adds what nodes alone miss:

```text
score = (nodes + 0.5 × edges + 3 × subgraphs) × (1 + 0.1 × nesting depth)
```

Edges add clutter, each subgraph adds a boundary to track, and each level of nesting makes all of it harder to follow.
The three weights are options: `edgeWeight`, `subgraphWeight` and `depthWeight`.

## Presets set the thresholds

A preset is a named set of thresholds for one density of diagram.
The default is `high-density`, which follows the research finding that around 50 nodes is where a network diagram becomes hard to read.

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

Nesting has its own rule: subgraphs nested three or more levels deep fire `complexity-subgraph-nesting-too-deep`.

!!! warning "Some threshold options have no effect yet"

    The presets also define `nodeIdeal`, `vcsIdeal` and `vcsCritical`, and the config accepts them, but no rule reads them today.
    The critical score rule fires above `vcsComplex`.

Because each rule covers one band, set the preset for the whole ladder at once with `--preset`.
Setting `preset` on one complexity rule in the config moves only that rule's band, which can leave gaps between bands.

## Why complexity is never fixed automatically

Splitting a diagram changes what it says.
A finding names the existing subgraphs to split along and a target size, and a human decides where the seams go.

## Diagrams that cannot be measured

A diagram the parser cannot read has no trustworthy count.
It is reported as `parse-diagram-unparseable`, and no complexity rule is evaluated against it.
