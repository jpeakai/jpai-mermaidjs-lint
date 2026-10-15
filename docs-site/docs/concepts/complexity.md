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

Each threshold in the table bounds two neighbouring bands, so two rules read it.

Nesting has its own rule: subgraphs nested three or more levels deep fire `complexity-subgraph-nesting-too-deep`.
That limit is fixed at three, and no preset or option changes it.

!!! warning "Some threshold options have no effect yet"

    The presets also define `nodeIdeal`, `vcsIdeal` and `vcsCritical`, and the config accepts them, but no rule reads them today.
    `complexity-visual-score-critical` fires above `vcsComplex`, the complex threshold, and its message names that threshold.

Because each rule covers one band, set the preset for the whole ladder at once with `--preset`.
Setting `preset` or a threshold on one complexity rule in the config moves only that rule's band.
That can leave a gap between bands, or an overlap where two rules report the same diagram.
[Rule settings](../reference/configuration.md#rule-settings) shows a threshold set on both rules that read it.

## Why complexity is never fixed automatically

Splitting a diagram changes what it says.
A finding names the existing subgraphs to split along and a target size, and a human decides where the seams go.

## Diagrams that cannot be measured

A diagram the parser cannot read has no trustworthy count.
It is reported as `parse-diagram-unparseable`, and no complexity rule is evaluated against it.
