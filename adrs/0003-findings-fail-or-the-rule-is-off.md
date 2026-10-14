---
type: Architecture Decision
title: A finding fails the run, or the rule is off
description: There is no warning level, and an advisory pair is not a finding
tags: [policy, severity]
status: accepted
accepted_on: 2026-10-15
provenance: The scripts exited 1 on warnings too, and the contrast audit printed a non-gating advisory marker that nothing acted on
enforced_in:
  - src/config.ts, whose only severities are error and off, and src/rules/contrast-border-below-ui-minimum.ts, which skips advisory pairs
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0003 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: A warning costs attention and protects nothing, because people and agents learn to ignore it.

## Problem

### Symptom

A border that cannot clear 3:1 in both themes was printed as advisory and exited 0.

### Pain point

Output carried findings that no gate enforced.

## Decision

### The lens

- **Given**: a check is uncertain enough that failing on it seems harsh
- **We prefer**: making the rule off by default or removing the check, over reporting it without failing
- **Because**: a run that exits 0 should have nothing to report
- **Unless**: never

### In practice

- A rule is either on and failing, or switched off in the config.
- A pair the original auditor marked advisory is not reported.

## Consequences

### Pros

- The exit code and the output always agree.

### Cons

- A borderline heuristic must be removed or opted into.
