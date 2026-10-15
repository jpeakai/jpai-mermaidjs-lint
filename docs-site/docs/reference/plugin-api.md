# Plugin API

The contract a plugin or a local rule implements.
For a walkthrough, see [Write a local rule](../guides/local-rule.md) or [Publish a plugin package](../guides/plugin-package.md).
[The plugin model](../concepts/plugin-model.md) explains how plugins are found and loaded.
The types are exported from `@jpeakai/mermaidjs-lint`, as `.d.ts` declarations in `dist/types/`, so a TypeScript project needs no extra compiler options.

## Overview

A rule reads one context built around the document model.
Its check returns findings, and its optional fixer returns edits that declare what must stay the same.
The diagram shows the engine's view, where a `Finding` carries its file and rule id, and an `Edit` its rule id.
A plugin returns a `PluginFinding` and a `PluginEdit` without them, and the engine adds them.

--8<-- "rule-contract.md"

??? info "Detailed: every field a rule sees and returns"

    The context also carries the rule's validated options and the shared colour helpers.

    --8<-- "rule-contract-detail.md"

## Plugin

The default export of a plugin package.

| Field | Type | Meaning |
|---|---|---|
| `meta.name` | `string` | The plugin's name. Required and non-empty. Run output names the plugin by its namespace, not this name. |
| `meta.namespace` | `string` | Prefix of every rule id. Lower-case words of letters and digits, joined by single hyphens, starting with a letter. `local` is reserved. |
| `meta.apiVersion` | `number` | The contract version the plugin targets. It must be `1`. |
| `meta.categories` | `Record<string, string>`, optional | New category words, each a single lower-case word, mapped to a one-line description |
| `rules` | `Record<string, PluginRule>` | Each rule key to its rule |

A local rule file has no `meta`.
Its default export is one `PluginRule`, its file name is the key, and it may export `categories` alongside.

## PluginRule

