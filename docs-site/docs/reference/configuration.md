# Configuration file

The optional file that switches rules off and sets their options.
To learn the workflow, see [Configure the rules](../guides/configure.md).

## Location

| File | Format |
|---|---|
| `mermaidjs-lint.config.json` | JSON |
| `mermaidjs-lint.config.mjs` | An ES module whose default export is the config object |

The file is read from the project root.
That is the first folder, searching upwards from the working directory, that holds a `package.json`, a config file or a `.mermaidjs-lint` folder.
`--config FILE` reads another file instead.
Two config files at the root is an error.

## Keys

| Key | Type | Default | Meaning |
|---|---|---|---|
| `rules` | object | `{}` | A setting per rule id |
| `plugins` | string list, or `false` | `[]` | Extra plugin paths or package names to load. `false` loads no plugins at all. |
| `pluginLoading` | `"strict"` or `"lenient"` | `"strict"` | Whether a plugin that fails to load stops the run or is skipped |

Any other key is an error.

## Rule settings

A rule id maps to a severity, or to a severity and options:

```json
{
  "rules": {
    "contrast-directive-unauditable": "off",
    "complexity-node-count-hard-limit": ["error", { "nodeHardLimit": 80 }]
  }
}
```

| Severity | Meaning |
|---|---|
| `"error"` | The rule runs, and its findings fail the run. This is the default. |
| `"off"` | The rule does not run |

Plugin rules are set the same way, by their `namespace/key` id.

## Rule options

| Rules | Option | Type | Values |
|---|---|---|---|
| The three contrast rules | `profile` | string | `auto`, `github`, `mkdocs-material`. See [Contrast profiles](../concepts/contrast.md). |

## Complexity options

Every complexity rule takes the same options.

| Option | Type | Meaning |
|---|---|---|
| `preset` | string | `low-density`, `medium-density` or `high-density`, or the aliases `low`, `medium` and `high` |
| `nodeAcceptable`, `nodeComplex`, `nodeHardLimit` | number | The node-count bands |
| `vcsAcceptable`, `vcsComplex` | number | The score bands |
| `nodeTarget`, `vcsTarget` | number | The size a finding suggests splitting down to |
| `edgeWeight`, `subgraphWeight`, `depthWeight` | number | The weights of the [visual complexity score](../concepts/complexity.md#two-measures) |
| `nodeIdeal`, `vcsIdeal`, `vcsCritical` | number | Accepted, but no rule reads them yet |

A threshold option overrides the preset's value.
The preset values are:

--8<-- "presets-table.md"

## Errors

A bad config stops the run before any file is read, with exit code 2 and `error[code]`.

| Code | Cause |
|---|---|
| `config-file` | The file cannot be read or parsed, or is neither `.json` nor `.mjs` |
| `config-not-found` | The file given to `--config` does not exist |
| `config-ambiguous` | More than one config file at the project root |
| `config-shape` | An unknown key, or a key of the wrong type |
| `rule-setting` | A setting that is not a severity, or a severity and options |
| `unknown-rule` | A rule id that does not exist |
| `rule-option` | An option the rule does not declare, or a value of the wrong type |
