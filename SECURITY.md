# Security policy

How to report a vulnerability in `@jpeakai/mermaidjs-lint`, and what the tool trusts.

## Supported versions

Only the latest release on npm receives security fixes.
The package is at `0.x`, so a fix ships as a new release rather than a patch to an older line. `mermaidjs-lint --version` prints the version you run.
Releases up to 0.1.1 lack that flag, and `npm ls @jpeakai/mermaidjs-lint` prints the version instead.

## Report a vulnerability privately

Use a [GitHub security advisory](https://github.com/jpeakai/jpai-mermaidjs-lint/security/advisories/new) to report it.
Private vulnerability reporting is enabled on the repository, so the form works for anyone with a GitHub account.
Do not open a public issue for a vulnerability.
Include the version, the command, and the smallest input that shows the problem.

## What happens after you report

- **Acknowledgement within 7 days.** The maintainer replies on the advisory to confirm it was received.
- **An assessment follows.** The reply says whether the report is accepted as a vulnerability, and why.
- **The fix ships in a new release.** The advisory stays private until that release is on npm.
- **Disclosure is coordinated.** The advisory is published when the fix ships, crediting you unless you ask otherwise.
- **Please wait for the fix.** Keep the details private until the advisory is published, or for 90 days after your report, whichever comes first.

## The trust model

The linter reads markdown and diagram text as data, and never runs it.
Four kinds of file are code, and they run with your permissions.

- **Local rules.** A run imports every file in `.mermaidjs-lint/rules`.
- **Plugin packages.** A run imports every declared dependency named `mermaidjs-lint-plugin` or `mermaidjs-lint-plugin-*`, scoped or not, and every entry in the config's `plugins` list.
- **A `.mjs` config.** `mermaidjs-lint.config.mjs` is a module, so reading it runs it.
  A `.json` config is only parsed.
- **The package runner's own config.** Bun reads `bunfig.toml` in the working folder, and npm reads the project's `.npmrc`.
  A `preload` or a `node-options=--import=...` there runs code before the linter starts.

Every source above is found from the project root.
That is the nearest folder at or above the working folder that holds a `package.json`, a config file or a `.mermaidjs-lint` folder.
Running from a subfolder of a checkout therefore still loads the checkout's code. `--list-rules` and `--validate-plugins` import every plugin too, because they load them to list or check them.

What each flag changes:

- **Only declared code loads.** No folder of `node_modules` is scanned, so an installed package the project does not declare is never loaded.
- **`--no-plugins` loads no local rule and no plugin, and never imports a `.mjs` config.** A run that finds one stops with `error[config-code]` and exit 2, before importing it.
  A `.json` config is still read, for its rule settings.
  A malformed project `package.json` does not stop it, because it loads nothing that file names.
- **`--no-plugins` does not make an untrusted repository safe.** Installing a repository's dependencies already runs their install scripts.
  Starting the runner inside the checkout reads its `bunfig.toml` or `.npmrc`.
  Both happen before the linter starts.
- **`--no-plugins` is not a CI boundary.** On a pull request from a fork, the workflow file and the dependency install both come from the fork.
  The boundary there is GitHub's read-only `pull_request` token with no secrets.

## Lint a repository you do not trust

Run an installed linter from a folder you control, and name the checkout's files by path.
Never install the checkout's dependencies, and never start the runner inside it.

```sh
mkdir lint-runner
cd lint-runner
npm init -y
npm install --save-dev @jpeakai/mermaidjs-lint
echo '{}' > lint.json
npx --no-install mermaidjs-lint --no-plugins --config lint.json /path/to/checkout/docs
```

With Bun, run `bun add --dev @jpeakai/mermaidjs-lint`, then `bunx --bun --no-install mermaidjs-lint` with the same flags.
The project root is then `lint-runner`, so no local rule, plugin, config or runner config from the checkout loads. `--no-plugins` and `--config` keep the run to the built-in rules, even if `lint-runner` gains a plugin later.

[The plugin model](https://jpeakai.github.io/jpai-mermaidjs-lint/concepts/plugin-model/) explains discovery and loading in full.
