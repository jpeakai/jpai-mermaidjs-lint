---
type: Architecture Decision
title: A fold is offered only as the overview half of a split
description: A split plan is checked by a contract and applied by a human
tags: [complexity, fixing, safety]
status: accepted
accepted_on: 2026-10-18
provenance: A complexity finding named the subgraphs to split along but not where to cut a diagram that has none. Folding node sets into group nodes gives an overview that meets the target, but an overview alone drops what it folds. Compromise, a maintained natural-language library, was evaluated to group nodes by label stems. It gave the same groupings as the small stemmer the split code already holds, for a 4.4 MB install, so it was rejected
enforced_in:
  - src/split/contract.ts, which parses the emitted overview and details again and refuses a plan that loses a node or an edge
  - src/rules/complexity.ts, which appends the plan to the remediation of the node count and score rules and still takes no fixer
  - src/split-report.ts and the --split-plan flag, which print the plan and write no file, and refuse --fix
generated: { by: jpai-mermaidjs-lint, at: 2026-10-18T00:00:00Z }
---

<!-- GENERATED from MJL-0025 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [MJL-0004](0004-complexity-is-never-autofixed.md) (the split recommendation now carries a concrete plan, and is still never applied)
- See also [MJL-0005](0005-a-fixer-refuses-when-unsure.md) (like a fixer that is unsure, a plan that breaks the contract is not offered)
- See also [MJL-0015](0015-four-tenets-define-the-tool.md) (the plan serves the visual complexity tenet)
- See also [MJL-0021](0021-the-score-counts-what-a-reader-must-read.md) (the overview and every detail are scored by the same visual complexity score)
- See also [MJL-0022](0022-start-from-the-official-parsers-output.md) (the plan reads the parser's graph, and its emitted text is checked by parsing it again)

## Decision

### The lens

#### Given

a diagram over a node count or score threshold

#### We prefer

offering a fold only as the overview half of a split, with one detail diagram per group, checked by a contract on the emitted text. That is preferred over a replacement diagram, and over a fixer

#### Because

the boundary of a split is a design decision, so the plan is a recommendation a human applies (MJL-0004). A split also stays recoverable, since the overview and the details together keep every node and edge

#### Unless

no plan meets the contract. Then no plan is offered, and the finding keeps its subgraph hint

## Consequences

### Pros

- A complexity finding names where to cut, not only how small to cut.
- A plan never loses a node or an edge, because the contract parses what it emits.
- The tool still never edits a diagram for a complexity finding.

### Cons

- Working out a plan adds time to a check of every oversized diagram.
- A plan groups by structure and label stems, so its groups may not match the author's intent.
- Compromise was rejected, so the label stemming stays in this package and is tested here.
