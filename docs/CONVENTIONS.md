# Documentation Conventions

How `jpai-mermaidjs-lint` organises its documentation.
Agents and humans: consult this before creating, moving or renaming any doc.

## Dialect

- **Flavour:** minimal, with an ADR surface promoted to `okf-yaml`, inherited from `jpai-library`
- **Docs taxonomy:** user docs live on the docs site, in `docs-site/docs/`. It holds a tutorial (`get-started.md`), then `guides/`, `concepts/`, `reference/` and `gallery/`. `docs/` holds maintainer runbooks and contributor references, `ARCHITECTURE.md` and `DATA_MODEL.md`, with one declared exception: `docs/plugins.md`, a redirect kept so old links resolve.
- **Glossary:** `GLOSSARY.md` at root, one canonical term per concept, new domain terms added in the change that introduces them
- **ADR layout:** `okf-yaml`, with records authored in `adrs/NNNN-slug.yml` and markdown generated from them
- **Record ids:** prefixed `MJL-` in this repo, so a citation is unambiguous across bundles
- **Generated paths:** `adrs/*.md`, `adrs/index.md`, `adrs/graph.md`, `adrs/graph.json`, `adrs/graph.html`, and, ignored by git, `docs-site/docs/reference/rules.md`, `docs-site/docs/gallery/fixtures.md`, `docs-site/docs/gallery/examples.md`, `docs-site/snippets/`. So is the token block in the site theme's `osakanights.css`, written from its `design-tokens.json`.
- **Regenerate:** `make adrs` for the decision bundle and `make theme` for the theme's tokens, which `make fix` both runs, and `make site` for the docs site
- **Diagrams on the site:** each lives once in `docs-site/diagrams/` and is included into pages, so it is linted on its own
- **Shared text:** text that both the site and the root markdown carry, such as the four tenets, lives once in `docs-site/includes/`. The site includes it, and a test holds each root copy to it verbatim.
- **Home mirrors the README:** the site home page opens with the README's sections, in the same order. Sections only the site has come after them. `tests/readme-site.test.ts` holds the order and the shared includes.
- **Agent files:** `CLAUDE.md` at root, with no nested agent files
- **Prose gates:** `make docs-ci` gates every authored markdown file and its diagrams. That is the root files, `docs/`, `adrs/`, the site's authored pages, diagrams, includes and theme README, the skill's markdown and `tests/fixtures/README.md`. Inputs under test are outside it: the fixtures, `examples/` and the skill's eval fixtures in `skills/mermaidjs-lint/evals/fixtures/`. The site's generated pages are checked by `make site` instead.
- **Changelog:** `CHANGELOG.md` at root, in Keep a Changelog style, curated by hand. A user-visible change adds a line under `Unreleased` in the same change, and a release renames that section to its version. The Publish workflow copies that section into the GitHub release notes.
- **Documented version:** the docs site describes the latest release. The Docs workflow deploys it only after a Publish run succeeds, or when run by hand. The README on GitHub describes `main`. Anything on `main` but not yet released is listed under `Unreleased` in `CHANGELOG.md`.
- **Proposals and RFCs:** not used

## Layout map

