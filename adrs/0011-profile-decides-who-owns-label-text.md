---
type: Architecture Decision
title: A contrast profile decides who owns the label text
description: github scores the declared pairs, and mkdocs-material scores the host's forced text in both themes
tags: [contrast, accessibility]
status: accepted
accepted_on: 2026-10-15
provenance: The auditor learned that Material forces label text and ignores color, so a declared pair there proved nothing
enforced_in:
  - src/parse/contrast.ts, with the github, mkdocs-material and erDiagram scorers
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0011 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: Contrast is a property of a pair, and which pair is read depends on who controls the text.

## Problem

### Symptom

A diagram that passed under the declared colours was unreadable in one Material theme.

### Pain point

The gate passed a diagram a reader could not read.

## Decision

### The lens

- **Given**: a diagram is read through a host theme that overrides its colours
- **We prefer**: scoring the host text against each fill composited over both theme backgrounds, over scoring the declared color
- **Because**: the pair a reader sees is the one that must pass
- **Unless**: the profile is github, where the author controls the text

### In practice

- auto reads mkdocs-material when an ancestor holds mkdocs.yml, and github otherwise.
- A translucent fill is composited over each canvas and the worse result gates.

## Consequences

### Pros

- A diagram that passes reads in both themes.

### Cons

- The host's colours are constants that can drift from the theme.
