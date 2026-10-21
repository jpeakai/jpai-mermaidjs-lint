.PHONY: install build fix adrs theme check ci typecheck test test-cov-ts docs-ci site site-serve evals-dry evals eval-outputs clean

install:
	uv sync
	bun install

# Bundle the CLI and the library for Node, which will not strip types from a
# package inside node_modules. The mermaid parsers stay external dependencies,
# because bundling mermaid inlines its whole renderer. Bun consumers import src
# directly, and dist is built again when the package is packed. The type
# declarations go to dist/types, so a TypeScript consumer type-checks against
# .d.ts files, never this package's source.
build:
	bun build src/bin.ts --target=node --format=esm --packages=external --outfile dist/bin.js
	bun build src/index.ts --target=node --format=esm --packages=external --outfile dist/index.js
	bun build src/testing.ts --target=node --format=esm --packages=external --outfile dist/testing.js
	bunx --bun tsc --project tsconfig.build.json

# Regenerate the decision bundle and the theme's tokens, then autofix formatting and lint.
fix: adrs theme
	bunx --bun @biomejs/biome check --write src tests scripts docs-site/theme

# Write the OsakaNights colour tokens from design-tokens.json into the theme's
# stylesheet. check runs the same script with --check, so a hand edit fails.
theme:
	bun run docs-site/theme/osakanights/tokens.ts

# Validate the records against adrs/record.schema.json, then render the bundle.
adrs:
	uv run adrs/okf_render.py adrs --schema adrs/record.schema.json --author jpai-mermaidjs-lint

# The package gates, with no autofix and no private tooling, so GitHub Actions
# and npm prepublishOnly can run them with Bun and Node (the Node tests run
# dist/bin.js). The docs site build needs uv as well, so it is `make site`,
# which CI runs beside this.
check: typecheck test-cov-ts docs-ci
	bun run docs-site/theme/osakanights/tokens.ts --check
	bunx --bun @biomejs/biome check src tests scripts docs-site/theme

typecheck:
	bunx --bun tsc --project tsconfig.json --noEmit

# The Node tests (tests/node-dist.test.ts) spawn node on dist/bin.js, so every
# test target builds it first. The suite is tests/ only, so a scratch test
# under tmp/ never runs as part of it.
test: build
	bun test --timeout 30000 ./tests/

# Bun's own threshold is per file, so the aggregate gate is enforced here from
# the "All files" row: both the function and the line column must reach 90.
# Each test may take 30s, since splitting and coverage make a CI runner slow.
# The full log stays in tmp/coverage.txt. Only the summary and any failing
# lines are printed, since a CI runner's stdout fails a long print.
test-cov-ts: build
	@mkdir -p tmp
	@bun test --coverage --timeout 30000 ./tests/ > tmp/coverage.txt 2>&1; status=$$?; \
	grep -E '^All files|^ *[0-9]+ (pass|fail)$$|^Ran ' tmp/coverage.txt; \
	if [ "$$status" -ne 0 ]; then grep -E '\(fail\)|^error:' tmp/coverage.txt >&2; exit "$$status"; fi; \
	awk -F'|' '/^All files/ { if ($$2 + 0 < 90 || $$3 + 0 < 90) { print "ERROR: coverage below 90%"; exit 1 } found = 1 } \
		END { if (!found) { print "ERROR: no coverage summary"; exit 1 } }' tmp/coverage.txt

# Regenerate, then gate. It does not check that the tree is clean, so read
# git status after it.
ci: fix typecheck test-cov-ts docs-ci

# Prose gates over every markdown file, and this repo's own diagram gates over
# the diagrams in them, using this repo's source and never a published copy.
# The site's authored pages are scored under mkdocs-material, which the linter
# reads from docs-site/mkdocs.yml.
# Discover tracked and new documentation recursively, including nested pages.
# Deliberately failing inputs and captured agent outputs are test data.
DOCS := $(shell git ls-files --cached --others --exclude-standard -- '*.md' ':!:examples/**' ':!:tests/fixtures/**' ':!:skills/*/evals/fixtures/**' ':!:docs-site/eval-outputs/**' | sort -u) tests/fixtures/README.md

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
	bun run --bun prose-gates $(DOCS)
	bun run src/bin.ts $(DOCS)

# The agent eval suite for the mermaidjs-lint skill, run by pytest-xharness-eval.
# evals-dry lists the matrix of cells and invokes nothing. It writes its report
# under tmp/evals-dry, so the last live run's report in .xharness_eval_cache
# stays as it was. evals runs it live: every live cell is a billed agent
# session (claude and codex CLIs), so narrow the spend with ARGS, for example
# ARGS="--harness claude -k label_colour".
evals-dry:
	uv run pytest skills/mermaidjs-lint/evals --dry-run -o xharness_cache_dir=tmp/evals-dry

evals:
	uv run pytest skills/mermaidjs-lint/evals -v $(ARGS)

# Copy the last live run into docs-site/eval-outputs/: the file each agent
# left, and results.json, which the agent evals page draws from.
eval-outputs:
	bun run scripts/eval-outputs.ts

clean:
	rm -rf dist tmp node_modules
