---
type: Architecture Decision
title: Sequence colours come from Mermaid's own theme engine
description: A sequence diagram is scored by theme variables Mermaid resolves on a pinned version
tags: [contrast, accessibility, parsing]
status: accepted
accepted_on: 2026-10-16
provenance: The mermaidjs-diagrams skill kept its own sequence audit because this package passed a sequence diagram whose message text vanished on a dark page
enforced_in:
  - src/parse/contrast.ts, scoreSequence
  - package.json, the exact mermaid version
generated: { by: jpai-mermaidjs-lint, at: 2026-10-16T00:00:00Z }
---

<!-- GENERATED from MJL-0017 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [MJL-0018](0018-a-host-sets-the-page-canvas-under-github-only.md) (the sequence pairs on the page are scored on the canvas)

## Decision

### The lens

#### Given

a sequence diagram has no style directives, and its colours are theme variables that Mermaid derives from each other

#### We prefer

reading the config with mermaid.parse and resolving every variable with Mermaid's theme engine on an exact pinned version, over copying Mermaid's palettes into the package

#### Because

the derived colours change between Mermaid releases, and a copy drifts silently while a pin changes only in a reviewed bump

#### Unless

the profile is mkdocs-material, where Material's CSS forces every sequence label and box, so only lifelines, arrowheads and activation bars are scored, as advisory borders

## Consequences

### Pros

- A sequence diagram that passes reads in both themes on the pinned Mermaid.
- Frontmatter and init directives merge the way the renderer merges them.

### Cons

- A consumer gets the pinned Mermaid, and a host on another version may derive other colours.
- Mermaid's own dark theme draws note text at 4.49 to 1, so a note with no colours set fails.
