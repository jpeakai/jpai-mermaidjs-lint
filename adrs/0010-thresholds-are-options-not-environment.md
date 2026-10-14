---
type: Architecture Decision
title: Thresholds are rule options and flags, never environment variables
description: A preset and numeric overrides come from the config or a flag
tags: [config, determinism]
status: accepted
accepted_on: 2026-10-15
provenance: The scripts read MERMAID_COMPLEXITY_* variables and needed a special case so a flag could beat them
enforced_in:
  - src/parse/metrics.ts, whose thresholdsFrom reads only rule options, and src/check.ts, which lets a flag override an option
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0010 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: A result that depends on inherited shell state differs between a laptop and CI for no reason anyone can read.

## Problem

### Symptom

An exported variable changed a gate's verdict without a change to the repo.

### Pain point

The same commit passed in one shell and failed in another.

## Decision

### The lens

- **Given**: a project needs different density limits
- **We prefer**: setting preset or a numeric threshold per rule in the config, with a run flag on top, over environment variables
- **Because**: the config is committed and reviewed, so the verdict is reproducible
- **Unless**: never

### In practice

- The order is the flag, then the rule option, then the default preset high-density.
- Preset aliases such as low and strict are kept.

## Consequences

### Pros

- A verdict is a function of the repo and the command line.

### Cons

- A CI job that relied on the variables must move to the config.
