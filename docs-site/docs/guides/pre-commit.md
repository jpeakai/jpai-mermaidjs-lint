# Check diagrams before each commit

Run the linter on the markdown you are about to commit, so a finding never reaches a pull request.

**Before you begin:** the package is a dev dependency, as in [Get started](../get-started.md), and the project is a git repository.

## Choose a hook runner

Both runners below pass only the staged files to the linter.

=== "husky and lint-staged"

    Install the two tools:

    ```sh
    bun add --dev husky lint-staged
    bunx husky init
    ```

    `husky init` adds a `prepare` script to `package.json` and writes `.husky/pre-commit`.
    Replace the contents of `.husky/pre-commit` with:

    ```sh
    bunx lint-staged
    ```

    Then tell lint-staged what to run, in `package.json`:

    ```json
    {
      "lint-staged": {
        "*.{md,markdown,mmd,mermaid}": "mermaidjs-lint --fix"
      }
    }
    ```

=== "pre-commit"

    Add `.pre-commit-config.yaml` at the repository root:

    ```yaml
    repos:
      - repo: local
        hooks:
          - id: mermaidjs-lint
            name: mermaidjs-lint
            entry: npx --no-install mermaidjs-lint
            language: system
            files: \.(md|markdown|mmd|mermaid)$
    ```

    Then install the hook with `pre-commit install`.

With npm, use `npm install --save-dev` and `npx` in place of `bun add --dev` and `bunx`.

Both runners call the linter installed in the project, and never download it. lint-staged finds `mermaidjs-lint` in `node_modules/.bin`. `--no-install` stops `npx` fetching the unscoped name `mermaidjs-lint`, which this project does not own, on a clone that has not run `npm install` yet.
The filters cover every extension the linter reads: `.md`, `.markdown`, `.mmd` and `.mermaid`.

## See a commit stopped

Stage the white-on-yellow diagram from [Get started](../get-started.md#3-lint-a-diagram), then commit.
The report-only hook prints its status, then the finding, and the commit does not happen:

```text
mermaidjs-lint...........................................................Failed
- hook id: mermaidjs-lint
- exit code: 1

docs/architecture.md:6 contrast-text-below-aa classDef warn: text 1.43:1 < 4.5 (#ffffff on #ffd400)
1 finding(s) in 1 file(s)
```

A hook that runs `--fix` repairs this finding instead, and the commit goes ahead with the fixed file.

## Fix or only report

- **With `--fix`,** as in the lint-staged example, the hook applies every fix it can prove safe. lint-staged stages the fixed file, so the commit carries the fix.
- **Without `--fix`,** as in the pre-commit example, the hook only reports.
  You run `--fix` yourself and stage the result.

Either way, a finding that no fixer clears stops the commit until you fix it by hand.

## Keep the CI gate

A hook runs only where it is installed, and `git commit --no-verify` skips it.
Keep the [CI gate](ci.md) as the check every change must pass.
