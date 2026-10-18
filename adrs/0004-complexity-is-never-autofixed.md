---
type: Architecture Decision
title: No complexity rule has a fixer
description: Splitting a diagram changes what it says, so a human does it
tags: [fixing, safety]
status: accepted
accepted_on: 2026-10-15
provenance: The scripts only recommended a split count, and a split needs a boundary that only the author knows
enforced_in:
  - src/rules/complexity.ts, whose factory never takes a fix
generated: { by: jpai-mermaidjs-lint, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0004 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extended by [MJL-0025](0025-a-fold-is-offered-as-a-split.md) (the split recommendation carries a concrete plan, checked by a contract and still never applied)

## Decision

### The lens

#### Given

a diagram exceeds a node or score threshold

#### We prefer

reporting it with a split recommendation, over rewriting it

#### Because

the boundary of a split is a design decision

#### Unless

never

## Consequences

### Pros

- A fix never changes what a diagram means.

### Cons

- A complexity finding always needs a human.
