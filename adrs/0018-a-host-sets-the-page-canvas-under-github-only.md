---
type: Architecture Decision
title: A host sets the page canvas, under the github profile only
description: Page-backed colours are scored on a canvas the caller may set, and a canvas under mkdocs-material is refused
tags: [contrast, accessibility, cli]
status: accepted
accepted_on: 2026-10-16
provenance: A documentation viewer with its own light and dark page colours could not score its diagrams, because the github profile scored every page-backed pair on GitHub's canvas, and its earlier skill script had flags for the page colours
enforced_in:
  - src/parse/contrast.ts, GITHUB_CANVAS and the canvas parameter of each scorer
  - src/rules/shared.ts, settingsOf
  - src/check.ts, checkRunFlags and optionsFor
  - src/rules/registry.ts, the canvas option type
generated: { by: jpai-mermaidjs-lint, at: 2026-10-16T00:00:00Z }
---

<!-- GENERATED from MJL-0018 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [MJL-0017](0017-sequence-colours-come-from-mermaids-theme-engine.md) (the sequence pairs on the page are scored on the canvas)
- Excepted by [MJL-0019](0019-a-material-file-sets-a-config-canvas-aside.md) (a config canvas on a file the auto profile reads as mkdocs-material is set aside rather than refused)

## Decision

### The lens

#### Given

translucent fills, edge label boxes and page-backed sequence elements are scored on the page colour. A host other than GitHub draws its own page.

#### We prefer

a canvas of opaque light and dark colours that defaults to GitHub's, over fixed GitHub colours or a profile per host. It is set by --canvas-light and --canvas-dark, a canvas rule option or RunFlags.

#### Because

the page is the one github profile assumption a host may change. One setting covers every page-backed pair without a new profile.

#### Unless

the file is scored under mkdocs-material, whose page is Material's own. There a canvas is a usage error rather than ignored, because an ignored canvas reports a pass it never affected.

## Consequences

### Pros

- A host with its own page colours scores diagrams as its readers see them.
- A run that sets no canvas reports exactly what it did before.

### Cons

- A run over a tree where auto picks mkdocs-material for some files fails if it sets a canvas, so those files need their own run.
- The canvas is a page colour only. A host that also restyles Mermaid's own surfaces is not modelled.
