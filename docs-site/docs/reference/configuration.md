# Config file

The optional file that switches rules off and sets their options.
To learn the workflow, see [Configure the rules](../guides/configure.md).

## Location

| File | Format |
|---|---|
| `mermaidjs-lint.config.json` | JSON |
| `mermaidjs-lint.config.mjs` | An ES module whose default export is the config object |

The file is read from the project root.
That is the first folder, searching upwards from the working directory, that holds a `package.json`, a config file or a `.mermaidjs-lint` folder.
With no such folder, the project root is the working directory.
`--config FILE` reads another file instead.
Two config files at the root is an error.

A `.mjs` config is code, and reading it runs that code.
Under `--no-plugins` a `.mjs` config is never imported, and the run stops with `error[config-code]` instead.
A `.json` config is read as usual.

## Keys

| Key | Type | Default | Meaning |
|---|---|---|---|
| `rules` | object | `{}` | A setting per rule id |
| `plugins` | string list, or `false` | `[]` | Extra plugin paths or package names to load. `false` loads no plugins at all. |
| `pluginLoading` | `"strict"` or `"lenient"` | `"strict"` | Whether a plugin that fails to load stops the run or is skipped |

Any other key is an error.

An entry in `plugins` that starts with `.` or is absolute is a path, resolved against the project root.
Any other entry is a package name, resolved from the project root upwards:

```json
{ "plugins": ["./tools/diagram-rules.mjs", "@acme/mermaidjs-rules"] }
```

## Rule settings

A rule id maps to a severity, or to a severity and options:

```json
{
  "rules": {
    "contrast-directive-unauditable": "off",
    "complexity-node-count-cognitive-limit": ["error", { "nodeHardLimit": 80 }],
    "complexity-node-count-hard-limit": ["error", { "nodeHardLimit": 80 }]
  }
}
```

A threshold is the boundary between two neighbouring bands, so set it on both rules that read it.
Set on one rule alone, it opens a gap or an overlap, and an overlap makes two rules report the same diagram.
[Each measure is a ladder](../concepts/complexity.md#each-measure-is-a-ladder) shows which rules read each threshold.

| Severity | Meaning |
|---|---|
| `"error"` | The rule runs, and its findings fail the run. This is the default. |
| `"off"` | The rule does not run |

Plugin rules are set the same way, by their `namespace/key` id.
Under `--no-plugins` or a lenient run, a setting for a plugin rule that did not load is set aside, and standard error says so.
A built-in id that does not exist always fails with `error[unknown-rule]`.

## Rule options

Each rule declares the options it takes.

### Contrast rules

| Rules | Option | Type | Values |
|---|---|---|---|
| The three contrast rules | `profile` | string | `auto`, `github`, `mkdocs-material`. See [Contrast profiles](../concepts/contrast.md). |

### Complexity rules

Every complexity rule accepts the same options.
`complexity-subgraph-nesting-too-deep` accepts them but reads none, because its limit is fixed at three levels.

| Option | Type | Meaning |
|---|---|---|
| `preset` | string | `low-density`, `medium-density` or `high-density`, or an alias from [Flags](cli.md#flags) |
| `nodeAcceptable`, `nodeComplex`, `nodeHardLimit` | number | The node-count bands |
| `vcsAcceptable`, `vcsComplex` | number | The score bands. `vcsComplex` is the complex threshold that `complexity-visual-score-critical` fires above. |
| `nodeTarget`, `vcsTarget` | number | The size a finding suggests splitting down to |
| `edgeWeight`, `subgraphWeight`, `depthWeight` | number | The weights of the [visual complexity score](../concepts/complexity.md#two-measures) |
| `nodeIdeal`, `vcsIdeal`, `vcsCritical` | number | Accepted, but no rule reads them yet |

A threshold option overrides the preset's value.
A `--preset` or `--profile` flag overrides the `preset` or `profile` option, but not a threshold option.
[Precedence](cli.md#precedence) gives the full order.
The preset values are:

--8<-- "presets-table.md"

## Errors

A bad config stops the run before any file is read, with exit code 2 and `error[code]`.
The codes are listed below.

- `config-file`
- `config-not-found`
- `config-code`
- `config-ambiguous`
- `config-shape`
- `rule-setting`
- `unknown-rule`
- `rule-option`

[Error codes](cli.md#error-codes) gives the cause of each.
