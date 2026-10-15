# The plugin model

Every team has diagram rules of its own: a house palette, a banned word, a required title.
Plugins let you add those rules without forking the tool.
This page explains where plugin rules come from, how they are checked, and how they join the built-in rules.

## A plugin rule is a built-in with a namespace

A plugin rule receives exactly the context a built-in rule receives, and returns the same findings and edits.
When it loads, it becomes an ordinary rule whose id is `namespace/key`, such as `acme/house-no-todo`.
From then on the config, the fix engine and the output treat it like a built-in.

--8<-- "plugin-model.md"

??? info "Detailed: plugin, config and registry fields"

    A plugin may declare new category words, the config sets a severity and options per rule id, and the registry keeps only the rules the config leaves on.

    --8<-- "plugin-model-detail.md"

The engine adds the rule id and the file to every finding, and the rule id to every edit.
A plugin therefore cannot report under another rule's name.

## Three places a rule can come from

Discovery reads three places, in this order:

1. **Local rule files** in `.mermaidjs-lint/rules` at the project root. Each file is one rule, and all of them load together as one plugin under the reserved namespace `local`.
2. **Declared dependencies** whose name matches `mermaidjs-lint-plugin` or `mermaidjs-lint-plugin-*`, scoped or not. Only the project's own `dependencies`, `devDependencies` and `optionalDependencies` are read.
3. **Paths or names listed** under `plugins` in the config file.

`node_modules` is never scanned for plugins.
Only declared names and local rule files load, and a declared name resolves from the nearest `node_modules` at or above the project root.
That matters because a plugin is code that runs on your machine.

A plugin is not the only code a run can execute.
A `mermaidjs-lint.config.mjs` is a module, so reading it runs it, and each `plugins` entry in the config names more code to load.
`--no-plugins` loads no plugin and never imports a `.mjs` config, so a run uses the built-in rules and at most a `.json` config.
Faced with a `.mjs` config, it stops with `error[config-code]`, and `--config` with a `.json` config of your own lets it run.
It does not make a repository you do not trust safe, because installing its dependencies has already run their code.
[SECURITY.md](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/SECURITY.md) states the full trust model.

## Loading checks the contract before anything runs

Each source is imported, and its default export is checked against the plugin contract.

--8<-- "plugin-loading.md"

??? info "Detailed: discovery order, checks and the four modes"

    Discovery reads three places in a fixed order, and the mode decides what a failure does.

    --8<-- "plugin-loading-detail.md"

The contract is versioned by `apiVersion`, so a plugin built for another version fails at load with both numbers, not halfway through a run.
Checking every field up front means a typo in a plugin stops the run with its reason, before any file is read.
[Plugin API](../reference/plugin-api.md) lists every field the check covers.

## Namespaces and categories are global

Two plugins cannot share a namespace, and two plugins cannot declare the same new category word.
The first plugin to claim one keeps it.
A later claimant fails to load, and the error names both.
Without that rule, two plugins could produce identical rule ids, and a config line could switch off the wrong one.

## The mode decides what a failure does

| Mode | Chosen by | A failed plugin |
|---|---|---|
| strict | The default | Stops the run with `error[code]` |
| lenient | `--lenient-plugins`, or `"pluginLoading": "lenient"` | Is left out, and the run says so |
| collect | `--validate-plugins` | Is left out, and every failure is reported at the end. No file is checked. |
| off | `--no-plugins`, or `"plugins": false` | Nothing is loaded. Discovery still runs, and every plugin it found is reported as skipped. |

Strict is the default because a gate that silently drops a rule would pass files it never checked.
Outside strict mode, a config setting for a plugin rule that did not load is set aside, and the run says so.
A setting for a built-in id that does not exist still fails with `error[unknown-rule]`.

## A broken check is a finding, a broken fixer stops the run

A plugin check cannot take the run down.
Suppose it throws, or returns something other than a list of `{ line, message }` findings.
That becomes one finding for that rule at line 1, and the other rules carry on.
The gate still fails, so the broken rule is noticed.

A plugin fixer gets no special trust.
It stops the run if it throws, returns something other than a list, or returns an edit with no valid expectation.
An edit with offsets outside the source is refused like any other edit that fails verification, and the finding stays.

## Next

- [Write a local rule](../guides/local-rule.md) to try this in five minutes.
- [Publish a plugin package](../guides/plugin-package.md) to share rules between projects.
- [Plugin API](../reference/plugin-api.md) for every field of the contract.
