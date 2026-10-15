---
type: Architecture Decision
title: An LLM fix is committed beside its fixture and verified clean
description: Judgment fixes for what --fix leaves are authored once as .llm siblings, never generated at build time
tags: [testing, fixtures, docs]
status: accepted
accepted_on: 2026-10-15
provenance: The gallery showed findings the automatic fixer refuses with no resolution, so a reader saw the problem but not what a good fix looks like
enforced_in:
  - tests/fixtures.test.ts, which requires an LLM fix wherever --fix leaves findings, and requires it to lint clean and state a reason
  - tests/rules-doc.test.ts, which requires an llm block after every reported block in RULES.md
  - scripts/build-site.ts, which fails the build when an LLM fix stops linting clean
generated: { by: jpai-mermaidjs-lint, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0014 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Decision

### The lens

#### Given

the gallery should show what an LLM would change to clear a finding that --fix refuses

#### We prefer

an LLM fix authored once and committed as a .llm sibling with its reason, over calling a model while the site builds

#### Because

a committed fix is reviewed like code, gives the same page on every build, and needs no API key or network in CI

#### Unless

the corpus grows past what can be reviewed by hand, when a script may draft fixes that are still committed and checked

## Consequences

### Pros

- Every refused finding in the gallery shows a reviewed, working resolution and the reason for it.
- The suite proves each LLM fix clears its findings, so a stale one fails CI.

### Cons

- An LLM fix can drift in meaning from its fixture while still linting clean, and only review catches that.
