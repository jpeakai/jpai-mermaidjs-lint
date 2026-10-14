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
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0002 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: A rule that reports several kinds of failure can only be switched off as a group.

## Relates to

- Depends on [MJL-0001](0001-parse-with-mermaids-own-parsers.md) (the rules read the parsed stats)

## Problem

### Symptom

One script reported parse failures, node limits, score limits and nesting under a single exit code.

### Pain point

A project that tolerated deep nesting had to ignore every complexity result.

## Decision

### The lens

- **Given**: a failure needs its own switch and its own message
- **We prefer**: a rule per code named category-short-name, over a rule that reports several codes
- **Because**: the config can then switch off or tune exactly what a project accepts
- **Unless**: two codes can never be told apart by a reader

### In practice

- A ladder of thresholds is a set of rules that each own one band, so only the most severe fires.
- A parse failure suppresses the complexity rules for that diagram, because thresholds mean nothing against unread structure.

## Consequences

### Pros

- Config can accept one finding without silencing its neighbours.

### Cons

- There are more rule files than codes in the scripts.
