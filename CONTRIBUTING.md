# Contributing

How to set up `jpai-mermaidjs-lint`, make a change, and get it accepted.

## What a change must serve

The tool has four tenets: three guarantees about every diagram, and one commitment about the tool.
A change is accepted when it strengthens one of them without weakening another.

- **Readable in light and dark.** The colours a diagram declares are scored against their fill as the host renders it, in both light and dark themes.
- **Renders.** Every diagram parses with the mermaid parsers this package ships, and every fence is closed.
- **Simple enough to follow.** Node count and visual complexity are scored against a density preset, so an oversized diagram is flagged to be split.
- **Extensible.** A plugin adds rules of your own, which run through the same config, fix engine and verification as the built-ins.

A rule that serves none of them belongs in a plugin, not in the core.
The canonical wording lives in `docs-site/includes/tenets.md`, and `tests/tenets.test.ts` holds this file, `README.md` and `CLAUDE.md` to it.

## Setup

This repo is a bun project with a uv side for tooling.
The bun side is the package itself, and the uv side renders the decision bundle and builds the docs site.

Prerequisites:

- [Bun](https://bun.sh), at the version the `packageManager` field of `package.json` names.
- [uv](https://docs.astral.sh/uv/), which installs the Python that `requires-python` in `pyproject.toml` asks for.
- Node, only to run the Node tests against `dist/` and to draw example images.

```sh
make install   # uv sync, then bun install
```

## Making a change

```sh
make fix       # regenerate the ADR bundle, then biome autofix
make check     # typecheck, coverage, docs-ci and lint, with Bun alone, as GitHub Actions runs it
make build     # bundle src into dist for Node, which git ignores
make test      # build, then run the test suite once
make ci        # fix, typecheck, coverage gate, then docs-ci
make docs-ci   # gate every markdown file with this repo's own source
make site      # generate the reference pages, then build the docs site in strict mode
make site-serve  # the same, served locally with live reload
```

`dist/` holds the Node bundles and is never committed.
The test targets rebuild it first, so the Node tests never run a stale bundle.

`make ci` must pass before a change is accepted, and it runs `make docs-ci` itself.
The coverage gate fails below 90% aggregate for functions or lines.

## Adding a rule

1. Write one module in `src/rules` exporting a `Rule`, named for its id.
2. Add its id to `RULE` in `src/rules/types.ts`, and register it in `src/rules/index.ts`.
3. Add its section and examples to `RULES.md`, which `tests/rules-doc.test.ts` holds to the code.
4. Add tests that run the real parser over real strings.

A rule that rewrites text needs an expectation from the verifier, and an adversarial test for every case it refuses.

## Adding a fixture

A diagram that misbehaves in the wild becomes a fixture: one file under `tests/fixtures`, with an expect comment naming the rules it must report.
[tests/fixtures/README.md](tests/fixtures/README.md) has the format.
The test suite and the docs site both pick it up, with no code to write.

## Adding an example

An example is one `.mmd` file in `examples/`, run as a fixture and drawn on the docs site from a committed PNG.
`make site` fails with "has no rendered image" until `docs-site/docs/assets/examples/<name>.png` exists.
Draw it with the mermaid CLI, at four times scale, on the default theme and a white background:

```sh
npx -y -p @mermaid-js/mermaid-cli@12.0.0 mmdc -i examples/<name>.mmd \
  -o docs-site/docs/assets/examples/<name>.png --scale 4 -t default -b white
```

- **Iconify icons need their pack.** For an `architecture-beta` diagram that uses `logos:` icons, add `--iconPacksNamesAndUrls "logos#https://unpkg.com/@iconify-json/logos@1/icons.json"`.
- **Font Awesome needs nothing extra.** A flowchart with `fa:` icons draws with the command as shown.
- **The CLI drives a Chromium.** When it reports that it cannot find Chrome, set `PUPPETEER_EXECUTABLE_PATH` to a Chrome or Chromium binary you already have.

## Reporting a bug

Open an issue at [GitHub issues](https://github.com/jpeakai/jpai-mermaidjs-lint/issues) with the version from `mermaidjs-lint --version`, the command, the diagram, and the `--json` output.
Report a vulnerability privately, as [SECURITY.md](SECURITY.md) describes.

## Landing a change

Every change lands through a pull request, and nobody pushes to main directly.

```sh
git switch -c <short-topic>
git push -u origin <short-topic>
gh pr create --fill
```

A pull request merges once Check (Node 20) and Check (Node 24) pass on its latest commit.

## Recording a decision

A binding decision is recorded as a new `.yml` record in `adrs/` in the same change that makes it.
Copy the shape of an existing record, give it the next number, and keep the `MJL-` prefix.
Every typed relation needs its back-edge in the target record.
Run `make fix` to validate the record and regenerate the bundle.

## Publishing a release

Releases go through the Publish workflow in GitHub Actions.
[docs/PUBLISHING.md](docs/PUBLISHING.md) has the speed run and the one-time setup.

## Commit messages

Explain the change and the reason for it, not the mechanics of the diff.
A commit that changes a generated file includes the source change that produced it.
