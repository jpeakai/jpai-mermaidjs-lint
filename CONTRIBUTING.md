# Contributing

How to set up `jpai-mermaidjs-lint`, make a change, and get it accepted.

## What a change must serve

Three tenets are guarantees about every diagram the tool passes, and the fourth is a commitment about the tool.
A change is accepted when it strengthens one of them without weakening another.

- **Readable in light and dark.** Declared fills, label colours and borders are scored as the host draws them, on nodes, erDiagram rows, edge labels and sequence diagrams, in both themes.
- **Renders.** Every diagram parses with the mermaid parsers this package ships, and every mermaid fence is closed.
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
- Node, to run `tests/node-dist.test.ts`, which spawns `node dist/bin.js` as `npx` would, and to draw example images.

```sh
make install   # uv sync, then bun install
```

## Making a change

```sh
make fix       # regenerate the ADR bundle, then biome autofix
make check     # typecheck, coverage, docs-ci and lint, with Bun and Node, as GitHub Actions runs it
make build     # bundle src into dist for Node, which git ignores
make test      # build, then run the test suite once
make ci        # fix, typecheck, coverage gate, then docs-ci
make docs-ci   # gate every authored markdown file with this repo's own source
make evals-dry # list the agent eval matrix, invoking and billing nothing
make site      # generate the reference pages, then build the docs site in strict mode
make site-serve  # the same, served locally with live reload
```

`dist/` holds the Node bundles and is never committed.
The test targets rebuild it first, so the Node tests never run a stale bundle.

`make ci` must pass before a change is accepted, and it runs `make docs-ci` itself.
The coverage gate fails below 90% aggregate for functions or lines.

## Adding a rule

1. Write one module in `src/rules` exporting a `Rule`, named for its id.
2. Add its id to `RULE` in `src/rules/types.ts`, and register it in `RULES` in `src/rules/index.ts`.
3. If it has a fixer, also add it to `FIX_ORDER` in `src/rules/index.ts`, at the position its edits must apply. A fixer missing from `FIX_ORDER` never runs under `--fix`.
4. Add its section and examples to `RULES.md`, and its id to the Categories table there. `tests/rules-doc.test.ts` holds both to the code.
5. Add a fixture under `tests/fixtures/rules/`, named for what it shows, with an expect comment naming the rule. `tests/fixtures.test.ts` fails until some fixture expects every core rule. If `--fix` cannot clear it, add the `.llm.md` sibling that [Adding a fixture](#adding-a-fixture) describes.
6. Add tests that run the real parser over real strings.
7. Add a row for the rule to the remediation table in `skills/mermaidjs-lint/SKILL.md`, unless an existing row already covers it.
8. Add a line under `Unreleased` in `CHANGELOG.md`.

A rule that rewrites text needs an expectation from the verifier, and an adversarial test for every case it refuses.
The verifier compares only what `src/fix/verify.ts` lists, so a fixer must not rely on it to catch a changed edge or label.

## Adding a fixture

A diagram that misbehaves in the wild becomes a fixture.
That is one file in a folder under `tests/fixtures`, with an expect comment naming the rules it must report.
[tests/fixtures/README.md](tests/fixtures/README.md) has the format.
The test suite and the docs site both pick it up, with no test code to write.
The site needs a description for every fixture folder.
So never put a file directly in `tests/fixtures`, and describe a new folder as that README says.
Run `make site` after adding a fixture, an example or a folder, because `make check` does not build the site.

A fixture that `--fix` cannot clear also needs a `<name>.llm.md` sibling, or the suite fails.
That sibling must lint clean and carry an `llm:` comment with its reason, as [Show what an LLM would fix](tests/fixtures/README.md#show-what-an-llm-would-fix) explains.

## Adding an example

An example is one `.mmd` file in `examples/`, run as a fixture and drawn on the docs site from a committed PNG.
`make site` fails with "has no rendered image" until `docs-site/docs/assets/examples/<name>.png` exists.
Draw it with the mermaid CLI, at four times scale, on the default theme and a white background.
Pin a mermaid CLI on the same mermaid major as the linter, so the image comes from the parser that checked it.
When the linter moves to a new mermaid major, move this pin with it.

```sh
npx -y -p @mermaid-js/mermaid-cli@11.17.0 mmdc -i examples/<name>.mmd \
  -o docs-site/docs/assets/examples/<name>.png --scale 4 -t default -b white
```

- **Iconify icons need their pack.** For an `architecture-beta` diagram that uses `logos:` icons, add `--iconPacksNamesAndUrls "logos#https://unpkg.com/@iconify-json/logos@1/icons.json"`.
- **Font Awesome needs nothing extra.** A flowchart with `fa:` icons draws with the command as shown.
- **The CLI drives a Chromium.** When it reports that it cannot find Chrome, set `PUPPETEER_EXECUTABLE_PATH` to a Chrome or Chromium binary you already have.

## Changing the agent skill

`skills/mermaidjs-lint/` is an agent skill that drives this linter, with a live eval suite in `skills/mermaidjs-lint/evals/`.
[Its README](skills/mermaidjs-lint/evals/README.md) explains how each cell is graded.
Preview the eval matrix without invoking or billing anything:

```sh
make evals-dry
```

`make evals` runs every cell live, and each cell is a billed agent session.
Run it when the skill or a fixture it seeds from changes, then update [the Agent evals page](docs-site/docs/gallery/agent-evals.md) with the results.

## Reporting a bug

Open an issue at [GitHub issues](https://github.com/jpeakai/jpai-mermaidjs-lint/issues) with the version, the command, the diagram, and the `--json` output.
`mermaidjs-lint --version` prints the version, and on 0.1.x `npm ls @jpeakai/mermaidjs-lint` does.
Report a vulnerability privately, as [SECURITY.md](SECURITY.md) describes.

## Landing a change

By convention every change lands through a pull request whose checks pass, and nobody pushes to main directly.
Main is not a protected branch, so nothing enforces the convention.

```sh
git switch -c <short-topic>
git push -u origin <short-topic>
gh pr create --fill
```

Merge a pull request only once Check (Node 20) and Check (Node 24) pass on its latest commit.
Check (Node 24) also builds the docs site.
The repository requires no check, so the merge button stays enabled while a check is red.
A change a user can see also adds a line under `Unreleased` in [CHANGELOG.md](CHANGELOG.md).

## Recording a decision

A binding decision is recorded as a new `.yml` record in `adrs/` in the same change that makes it.
Copy the shape of an existing record, give it the next number, and keep the `MJL-` prefix.
Every typed relation needs its back-edge in the target record.
Appending that back-edge is the one edit an accepted record allows, per [MJL-0016](adrs/0016-a-back-edge-may-be-appended-to-an-accepted-record.md).
Run `make fix` to regenerate the bundle, then read its output.
It reports a one-way relation as `one-way: ...`, but still exits 0.

## Publishing a release

Releases go through the Publish workflow in GitHub Actions.
[docs/PUBLISHING.md](docs/PUBLISHING.md) has the speed run and the one-time setup.

## Commit messages

Explain the change and the reason for it, not the mechanics of the diff.
A commit that changes a generated file includes the source change that produced it.
