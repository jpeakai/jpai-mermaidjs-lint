---
type: Architecture Decision
title: A fixer refuses whenever the answer is a design choice
description: Contrast is repaired only with black or white, and only when it provably clears 4.5 to 1
tags: [fixing, safety]
status: accepted
accepted_on: 2026-10-15
provenance: Rewriting a brand colour to the nearest passing shade picked a hue the author never chose
enforced_in:
  - src/rules/contrast-text-below-aa.ts, whose fixer proposes an edit only when black or white clears 4.5 on every background the directive is scored against
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0005 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: A wrong autofix is worse than none. The finding still asks a human, while a silent rewrite changes a palette nobody reviewed.

## Relates to

- Depended on by [MJL-0006](0006-every-fix-is-verified-by-reparse.md) (the verifier backs a refusal with proof)

## Problem

### Symptom

A fixer that adjusted lightness kept the hue and changed the identity of a palette.

### Pain point

The check passed and the diagram no longer matched its documentation.

## Decision

### The lens

- **Given**: a failing label colour has many passing replacements
- **We prefer**: replacing a declared color only with black or white, and refusing otherwise, over choosing a nearby shade
- **Because**: the choice is deterministic and verifiable, and anything subtler is a design decision
- **Unless**: never

### In practice

- No fix is offered when color is not declared, under a host profile, or for an erDiagram.
- A directive scored on both light and dark canvases is fixed only when one colour passes all of them.

## Consequences

### Pros

- An applied fix can be trusted without reading the diff.

### Cons

- Some fixable palettes stay reported.