| Field | Type | Meaning |
|---|---|---|
| `category` | `string` | A built-in category, or one the plugin declares |
| `summary` | `string` | One line, shown by `--list-rules`. `--help` lists the built-in rules only. |
| `options` | `Record<string, "number" \| "string" \| "boolean" \| "string[]" \| "canvas">`, optional | The options the rule accepts, checked against the config before a run. `preset` and `profile` are reserved, as [Reserved options](#reserved-options) explains. An option of type `canvas`, under any name, is `{ light?, dark? }` of opaque CSS colours, and receives `--canvas-light` and `--canvas-dark` side by side. |
| `check(ctx)` | returns `PluginFinding[]` or a promise of it | Reports findings |
| `fix(ctx)` | returns `PluginEdit[]` or a promise of it, optional | Proposes edits |

The rule key matches `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, and must start with its category, as `category-short-name`.
So `house-` and `house--x` fail the contract check.
The rule runs under the id `namespace/key`.

### Reserved options

The option names `preset` and `profile` keep their built-in meaning for every rule.

- **A config value must be a built-in name.** A `profile` in the config is checked against `auto`, `github` and `mkdocs-material`.
  A `preset` is checked against the preset names and their aliases, in any case.
- **The flags overwrite them.** `--preset` and `--profile` replace the configured value for the run.
- **Declare one only as `"string"`.** Any other type fails the load with `error[plugin-contract]`.
- **The rule reads what was set, not a default.** `ctx.options.preset` is the canonical preset name, such as `high-density`, even when the user typed an alias. `ctx.options.profile` is the profile as given. Each is absent when neither the flag nor the config sets it, so treat absent as `high-density` and `auto`.
  `auto` means `mkdocs-material` when a parent folder of the file holds `mkdocs.yml` or `mkdocs.yaml`, else `github`, and no helper resolves it for you.

Give a rule's own setting another name, such as `mode`.

## Context

`check` and `fix` both receive one object.

| Field | Type | Meaning |
|---|---|---|
| `doc` | `DocModel` | The parsed file. See [Document model](document-model.md). |
| `file` | `string` | The file's path, the same in `check` and `fix`. The command passes an absolute path, and a library call passes the `file` it was given. |
| `options` | `Record<string, unknown>` | The rule's options from the config, already type-checked. The `--preset` or `--profile` flag replaces either one the rule declares. `--canvas-light` and `--canvas-dark` set their side of every option of type `canvas`. A preset arrives by its canonical name. A rule that declares `profile` and a canvas loses its config canvas for a file the auto profile reads as `mkdocs-material`. |
| `helpers.detectKeyword` | function | The keyword of a diagram source |
| `helpers.wcagRatio(fg, bg)` | function | The WCAG 2 contrast ratio of two colours |
| `helpers.compositeOver(fg, bg)` | function | A translucent colour blended over a background |

## Findings

A check returns a list of findings.

| Field | Type | Meaning |
|---|---|---|
| `line` | `number` | The first file line, a whole number of at least 1 |
| `endLine` | `number`, optional | The last file line, a whole number of at least `line`. Defaults to `line`. |
| `message` | `string` | What failed |
| `remediation` | `string`, optional | The next step, shown in `--json` output |

The engine adds the rule id and the file.
A check that throws, or returns anything else, becomes one finding for that rule, and the run carries on.

## Edits

A fixer returns a list of edits.

| Field | Type | Meaning |
|---|---|---|
| `start`, `end` | `number` | The range of `doc.src` to replace, as UTF-16 code unit offsets, as JavaScript string indices count them |
| `text` | `string` | The replacement |
| `expect` | `{ kind: "same-diagrams" }` or `{ kind: "same-tree" }` | What must still hold after the edit |

Offsets are whole numbers, with `0 <= start <= end <= doc.src.length`.
An edit outside those bounds is refused, and the finding stays.

| Expectation | Holds when |
|---|---|
| `same-diagrams` | The markdown is unchanged outside the mermaid fences, once whitespace in text is collapsed, and the document holds the same number of diagrams. Each diagram keeps its keyword, whether it parses, its diagram type, its node, edge and subgraph counts, its deepest nesting, its tree depth, its node ids and its subgraph names. |
| `same-tree` | The markdown tree is identical, except for whitespace in prose text. Mermaid fence bodies must match exactly, and no diagram that parsed may stop parsing. In a `.mmd` or `.mermaid` file the tree is empty, so the diagram must also pass the `same-diagrams` check. |

Whether a diagram parses is the test `parse-diagram-unparseable` applies.
Under `same-diagrams` it must not change in either direction, so an edit can neither break a diagram nor be the edit that repairs one.
`same-diagrams` does not compare the edge list, so an edge's endpoints, direction and arrow type can change.
It does not compare labels, node text or style directives either.
A fixer that declares it must therefore keep those intact itself, because the engine will not refuse a change to them.

The engine applies an edit, parses the document again, and keeps the edit only when its expectation holds.
A fixer that throws, returns something other than a list, or returns an edit with no valid expectation stops the run with `error[plugin-fixer]`.

A fixer must be idempotent: once its edit is applied, it proposes nothing for the same text.
The engine runs every fixer again after each kept edit, until none proposes a change.
A fixer that keeps proposing edits stops the run after 1000 passes with `error[fix-not-converging]`, naming its rule, and that file is not written.

## Testing helpers

Import from `@jpeakai/mermaidjs-lint/testing`.

| Function | Returns |
|---|---|
| `localPlugin(key, module)` | The plugin the loader would build from one local rule file |
| `checkRule(plugin, key, source, run?)` | The findings one rule reports for `source` |
| `fixRule(plugin, key, source, run?)` | `{ output, applied, refused }` after the rule's fixer has run to a fixpoint |

`run` may hold `options` for the rule, `flags` such as `{ preset, profile }`, and a `file` name, which defaults to `test.md`.
A name ending in `.mmd` or `.mermaid` treats the source as a standalone diagram.

## Load errors

A plugin that fails to load stops the run with exit code 1 and `error[code]`, unless the run is lenient.

| Code | Cause |
|---|---|
| `plugin-import` | The module could not be imported |
| `plugin-contract` | The export breaks the contract: a field is missing or of the wrong type, the API version differs, or two local rule files share one name |
| `plugin-conflict` | Another plugin already claimed the namespace or a category word, or two local rule files declare one category with different descriptions |
| `plugin-not-installed` | A declared plugin package is not installed |
| `plugin-source` | The source cannot be loaded, such as a `.cts` file, TypeScript on a runtime that cannot import it, or a plugin package whose `package.json` is not a JSON object |

A fixer that misbehaves during a run stops it with `error[plugin-fixer]`, as [Edits](#edits) describes.
[Error codes](cli.md#error-codes) lists every code the command can print.
