# Security policy

How to report a vulnerability in `@jpeakai/mermaidjs-lint`, and what the tool trusts.

## Supported versions

Only the latest release on npm receives security fixes.
The package is at `0.x`, so a fix ships as a new release rather than a patch to an older line.
`mermaidjs-lint --version` prints the version you run.
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
Three kinds of file are code, and they run with your permissions.

- **Local rules.** A run imports every file in `.mermaidjs-lint/rules`.
- **Plugin packages.** A run imports every dependency named `mermaidjs-lint-plugin-*` that the project's `package.json` declares, and every entry in the config's `plugins` list.
- **A `.mjs` config.** `mermaidjs-lint.config.mjs` is a module, so reading it runs it. A `.json` config is only parsed.

What each flag changes:

- **Only declared code loads.** No folder of `node_modules` is scanned, so an installed package the project does not declare is never loaded.
- **`--no-plugins` loads no local rule and no plugin, and never imports a `.mjs` config.** A run that finds one stops with `error[config-code]` and exit 2, before importing it. A `.json` config is still read, for its rule settings.
- **`--no-plugins` does not make an untrusted repository safe.** Installing a repository's dependencies already runs their install scripts, before the linter starts. Lint an untrusted repository without installing its dependencies, and run `mermaidjs-lint --no-plugins --config <your-own.json>`.
- **`--no-plugins` is not a CI boundary.** On a pull request from a fork, the workflow file and the dependency install both come from the fork. The boundary there is GitHub's read-only `pull_request` token with no secrets.

[The plugin model](https://jpeakai.github.io/jpai-mermaidjs-lint/concepts/plugin-model/) explains discovery and loading in full.
