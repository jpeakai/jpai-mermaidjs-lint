# Plugin API

The contract a plugin or a local rule implements.
For a walkthrough, see [Write a local rule](../guides/local-rule.md) or [Publish a plugin package](../guides/plugin-package.md).
[The plugin model](../concepts/plugin-model.md) explains how plugins are found and loaded.
The types are exported from `@jpeakai/mermaidjs-lint`.

## Overview

A rule reads one context built around the document model.
Its check returns findings, and its optional fixer returns edits that declare what must stay the same.

--8<-- "rule-contract.md"

??? info "Detailed: every field a rule sees and returns"

    The context also carries the rule's validated options and the shared colour helpers.

    --8<-- "rule-contract-detail.md"

## Plugin

The default export of a plugin package.

| Field | Type | Meaning |
|---|---|---|
| `meta.name` | `string` | The plugin's name, shown when it loads |
| `meta.namespace` | `string` | Prefix of every rule id. Lower-case letters, digits and hyphens, starting with a letter. `local` is reserved. |
| `meta.apiVersion` | `number` | The contract version the plugin targets. It must be `1`. |
| `meta.categories` | `Record<string, string>`, optional | New category words, each a single lower-case word, mapped to a one-line description |
| `rules` | `Record<string, PluginRule>` | Each rule key to its rule |

A local rule file has no `meta`.
Its default export is one `PluginRule`, its file name is the key, and it may export `categories` alongside.

## PluginRule

| Field | Type | Meaning |
|---|---|---|
| `category` | `string` | A built-in category, or one the plugin declares |
| `summary` | `string` | One line, shown by `--list-rules` and `--help` |
| `options` | `Record<string, "number" \| "string" \| "boolean" \| "string[]">`, optional | The options the rule accepts, checked against the config before a run |
| `check(ctx)` | returns `PluginFinding[]` or a promise of it | Reports findings |
| `fix(ctx)` | returns `PluginEdit[]` or a promise of it, optional | Proposes edits |

The rule key must start with its category, as `category-short-name`.
The rule runs under the id `namespace/key`.

## Context

`check` and `fix` both receive one object.

| Field | Type | Meaning |
|---|---|---|
| `doc` | `DocModel` | The parsed file. See [Document model](document-model.md). |
| `file` | `string` | The path being checked |
| `options` | `Record<string, unknown>` | The rule's options from the config, already type-checked |
| `helpers.detectKeyword` | function | The keyword of a diagram source |
| `helpers.wcagRatio(fg, bg)` | function | The WCAG 2 contrast ratio of two colours |
| `helpers.compositeOver(fg, bg)` | function | A translucent colour blended over a background |

## Findings

A check returns a list of findings.

| Field | Type | Meaning |
|---|---|---|
| `line` | `number` | The first file line |
| `endLine` | `number`, optional | The last file line. Defaults to `line`. |
| `message` | `string` | What failed |
| `remediation` | `string`, optional | The next step, shown in `--json` output |

The engine adds the rule id and the file.
A check that throws, or returns anything else, becomes one finding for that rule, and the run carries on.

## Edits

A fixer returns a list of edits.

| Field | Type | Meaning |
|---|---|---|
| `start`, `end` | `number` | The range of `doc.src` to replace |
| `text` | `string` | The replacement |
| `expect` | `{ kind: "same-diagrams" }` or `{ kind: "same-tree" }` | What must still hold after the edit |

| Expectation | Holds when |
|---|---|
| `same-diagrams` | The markdown is unchanged outside the mermaid fences, every diagram is still there, and each parses to the same structure |
| `same-tree` | The markdown tree is unchanged once whitespace in text is collapsed |

The engine applies an edit, parses the document again, and keeps the edit only when its expectation holds.
A fixer that throws, returns something other than a list, or returns an edit with no valid expectation stops the run with `error[plugin-fixer]`.

## Testing helpers

Import from `@jpeakai/mermaidjs-lint/testing`.

| Function | Returns |
|---|---|
| `localPlugin(key, module)` | The plugin the loader would build from one local rule file |
| `checkRule(plugin, key, source, run?)` | The findings one rule reports for `source` |
| `fixRule(plugin, key, source, run?)` | `{ output, applied, refused }` after the rule's fixer has run to a fixpoint |

`run` may hold `options` for the rule, `flags` such as `{ preset, profile }`, and a `file` name, which defaults to `test.md`.
A name ending in `.mmd` treats the source as a standalone diagram.

## Load errors

A plugin that fails to load stops the run with exit code 1 and `error[code]`, unless the run is lenient.

| Code | Cause |
|---|---|
| `plugin-import` | The module could not be imported |
| `plugin-contract` | The export breaks the contract: a field is missing or of the wrong type, or the API version differs |
| `plugin-conflict` | Another plugin already claimed the namespace or a category word |
| `plugin-not-installed` | A declared plugin package is not installed |
| `plugin-source` | The source cannot be loaded, such as a `.cts` file, or TypeScript on a runtime that cannot import it |
