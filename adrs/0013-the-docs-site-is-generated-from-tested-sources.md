---
type: Architecture Decision
title: The docs site is generated from the sources the tests run
description: Reference pages come from RULES.md, the fixtures and examples, and the build re-checks every example
tags: [docs, testing]
status: accepted
accepted_on: 2026-10-15
provenance: A hand-written gallery of before and after diagrams would drift from the tool, while RULES.md was already held true by a test
enforced_in:
  - scripts/build-site.ts, which fails when an example stops reporting its rule or its fix output changes
  - docs-site/mkdocs.yml, built with --strict by make site and the Docs workflow
generated: { by: jpai-mermaidjs-lint, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0013 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Decision

### The lens

#### Given

the site shows every rule and fixture before and after --fix, rendered through Material

#### We prefer

generating the reference pages at build time from RULES.md, tests/fixtures and examples, over committing hand-written pages

#### Because

a page that is regenerated and re-checked on every build cannot show behaviour the tool no longer has

#### Unless

a page explains something no test source holds, which is then authored under docs-site/docs and linted like any other page

## Consequences

### Pros

- The site doubles as a test suite, run on every pull request.
- The site lives in docs-site, so only its own pages are scored under the mkdocs-material profile.

### Cons

- The reference pages exist only after make site, so they cannot be read on GitHub.
