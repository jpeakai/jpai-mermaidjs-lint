# Reference

Lookup pages: what each rule, flag, config key and type is, with no tutorial on the way.
Each page links to the guide that shows it in use.

| Page | What it lists |
|---|---|
| [Rules](rules.md) | Every built-in rule, with its examples drawn before and after `--fix` |
| [Command line](cli.md) | Every flag, the exit codes, the error codes and the output formats |
| [Config file](configuration.md) | The config keys, rule settings and rule options |
| [Document model](document-model.md) | The parsed file every rule reads: diagrams, style directives and stats |
| [Plugin API](plugin-api.md) | The plugin contract, findings, edits and the testing helpers |
| [Library API](library-api.md) | Every export of the package, for use from code |

## Rules at a glance

--8<-- "rules-table.md"

## Requirements and compatibility

| Need | What is supported |
|---|---|
| Runtime | Bun, or Node `>=20`, the `engines` field of `package.json` |
| Mermaid | The `mermaid` package at `^11.14.0`, and `@mermaid-js/parser`, both installed with this package |
| TypeScript local rules | `bunx --bun mermaidjs-lint`, or Node 22.18 or newer |

`npm ls mermaid` in your project prints the mermaid version a run uses.
A host such as GitHub draws diagrams with its own mermaid version.
A diagram type newer than the host's mermaid may parse here and still fail to draw there.

Each diagram type is read by one of two parsers, and the `parser_used` field of its [stats](document-model.md#diagramstats) says which:

| Parser | Diagram types |
|---|---|
| Langium, from `@mermaid-js/parser` | `architecture-beta`, `architecture`, `info`, `pie`, `gitGraph`, `packet-beta`, `packet`, `radar-beta`, `radar`, `treemap-beta`, `treemap`, `treeView-beta`, `treeView`, `wardley-beta`, `wardley` |
| Mermaid core, under a DOM shim | Every other type mermaid registers, such as `flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram` and `erDiagram` |

A Langium type that its grammar rejects is tried again under mermaid core before it is reported.

## Versioning

The package follows semantic versioning.
While it is at `0.x`, a minor release may break the public surface, and a patch release does not.

The public surface is:

- The rule ids, and the category each rule belongs to.
- The `--json` output shape.
- The exit codes and error codes.
- The plugin contract, versioned by `meta.apiVersion`. A contract change that breaks a plugin raises it, and a plugin built for the old version fails to load with both numbers.
- The types and functions the package exports.

Finding message text is not part of it, so match on the rule id, not the message.
[GitHub Releases](https://github.com/jpeakai/jpai-mermaidjs-lint/releases) is the changelog.
