---
type: Architecture Decision
title: Every edit is proven by re-parsing the document
description: An edit is kept only when the markdown tree and every diagram's structure are unchanged
tags: [fixing, verification]
status: accepted
accepted_on: 2026-10-15
provenance: The scripts had no fixers, so a fixer here needs a proof the scripts never had to give
enforced_in:
  - src/fix/verify.ts, whose same-diagrams expectation compares the markdown tree and each diagram's parsed structure, and src/fix/engine.ts
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0006 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: A fixer proposes, and the engine disposes. A fixer cannot be the judge of its own edit.

## Relates to

- Depends on [MJL-0005](0005-a-fixer-refuses-when-unsure.md) (a refusal is the normal outcome of a failed proof)

## Problem

### Symptom

A colour edit that landed on the wrong line would still have parsed.

### Pain point

The edit looked right and altered another diagram.

## Decision

### The lens

- **Given**: an edit has been spliced into the source
- **We prefer**: re-parsing the whole document and comparing structure, over trusting the fixer's offsets
- **Because**: the mermaid parser and the markdown parser are the authority on what the document says
- **Unless**: the expectation is same-tree, which only compares the markdown tree

### In practice

- The verifier is asynchronous, because a diagram is re-parsed by mermaid.
- A refused edit is remembered while its source slice is unchanged, so the loop converges.

## Consequences

### Pros

- A buggy or plugin fixer cannot corrupt a diagram unnoticed.

### Cons

- Every fix pass parses mermaid again.
