.PHONY: install build fix adrs check ci typecheck test test-cov-ts docs-ci site site-serve evals-dry evals clean

install:
	uv sync
	bun install

# Bundle the CLI and the library for Node, which will not strip types from a
# package inside node_modules. The mermaid parsers stay external dependencies,
# because bundling mermaid inlines its whole renderer. Bun consumers import src
# directly, and dist is built again when the package is packed.
build:
	bun build src/bin.ts --target=node --format=esm --packages=external --outfile dist/bin.js
	bun build src/index.ts --target=node --format=esm --packages=external --outfile dist/index.js
	bun build src/testing.ts --target=node --format=esm --packages=external --outfile dist/testing.js

# Autofix formatting and lint, then regenerate the decision bundle.
fix: adrs
	bunx --bun @biomejs/biome check --write src tests scripts

# Validate the records against adrs/record.schema.json, then render the bundle.
adrs:
	uv run adrs/okf_render.py adrs --schema adrs/record.schema.json --author jpai-mermaidjs-lint

# The package gates, with no autofix and no private tooling, so GitHub Actions
# and npm prepublishOnly can run them with Bun alone.
check: typecheck test-cov-ts docs-ci
	bunx --bun @biomejs/biome check src tests scripts

typecheck:
	bunx --bun tsc --project tsconfig.json --noEmit

# The Node tests run dist, so every test target builds it first.
test: build
	bun test

# Bun's own threshold is per file, so the aggregate gate is enforced here from
# the "All files" row: both the function and the line column must reach 90.
test-cov-ts: build
	@mkdir -p tmp
	@bun test --coverage > tmp/coverage.txt 2>&1; status=$$?; cat tmp/coverage.txt; \
	test "$$status" -eq 0 || exit "$$status"; \
	awk -F'|' '/^All files/ { if ($$2 + 0 < 90 || $$3 + 0 < 90) { print "ERROR: coverage below 90%"; exit 1 } found = 1 } \
		END { if (!found) { print "ERROR: no coverage summary"; exit 1 } }' tmp/coverage.txt

# Regenerate, gate, then assert the tree is clean.
ci: fix typecheck test-cov-ts docs-ci

# Prose gates over every markdown file, and this repo's own diagram gates over
# the diagrams in them, using this repo's source and never a published copy.
# The site's authored pages are scored under mkdocs-material, which the linter
# reads from docs-site/mkdocs.yml.
SITE_GENERATED := docs-site/docs/reference/rules.md docs-site/docs/gallery/fixtures.md docs-site/docs/gallery/examples.md
SITE_DOCS := $(filter-out $(SITE_GENERATED),$(wildcard docs-site/docs/*.md docs-site/docs/*/*.md)) $(wildcard docs-site/diagrams/*.md)
SKILL_DOCS := $(wildcard skills/*/*.md skills/*/evals/*.md)
DOCS := $(wildcard *.md) $(wildcard docs/*.md) $(wildcard adrs/*.md) $(SITE_DOCS) $(SKILL_DOCS) tests/fixtures/README.md

# The docs site. The generator re-checks every example as it writes the
# reference pages, then mkdocs builds in strict mode, so a drifted example or a
# broken link fails the build.
site:
	bun run scripts/build-site.ts
	uv run mkdocs build --strict --config-file docs-site/mkdocs.yml

site-serve:
	bun run scripts/build-site.ts
	uv run mkdocs serve --config-file docs-site/mkdocs.yml

docs-ci:
	bunx --bun @jpeakai/prose-gates $(DOCS)
	bun run src/bin.ts $(DOCS)

# The agent eval suite for the mermaidjs-lint skill, run by pytest-xharness-eval.
# evals-dry lists the matrix of cells and invokes nothing. evals runs it live:
# every live cell is a billed agent session (claude and codex CLIs), so narrow
# the spend with ARGS, for example ARGS="--harness claude -k label_colour".
evals-dry:
	uv run pytest skills/mermaidjs-lint/evals --dry-run

evals:
	uv run pytest skills/mermaidjs-lint/evals -v $(ARGS)

clean:
	rm -rf dist tmp node_modules
