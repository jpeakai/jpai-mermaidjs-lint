# Writing plugins and local rules

How to add a rule of your own, as a file in your project or as a package.
The decision behind it is [MJL-0007](../adrs/0007-plugins-follow-the-prose-gates-contract.md).

## Contents

- [A local rule in one file](#a-local-rule-in-one-file)
- [What a rule receives](#what-a-rule-receives)
- [Findings and fixes](#findings-and-fixes)
- [A plugin package](#a-plugin-package)
- [Configuring a rule](#configuring-a-rule)
- [Testing a rule](#testing-a-rule)
- [When a load fails](#when-a-load-fails)

## A local rule in one file

Create `.mermaidjs-lint/rules/parse-no-todo.mjs`.
The file name is the rule key, and the rule is the default export.

```js
export default {
  category: "parse",
  summary: "a TODO left in a diagram",
  check: ({ doc }) =>
    doc.diagrams
      .filter((d) => d.source.includes("TODO"))
      .map((d) => ({ line: d.startLine, endLine: d.endLine, message: "TODO left in a diagram" })),
};
```

Run `mermaidjs-lint README.md`.
The rule loads on its own, and a finding reads `README.md:12-20 local/parse-no-todo TODO left in a diagram`.

The key must start with its category, written `category-short-name`.
A key that breaks that convention fails the load.

## What a rule receives

A check receives one context object.

| Field | What it holds |
|---|---|
| `doc` | The parsed file: `src`, `kind`, `tree` and `diagrams` |
| `file` | The path being checked |
| `options` | The rule's options from the config, already checked against the types it declared |
| `helpers` | `detectKeyword`, `wcagRatio` and `compositeOver`, so a rule needs no import |

A diagram has `source`, `keyword`, `startLine`, `endLine`, `firstLine`, `terminated` and `directives`.
`await diagram.stats()` returns the nodes, edges, subgraphs and nesting depth that mermaid's parser reads.
The parse happens once per diagram, and every rule shares it.

## Findings and fixes

A finding is `{ line, message }`, with an optional `endLine` and `remediation`.
The engine adds the rule id and the file, so a plugin cannot report as another rule.

A fixer returns edits of the form `{ start, end, text, expect }`.
The offsets are into `doc.src`, and `diagram.offsetOf(span)` maps a directive value back to its offset.
The expectation is `same-diagrams` or `same-tree`.
The engine splices one edit, parses the document again, and keeps the edit only when the proof holds.
A refused edit leaves the finding reported.

## A plugin package

A package exports `{ meta, rules }` as its default.

```js
export default {
  meta: { name: "acme", namespace: "acme", apiVersion: 1, categories: { house: "Acme house style" } },
  rules: {
    "house-no-todo": {
      category: "house",
      summary: "a TODO left in a diagram",
      check: ({ doc }) => doc.diagrams.filter((d) => d.source.includes("TODO")).map((d) => ({ line: d.startLine, message: "TODO" })),
    },
  },
};
```

Name the package `mermaidjs-lint-plugin-acme` or `@scope/mermaidjs-lint-plugin-acme`, and list it as a dependency.
Its rules load as `acme/house-no-todo`.
The namespace comes from `meta.namespace` only, and `local` is reserved.

## Configuring a rule

A plugin rule is switched off and given options exactly like a built-in.

```json
{ "rules": { "acme/house-no-todo": "off" } }
```

A rule declares the options it accepts, as names mapped to `number`, `string`, `boolean` or `string[]`.
The config is checked against that declaration before any file is read.

## Testing a rule

`@jpeakai/mermaidjs-lint/testing` runs a rule over real strings with the same loader checks and verified fix engine as a real run.

```ts
import { checkRule, fixRule, localPlugin } from "@jpeakai/mermaidjs-lint/testing";
import * as mod from "../.mermaidjs-lint/rules/parse-no-todo.mjs";

const plugin = localPlugin("parse-no-todo", mod);
const findings = await checkRule(plugin, "parse-no-todo", "```mermaid\nflowchart LR\n  A --> B %% TODO\n```\n");
```

## When a load fails

A run stops with `error[code]` naming the source and the reason.
The codes are `plugin-import`, `plugin-contract`, `plugin-conflict`, `plugin-not-installed` and `plugin-source`.
`--lenient-plugins` leaves a failed plugin out and says so, and `--validate-plugins` reports every failure at once.
A plugin is code that runs on your machine, so `--no-plugins` gives a baseline run for a repository you do not trust.
