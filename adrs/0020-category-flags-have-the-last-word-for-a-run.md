---
type: Architecture Decision
title: Category flags have the last word for a run
description: "--category and --disable-category switch whole categories on or off for one run, over the config"
tags: [cli, config]
status: accepted
accepted_on: 2026-10-16
provenance: Focusing a run on one category, such as contrast alone, took a config that set every other rule to off by id. A temporary change of focus meant editing or copying the config, and a run could not put back a rule the config switched off.
enforced_in:
  - src/rules/registry.ts, buildRegistry and checkSelection
  - src/cli.ts, the --category and --disable-category flags
  - tests/categories.test.ts
generated: { by: jpai-mermaidjs-lint, at: 2026-10-16T00:00:00Z }
---

<!-- GENERATED from MJL-0020 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [MJL-0003](0003-findings-fail-or-the-rule-is-off.md) (a category flag only switches rules on or off, so a finding still fails the run or its rule is off)

## Decision

### The lens

#### Given

a user wants one run to check a different set of categories from the one the config describes

#### We prefer

settling the rules in three steps.
Every loaded rule starts on, the config turns some off, then the category flags turn whole categories on or off

#### Because

a flag is an explicit choice for this run, so it outranks the standing config, as --preset and --profile already do.
A re-enabled rule keeps its configured options, so it runs as the config describes it.

#### Unless

the flags name a category no loaded source declares, name one category both ways, or turn off every rule.
Each would check something other than what was asked, so it is a usage error rather than a guess.

## Consequences

### Pros

- A run can check one category, or skip one, without touching the config.
- --list-rules with the same flags shows exactly which rules a run would use.

### Cons

- A run can pass with a category switched off, so a CI gate that wants every category must not pass --disable-category.
