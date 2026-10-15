---
type: Architecture Decision
title: A Material file sets a config canvas aside
description: A config canvas is set aside, with a note, for a file the auto profile reads as mkdocs-material
tags: [contrast, accessibility, cli]
status: accepted
accepted_on: 2026-10-16
provenance: Under MJL-0018 a canvas in the config stopped every run over a repo whose auto profile read some files as mkdocs-material, such as one with docs-site/mkdocs.yml, and printed no findings for the other files. The config has no per-path setting, so the only way out was a second config.
enforced_in:
  - src/check.ts, optionsFor and canvasSetAside
  - src/cli.ts, the set-aside note
  - src/errors.ts, CanvasProfileError
generated: { by: jpai-mermaidjs-lint, at: 2026-10-16T00:00:00Z }
---

<!-- GENERATED from MJL-0019 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Scoped exception to [MJL-0018](0018-a-host-sets-the-page-canvas-under-github-only.md) (a config canvas on a file the auto profile reads as mkdocs-material is set aside rather than refused)

## Decision

### The lens

#### Given

the auto profile reads a file as mkdocs-material, and the only canvas for it comes from the config, which covers the whole tree

#### We prefer

setting the canvas aside for that file, scoring it under mkdocs-material, and printing one note that names every such file, over stopping the run

#### Because

the config cannot scope a canvas to a path, and the auto profile already decides which page each file is drawn on. The note keeps the set-aside visible, so it never reads as a silent pass.

#### Unless

the canvas comes from --canvas-light or --canvas-dark, or the profile is set to mkdocs-material by flag or rule option. Each of those is an explicit setting for this run, so it is still refused with a usage error.

## Consequences

### Pros

- One config with a canvas serves a repo that holds a Material site beside its GitHub-rendered markdown.
- The run reports findings for every file instead of stopping at the first Material file.

### Cons

- A config canvas that the user meant for a Material file is dropped rather than refused, so the note is the only signal.
