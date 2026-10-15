# Troubleshooting

Answers to the questions a first week with the linter raises.
Each entry starts from what you see, then gives the fix.
The commands assume the package is a dev dependency, as in [Get started](../get-started.md), because the short name `mermaidjs-lint` works only then.

## The run exits 2 with an error line

Exit code 2 means the command could not start the check.
The first line of standard error names the cause as `error[code]`, and the usage lines that follow it are a reminder.

| First line | Cause | Fix |
|---|---|---|
| `error[flag]: cannot read <path>` | A path you named does not exist | Pass only paths that exist, such as `docs/` |
| `error[flag]: no matching files` | The paths hold no markdown, `.mmd` or `.mermaid` file outside the skipped folders | Point at the folder that holds your diagrams |
| `error[flag]: no files given` | No path was named | Name at least one file or folder |
| `error[flag]: Unknown option '--x'` | A misspelt flag, or one newer than your installed version | Check the flag in `--help` |
| `error[unknown-rule]` | The config names a rule that is not loaded | See [A plugin rule id is unknown](#a-plugin-rule-id-is-unknown) |
| `error[rule-option]` | A rule option has the wrong name or type | Match the option to [Config file](../reference/configuration.md#rule-options) |
| `error[canvas-profile]` | A canvas from one source met a `mkdocs-material` profile from the other: a `--canvas-light` or `--canvas-dark` flag on a file that the config or `auto` scores under `mkdocs-material`, or a config canvas with `--profile mkdocs-material` | Run the canvas flags over the GitHub-rendered paths only, or set the canvas in the config, which a file `auto` scores under Material sets aside. For an explicit profile, drop `--profile mkdocs-material` or the rule's `profile` option, or drop the canvas. Both from flags is `error[flag]`, and both on one config rule is `error[rule-option]`. See [A host with its own page sets a canvas](../concepts/contrast.md#a-host-with-its-own-page-sets-a-canvas). |
| `error[config-code]` | A `.mjs` config under `--no-plugins` | Pass `--config` with a `.json` config, or drop `--no-plugins` |
| `error[config-file]`, `error[config-shape]` or another `config-` code | The config cannot be read or has the wrong shape | Fix the file the error names |

[Error codes](../reference/cli.md#error-codes) lists every code.

## README.md fails after adding mkdocs.yml

The `auto` profile scores a file as Material renders it when any parent folder holds `mkdocs.yml` or `mkdocs.yaml`.
A `mkdocs.yml` at the repository root is a parent of `README.md`, so `README.md` is scored as Material although GitHub draws it.

Move the site into its own folder, or lint the root files with `--profile github` in a separate run.
[Lint a MkDocs Material site](mkdocs.md#keep-readmemd-scored-as-github-renders-it) shows both.

## One diagram fails and you want to skip it

There is no comment that silences one diagram, and no warning level.
A run that exits 0 must have nothing to report, per [MJL-0003](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/adrs/0003-findings-fail-or-the-rule-is-off.md).
An inline disable would let a clean run hide a diagram nobody checked.

Instead:

- **Fix the diagram.** Run `--fix` first, then fix by hand what it leaves.
- **Raise the threshold.** A complexity finding moves with the rule's options, such as `nodeHardLimit`, in the [config file](../reference/configuration.md#complexity-rules).
- **Switch the rule off.** Set its id to `"off"`, which applies to every diagram.
- **Leave the file out of the run.** Name the paths to lint, rather than a folder that holds the file.

## A file or folder should not be linted

There is no ignore option.
A directory walk already skips dot-folders and `node_modules`, `vendor`, `dist`, `build`, `tmp` and `__pycache__`.
To leave anything else out, pass the files and folders to lint by name:

```sh
bunx mermaidjs-lint README.md docs/guides/ docs/reference/
```

## In a monorepo, the wrong config is read

The project root comes from the working directory, not from the paths you pass.
It is the nearest folder upwards holding a `package.json`, a config file or a `.mermaidjs-lint` folder.

- **Run from the package's folder** to use that package's config and plugins.
- **Pass `--config`** to read a config from anywhere.
- **Pass `--profile github`** for packages GitHub draws, when a `mkdocs.yml` sits above them. The `auto` profile climbs past the package to find it, as [Lint a MkDocs Material site](mkdocs.md#run-it-on-the-docs-folder) explains.

Plugins are discovered from the project root's `package.json` and `.mermaidjs-lint/rules`, so they follow the working directory too.

## A plugin rule id is unknown

`error[unknown-rule]` for an id such as `acme/acme-direction` means no loaded plugin has that rule.

- **Check the plugin is declared.** Its package must be in the project's `dependencies`, `devDependencies` or `optionalDependencies`, and installed.
- **Check the id.** `mermaidjs-lint --list-rules` prints every loaded rule under its real id.
- **Expect it under `--no-plugins`.** That run sets aside settings for plugin rules, and standard error says so, so it never fails on them. Version 0.1.1 fails on them instead.

## A TypeScript local rule fails to load

`error[plugin-source]` on a `.ts` or `.mts` rule means the runtime cannot import TypeScript.
The installed command starts with Node, even under `bunx`, so run it on Bun with `bunx --bun mermaidjs-lint`.
On Node, use 22.18 or newer (23.6 or newer on Node 23).

## A `.js` local rule fails with `Unexpected token 'export'`

`error[plugin-import]` with `Unexpected token 'export'` on a `.js` or `.ts` rule means Node read it as CommonJS.
Either the project's `package.json` says `"type": "commonjs"`, which `npm init -y` writes in npm 11.
Or it has no `"type"` field and Node is 20.18 or older, any 21 release, or 22.0 to 22.6.
Rename the file to `.mjs` or `.mts`, or set `"type": "module"`, as [Choose the file extension](local-rule.md#choose-the-file-extension) explains.

## You are filing a bug report

Print the version with:

```sh
bunx mermaidjs-lint --version
```

Version 0.1.1 has no `--version` flag, so print it there with `npm ls @jpeakai/mermaidjs-lint`.

Then open an issue at [GitHub issues](https://github.com/jpeakai/jpai-mermaidjs-lint/issues) with:

- The version.
- The command you ran.
- The diagram, or the smallest file that shows the problem.
- The output of the same command with `--json`.

Report a vulnerability privately instead, as [SECURITY.md](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/SECURITY.md) describes.