| Path | Charter | Audience | Changes when |
|---|---|---|---|
| `README.md` | Orientation, one command and its output, the fix, the four tenets, links into the site and compatibility | Consumers | Purpose, flags, requirements or the release policy change |
| `SECURITY.md` | Supported versions, private vulnerability reporting and the plugin trust model | Consumers | The support window, the reporting route or plugin loading changes |
| `RULES.md` | Every rule by category, with failing examples and their fixes, held true by a test | Both | A rule, its category or its fix behaviour changes |
| `CHANGELOG.md` | User-visible changes per release, and what is on `main` but unreleased | Consumers | A user-visible change lands, or a release is cut |
| `CONTRIBUTING.md` | Setup, the make targets, how a change is accepted | Contributors | The dev workflow changes |
| `CLAUDE.md` | Agent invariants and pointers, no restated conventions | Agents | Commands or hard boundaries change |
| `GLOSSARY.md` | Ubiquitous language, one canonical term per concept | Both | A domain term enters code or conversation |
| `adrs/*.yml` | Immutable accepted decisions about how the tool works, authored as data | Both | A binding decision is made |
| `adrs/*.md` | Generated reading surface for those records | Both | Never edited, only regenerated |
| `docs/CONVENTIONS.md` | This dialect declaration | Both | A documentation convention changes |
| `docs/plugins.md` | A pointer to the plugin pages on the docs site, kept so old links resolve | Plugin authors | A plugin page moves |
| `docs/PUBLISHING.md` | The release speed run and the one-time npm setup | Maintainers | The release workflow changes |
| `docs/ARCHITECTURE.md` | The modules, the run pipeline, the lint, fix and plugin loading sequences, and fix verification, as dual-density diagrams | Contributors | A module, the run, the fix engine, the verifier or the plugin loader changes |
| `docs/DATA_MODEL.md` | The document, rule, registry, fix and plugin models as dual-density erDiagrams, each citing its source file | Contributors | A type in `src/` that a diagram draws gains, loses or changes a field |
| `.github/workflows/` | CI on pushes and pull requests to main, the Docs build on pull requests and main with its Pages deploy after each successful Publish run, and the manually triggered Publish workflow | Maintainers | The gate, the site or the release process changes |
| `docs-site/mkdocs.yml` | The site's config and navigation | Consumers | A page is added, moved or renamed |
| `docs-site/theme/osakanights/` | The site's OsakaNights look, kept brand-generic so another site can reuse it, with a README on adopting it | Both | The palette, fonts or generic styling changes |
| `docs-site/docs/` | The site's authored pages, scored under `mkdocs-material` | Consumers | Behaviour, flags, config or the plugin contract changes |
| `docs-site/diagrams/` | One diagram per file, included into site pages | Consumers | The model, the plugin loader or the run pipeline changes |
| `docs-site/includes/` | Text the site includes and the root markdown repeats verbatim: the tenets and the README text the home page shares | Both | A tenet or a shared README line is reworded |
| `docs-site/docs/gallery/agent-evals.md` | Whether AI coding agents can fix the rule fixtures it lists that `--fix` leaves, with a results table, its run date and the skill commit it measured | Consumers | The eval suite is run again |
| `docs-site/docs/assets/examples/` | One PNG per example, drawn with the mermaid CLI and committed | Consumers | An example is added or changed |
| `skills/mermaidjs-lint/` | The agent skill that drives the linter, copied into an agent's skills folder rather than shipped on npm | Consumers | The CLI's flags, output or rules change |
| `skills/mermaidjs-lint/evals/` | The live agent eval suite for the skill, with its own README and seed fixtures | Contributors | The skill or a fixture it seeds from changes |
| `tests/fixtures/` | The fixture corpus, one case per file, with its own README | Contributors | A new case is found |
| `examples/` | Layout and icon examples, shipped in the npm package and run as fixtures, each needing its PNG | Consumers | An example is added |
| `src/` | The package source: the CLI, parsers, rules, fix engine and plugin loader | Contributors | Behaviour changes |
| `src/rules/` | One module per built-in rule, named for its id | Contributors | A rule is added or changed |
| `tests/` | The test suite, run with `bun test ./tests/`, against real parsers and files | Contributors | Behaviour changes |
| `scripts/` | Repo tooling, such as the site generator | Contributors | The tooling changes |
| `docs-site/snippets/` | Generated text the site includes, such as the CLI help, ignored by git | Consumers | Never edited, only regenerated |
| `package.json` | The npm manifest: name, version, exports, bins and dependencies | Both | A dependency, export or release changes |
| `Makefile` | Every repo command, as listed in `CONTRIBUTING.md` | Contributors | The dev workflow changes |
| `tsconfig.json`, `biome.json`, `bunfig.toml`, `pyproject.toml` | Type checking, lint and format, the Bun test settings, and the uv tooling | Contributors | The toolchain changes |
| `LICENSE` | The MIT license | Consumers | Never, short of relicensing |
| `dist/` | Generated Node bundles, ignored by git and shipped in the npm package | Consumers | Never edited, only rebuilt |

## Naming

- Root meta-files are UPPERCASE.
- Runbook, dialect and contributor reference files inside `docs/` are UPPERCASE, like `CONVENTIONS.md`, `PUBLISHING.md` and `ARCHITECTURE.md`.
- Every other file inside `docs/` is lowercase kebab-case.
- Records are `NNNN-slug.yml`, and a number is never reused.
- Rule modules are `src/rules/<rule-id>.ts`.

## Pointers

- ADR directory: `adrs/`
- Parent bundle: `jpai-library/adrs/`, which holds where this tool sits rather than how it works
- Sibling package: `jpai-prose-gates`, whose plugin contract this tool follows

## Required cross-links

- `CLAUDE.md` points here, and at the ADR surface with a check-before-you-ask instruction.
- `CLAUDE.md` points at `GLOSSARY.md` with both standing instructions.
- `README.md` points at `CONTRIBUTING.md`.
