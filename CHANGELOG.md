# Changelog

Every change a user of `@jpeakai/mermaidjs-lint` can see, by release.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows [semantic versioning](https://semver.org/).
While the package is at `0.x`, a minor release may break the public surface that [Versioning](https://jpeakai.github.io/jpai-mermaidjs-lint/reference/#versioning) lists.

The docs site and the README describe the `main` branch.
Anything under `Unreleased` is on `main` but not yet on npm.

## Unreleased

Nothing yet.

## 0.2.0 - 2026-10-15

### Added

- `--version` prints the version, to quote in a bug report.
- A `.mermaid` file is read as a raw diagram, as a `.mmd` file is.
- A `linkStyle` `color:` is scored as edge label text, against Mermaid's own label box in light and dark, under the `github` profile.
- Profile `auto` also reads `mkdocs.yaml`, not only `mkdocs.yml`, as a sign that the site renders through Material.
- `skills/mermaidjs-lint/` is an agent skill that drives the linter, with a live eval suite.
- A documentation site at <https://jpeakai.github.io/jpai-mermaidjs-lint/>, with the rules drawn before and after `--fix`.

### Changed

- `parse-diagram-unparseable` reports any diagram mermaid's parser reports an error for, on one line or many.
- A valid diagram with no nodes, such as `pie` with a `title` line or `info`, is no longer reported as unparseable.
- The parse finding's message carries the parser's own reason.
- `complexity-visual-score-critical` names the complex threshold, `vcsComplex`, which is the value it compares against.
- `--help` states which setting wins: a threshold option, then a `--preset` or `--profile` flag, then the config's preset or profile.
- `--help` lists the folders a directory walk skips.
- The npm page links the docs site as the package's homepage.
- `--no-plugins` sets aside a config setting for a plugin rule, instead of failing on it as an unknown rule.
- A usage error prints the error and a short usage line, rather than the whole help.
- `--help` links the rules page on the docs site instead of `RULES.md`.

### Security

- `--no-plugins` no longer imports a `mermaidjs-lint.config.mjs`, which is code. The run stops with `error[config-code]` and exit 2 instead, and `--config` with a `.json` config lets it run.

## 0.1.1 and earlier

The notes for these releases are on [GitHub Releases](https://github.com/jpeakai/jpai-mermaidjs-lint/releases).
