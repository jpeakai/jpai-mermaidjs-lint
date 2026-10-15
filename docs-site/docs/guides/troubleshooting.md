# Troubleshooting

Answers to the questions a first week with the linter raises.
Each entry starts from what you see, then gives the fix.

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

Plugins are discovered from the project root's `package.json` and `.mermaidjs-lint/rules`, so they follow the working directory too.

## A plugin rule id is unknown

`error[unknown-rule]` for an id such as `acme/house-left-to-right` means no loaded plugin has that rule.

- **Check the plugin is declared.** Its package must be in the project's `dependencies`, `devDependencies` or `optionalDependencies`, and installed.
- **Check the id.** `mermaidjs-lint --list-rules` prints every loaded rule under its real id.
- **Expect it under `--no-plugins`.** That run sets aside settings for plugin rules, and standard error says so, so it never fails on them.

## A TypeScript local rule fails to load

`error[plugin-source]` on a `.ts` or `.mts` rule means the runtime cannot import TypeScript.
The installed command starts with Node, even under `bunx`, so run it on Bun with `bunx --bun mermaidjs-lint`, or use Node 22.18 or newer.

## You are filing a bug report

Print the version with:

```sh
bunx mermaidjs-lint --version
```

Then open an issue at [GitHub issues](https://github.com/jpeakai/jpai-mermaidjs-lint/issues) with:

- The version.
- The command you ran.
- The diagram, or the smallest file that shows the problem.
- The output of the same command with `--json`.

Report a vulnerability privately instead, as [SECURITY.md](https://github.com/jpeakai/jpai-mermaidjs-lint/blob/main/SECURITY.md) describes.
