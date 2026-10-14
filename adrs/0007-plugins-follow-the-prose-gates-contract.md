---
type: Architecture Decision
title: Plugins follow the prose-gates contract
description: A plugin is { meta, rules } with a namespace, an apiVersion and declared categories
tags: [plugins, architecture]
status: accepted
accepted_on: 2026-10-15
provenance: The sibling prose-gates package settled the contract after surveying ESLint, Stylelint and markdownlint
enforced_in:
  - src/plugins, which adapts prose-gates' contract, discovery and loader to a diagram context
generated: { by: human:maintainer, at: 2026-10-15T00:00:00Z }
---

<!-- GENERATED from MJL-0007 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

> **Lens**: A third-party rule must not need a second code path in the engine. The only new thing a plugin brings is a name that cannot clash.

## Problem

### Symptom

A house style could only be added by changing this repository.

### Pain point

Teams forked the package to add one rule.

## Decision

### The lens

- **Given**: a user wants a rule this package does not ship
- **We prefer**: a plugin whose default export is { meta, rules }, discovered from .mermaidjs-lint/rules and mermaidjs-lint-plugin-* dependencies, over a second rule interface
- **Because**: the engine, the verifier and the config treat every rule alike, and one convention serves both tools
- **Unless**: the contract must change in a way a plugin would notice, which bumps apiVersion

### In practice

- Rule ids read namespace/category-short-name, and local files use the reserved namespace local.
- A throwing check becomes a finding for that rule, and a throwing fixer stops the run.

## Consequences

### Pros

- A plugin rule is configured and listed like a built-in.

### Cons

- apiVersion is one integer, so a breaking change fails every plugin.
