---
type: Architecture Decision
title: A diagram is a code node of the markdown tree
description: Fences come from mdast, and offsets are mapped back to the source by line
tags: [parsing, markdown]
status: accepted
accepted_on: 2026-10-15
provenance: The scripts matched an opening line with a regular expression and missed fences in lists and quotes
enforced_in:
  - src/model.ts, which collects mermaid code nodes and builds each diagram's offset map
generated: { by: jpai-mermaidjs-lint, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0009 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extended by [MJL-0023](0023-markdown-is-read-only-through-mdast.md) (the markdown tree comes only from mdast)

## Decision

### The lens

#### Given

a rule or a fixer needs the diagrams of a document and their positions

#### We prefer

taking them from the parsed tree and mapping a directive back to the source line, over scanning lines

#### Because

the tree gives exact fences and exemptions, and a mapped line lets a fixer edit inside a list or quote

#### Unless

a line cannot be mapped back, in which case the fixer refuses

## Consequences

### Pros

- Every fence the renderer would draw is checked.

### Cons

- A fence tagged mermaid with extra attributes is also read, which the scripts did not.
