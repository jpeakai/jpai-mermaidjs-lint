.PHONY: install build fix check ci typecheck test test-cov-ts docs-ci clean

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
fix:
	bunx --bun @biomejs/biome check --write src tests
	uv run meta adr render

# The package gates, with no autofix and no private tooling, so GitHub Actions
# and npm prepublishOnly can run them with Bun alone.
check: typecheck test-cov-ts docs-ci
	bunx --bun @biomejs/biome check src tests

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
ci: fix typecheck test-cov-ts
	@test -z "$$(git status --porcelain)" || { \
		git status --short; \
		echo "ERROR: regenerate left the tree dirty - commit the generated files"; \
		exit 1; }

# Prose gates over every markdown file, and this repo's own diagram gates over
# the diagrams in them, using this repo's source and never a published copy.
DOCS := $(wildcard *.md) $(wildcard docs/*.md) $(wildcard adrs/*.md)

docs-ci:
	bunx --bun @jpeakai/prose-gates $(DOCS)
	bun run src/bin.ts $(DOCS)

clean:
	rm -rf dist tmp node_modules
