# Security policy

How to report a vulnerability in `@jpeakai/mermaidjs-lint`, and what the tool trusts.

## Supported versions

Only the latest release on npm receives security fixes.
The package is at `0.x`, so a fix ships as a new release rather than a patch to an older line.
`mermaidjs-lint --version` prints the version you run.

## Report a vulnerability privately

Use a [GitHub security advisory](https://github.com/jpeakai/jpai-mermaidjs-lint/security/advisories/new) to report it.
Do not open a public issue for a vulnerability.
Include the version, the command, and the smallest input that shows the problem.

## The trust model

The linter reads markdown and diagram text as data, and never runs it.
A plugin is different: it is code, and it runs with your permissions.

- **Plugins load on their own.** A run imports every file in `.mermaidjs-lint/rules`, and every dependency named `mermaidjs-lint-plugin-*` that the project declares.
- **Only declared code runs.** `node_modules` is never scanned, so a package the project does not depend on cannot load.
- **`--no-plugins` loads no plugin.** Use it to lint a repository you do not trust on your own machine.
- **`--no-plugins` is not a CI boundary.** On a pull request from a fork, the workflow file and the dependency install both come from the fork. The install can run its own scripts before the linter starts. The boundary there is GitHub's read-only `pull_request` token with no secrets.

[The plugin model](https://jpeakai.github.io/jpai-mermaidjs-lint/concepts/plugin-model/) explains discovery and loading in full.
