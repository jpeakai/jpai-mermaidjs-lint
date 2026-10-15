---
type: Architecture Decision
title: One rule per finding code, one file per rule
description: Each distinct failure is its own rule id, so it can be switched off alone
tags: [rules, architecture]
status: accepted
accepted_on: 2026-10-15
provenance: The scripts emitted seven CamelCase codes from two files, and a project could not accept one of them
enforced_in:
  - src/rules, with one module per rule id registered in src/rules/index.ts
generated: { by: jpai-mermaidjs-lint, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0002 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [MJL-0001](0001-parse-with-mermaids-own-parsers.md) (the rules read the parsed stats)

## Decision

### The lens

#### Given

a failure needs its own switch and its own message

#### We prefer

a rule per code named category-short-name, over a rule that reports several codes

#### Because

the config can then switch off or tune exactly what a project accepts

#### Unless

two codes can never be told apart by a reader

## Consequences

### Pros

- Config can accept one finding without silencing its neighbours.

### Cons

- There are more rule files than codes in the scripts.
