# Command line

The `mermaidjs-lint` command, as installed with the package.
To use it in a pipeline, see [Gate diagrams in CI](../guides/ci.md).

## Help

The text below is generated from `mermaidjs-lint --help` when this site is built.

```text
--8<-- "cli-help.txt"
```

## Paths

| Path | What is checked |
|---|---|
| A `.md` or `.markdown` file | Every mermaid fence in it |
| A `.mmd` file | The whole file, as one diagram |
| A directory | Every such file beneath it, skipping dot-folders and vendored or build folders such as `node_modules`, `dist` and `tmp` |

A file named explicitly is checked whatever its extension.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | No findings remain |
| 1 | Findings remain, a plugin failed to load, or the run failed |
| 2 | A usage error: an unknown flag, a missing path, or a bad config file |

## Text output

One line per finding, then a summary:

```text
docs/architecture.md:6 contrast-text-below-aa classDef warn: text 1.43:1 < 4.5 (#ffffff on #ffd400)
1 finding(s) in 1 file(s)
```

A line reads `file:line rule message`.
A finding that spans a diagram prints its first and last line, as `file:3-7`.
A line on standard error reports which plugins loaded, when any did.

## JSON output

`--json` prints one object:

```json
{
  "findings": [
    {
      "file": "docs/architecture.md",
      "line": 6,
      "endLine": 6,
      "rule": "contrast-text-below-aa",
      "message": "classDef warn: text 1.43:1 < 4.5 (#ffffff on #ffd400)",
      "remediation": "Darken or lighten the fill, or change color:, until the ratio reaches 4.5:1 in every theme."
    }
  ],
  "files": 1,
  "plugins": [],
  "skippedPlugins": []
}
```

| Key | Holds |
|---|---|
| `findings` | Each finding: file, first and last line, rule id, message, and a remediation when the rule gives one |
| `files` | How many files were checked |
| `plugins` | The plugins that loaded |
| `skippedPlugins` | Plugins found but not loaded, as with `--no-plugins` |
