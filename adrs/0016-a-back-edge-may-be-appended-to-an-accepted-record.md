---
type: Architecture Decision
title: A back-edge may be appended to an accepted record
description: The one edit an accepted record allows is adding the inverse of a relation a newer record declares
tags: [decisions, process]
status: accepted
accepted_on: 2026-10-15
provenance: Every typed relation needs its inverse on the target record for the graph to be checkable, which collides with the rule that an accepted record is never rewritten
enforced_in:
  - CONTRIBUTING.md, Recording a decision
  - CLAUDE.md, Decisions
generated: { by: jpai-mermaidjs-lint, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0016 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Decision

### The lens

#### Given

a new record declares a typed relation, such as supersedes, to an older accepted record

#### We prefer

appending the inverse relation to the older record's relates_to, over leaving the relation one-way

#### Because

the graph is only checkable when both ends agree, and the append adds a fact without changing what the older record decided

#### Unless

the edit would change any other field of the older record, which still needs a new superseding record

## Consequences

### Pros

- Every relation can be read from either end, and the generator can check the pair.

### Cons

- Accepted records are no longer byte-for-byte frozen, so review must check an edit touches relates_to only.
