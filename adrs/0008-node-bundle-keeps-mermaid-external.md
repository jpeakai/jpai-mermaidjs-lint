---
type: Architecture Decision
title: The Node bundle keeps mermaid and its parsers external
description: dist inlines this package's code and leaves its dependencies to be installed
tags: [packaging, node]
status: accepted
accepted_on: 2026-10-15
provenance: Node will not strip types from a package inside node_modules, so a bundle is needed, but mermaid is not ours to bundle
enforced_in:
  - the build target in the Makefile, which passes --packages=external
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0008 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: Bundling mermaid inlines its whole renderer and its dynamic chunks, and breaks nothing a normal install would not fix.

## Problem

### Symptom

A bundled mermaid made the package tens of megabytes and duplicated it.

### Pain point

Installing the tool downloaded the renderer twice.

## Decision

### The lens

- **Given**: dist must run on Node without Bun
- **We prefer**: bundling only this package's own source, over bundling every dependency
- **Because**: npm already installs the dependencies, and mermaid chooses its own dynamic imports
- **Unless**: a dependency ships TypeScript only

### In practice

- No Bun global appears in src, and a test runs the bundle under Node.
- The installed size includes mermaid.

## Consequences

### Pros

- The bundle stays small and mermaid resolves itself.

### Cons

- A consumer needs the dependencies installed.
