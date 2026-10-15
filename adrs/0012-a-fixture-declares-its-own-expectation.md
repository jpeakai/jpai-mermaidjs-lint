---
type: Architecture Decision
title: A fixture declares what it must report in its own file
description: Each fixture names its expected rule ids in an expect comment, and a .fixed sibling pins its fix output
tags: [testing, fixtures]
status: accepted
accepted_on: 2026-10-15
provenance: The original skill's example files carried their expected outcomes in prose tables nothing checked, and new cases needed test code to run
enforced_in:
  - tests/fixture-loader.ts, which reads the expect comment and the .fixed sibling
  - tests/fixtures.test.ts, which fails a fixture with no expect comment or a mismatch
generated: { by: jpai-mermaidjs-lint, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0012 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Decision

### The lens

#### Given

diagrams that misbehave keep turning up, and each one should become a regression case

#### We prefer

an expect comment inside the fixture plus an optional .fixed sibling, over a central table of expectations in test code

#### Because

adding a case is then adding one file, and the expectation travels with the diagram it describes

#### Unless

a case needs options or a profile other than the defaults, which then needs a richer comment

## Consequences

### Pros

- A contributor adds a case without touching test code.
- The docs site renders the same files with the same expectations.

### Cons

- Distinct rule ids are compared, not finding counts or lines, so a second finding of the same rule goes unnoticed.
