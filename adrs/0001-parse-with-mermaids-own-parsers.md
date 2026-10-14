---
type: Architecture Decision
title: Every diagram is measured by mermaid's own parsers
description: Structure comes from the Langium grammars and mermaid core, never from regexes over the text
tags: [parsing, architecture]
status: accepted
accepted_on: 2026-10-15
provenance: The skill scripts began as a Python regex counter and were rewritten against mermaid's parsers, which was strictly more accurate
enforced_in:
  - src/parse/stats.ts, which dispatches to @mermaid-js/parser and mermaid core and reads each parser's result
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0001 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: A diagram is a grammar, not a line format. Counting nodes with a regex disagrees with the renderer on every unusual diagram.

## Relates to

- Depended on by [MJL-0002](0002-one-rule-per-finding-code.md) (every complexity rule reads these stats)

## Problem

### Symptom

A regex counted nodes in a flowchart and missed subgraphs, ports and multi-line labels.

### Pain point

A complexity verdict rested on a count the renderer would not have produced.

## Decision

### The lens

- **Given**: a rule needs the nodes, edges and subgraphs of a diagram
- **We prefer**: reading them from the parser result, over scanning the diagram text
- **Because**: the parser already implements the grammar exactly, so the counts are the ones a reader sees
- **Unless**: a diagram type has no parser result that exposes structure, which fails as an unparseable diagram

### In practice

- Langium grammars cover the newer types, and mermaid core covers the rest through a happy-dom shim.
- A diagram that yields no nodes from multi-line source is reported, never rated clean.

## Consequences

### Pros

- Counts match what a reader sees.

### Cons

- The package depends on mermaid and a DOM shim.
