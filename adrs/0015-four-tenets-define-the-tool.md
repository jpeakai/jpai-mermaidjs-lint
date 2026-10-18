---
type: Architecture Decision
title: Four tenets define what the tool guarantees
description: Readable in light and dark, renders, simple enough to follow, and extensible, and nothing else belongs in the core
tags: [scope, architecture]
status: accepted
accepted_on: 2026-10-15
provenance: The maintainer named the four goals the linter exists for, after the docs had grown around rules and flags without saying what they were for
enforced_in:
  - README.md, CONTRIBUTING.md, CLAUDE.md and the docs site home and concepts pages, which state the tenets and map each to its rules
  - Review of every change against the tenets, per CONTRIBUTING.md
generated: { by: jpai-mermaidjs-lint, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0015 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [MJL-0025](0025-a-fold-is-offered-as-a-split.md) (split plans serve the visual complexity tenet)

## Decision

### The lens

#### Given

a rule, a flag or a feature is proposed for the core package

#### We prefer

accepting it only when it serves one of the four tenets, over accepting any useful check

#### Because

four stated guarantees tell a user what a clean run means, and tell a contributor what the core is for

#### Unless

a check serves none of them, in which case it ships as a plugin, which the fourth tenet exists to make easy

## Consequences

### Pros

- A clean run has a precise meaning a user can rely on.
- Scope questions are settled by pointing at a tenet, not by taste.

### Cons

- Useful checks outside the tenets, such as a house naming style, have to live in plugins.
