---
type: Architecture Decision
title: The score counts what a reader must read, not every record the parser keeps
description: Control lines, markers and notes are left out, and boxes, blocks and attribute rows are counted
tags: [complexity, parsing]
status: accepted
accepted_on: 2026-10-18
provenance: Worked examples for sequence, entity and state diagrams showed each type counted records the reader never reads, and missed boundaries and rows the reader does
enforced_in:
  - src/parse/stats.ts, adaptSequence, adaptState, adaptEr and adaptClass
  - src/parse/metrics.ts, calculateComplexity and its row weight
generated: { by: jpai-mermaidjs-lint, at: 2026-10-18T00:00:00Z }
---

<!-- GENERATED from MJL-0021 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [MJL-0001](0001-parse-with-mermaids-own-parsers.md) (every count is still read from the parser's result, never the text)
- See also [MJL-0025](0025-a-fold-is-offered-as-a-split.md) (a split plan's overview and details are scored by this score)

## Decision

### The lens

#### Given

a parser's result holds records with nothing to read, such as a block's closing line or a start marker.
It also files some things a reader does read, such as attributes, outside its nodes

#### We prefer

counting messages, boxes, blocks, states and rows, and leaving out control lines, markers and notes.
That is preferred over counting every record the parser keeps

#### Because

the score stands for what a reader must find, trace and hold.
A record with nothing to read inflates it, and a missed boundary or row deflates it

#### Unless

a type draws a record as something the reader must place, as a fork or a choice is, which stays a node

## Consequences

### Pros

- A sequence diagram with blocks, notes and activations scores its messages, not every statement.
- A large entity or class scores higher than an empty one.
- A sequence diagram whose blocks nest three deep fires the nesting rule, as a flowchart does.

### Cons

- Scores change for sequence, state, entity and class diagrams, so a diagram near a threshold may cross it either way on upgrade.
- The row weight is a judgement, not a measured value.
