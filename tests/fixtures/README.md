# Fixtures

Every `.md` and `.mmd` file here, and under `examples/`, is run by `tests/fixtures.test.ts`, except this README and the `.fixed` and `.llm` siblings.
Adding a case is adding one file, with no test code to write.

## Declare what the tool must report

Put an `expect` comment on any line of the file:

```text
<!-- expect: contrast-text-below-aa contrast-border-below-ui-minimum -->   in a .md file
%% expect: none                                                            in a .mmd file
```

The ids are the distinct rules the file must produce, and `none` means a clean file.
A file with no `expect` comment fails the suite.

## Pin the fixer output

A sibling named `<name>.fixed.md` or `<name>.fixed.mmd` holds the exact output of `--fix`.
Without one, the suite still checks that fixing is idempotent and never adds a rule.

## Show what an LLM would fix

When `--fix` leaves findings, the suite requires a sibling named `<name>.llm.md` or `<name>.llm.mmd`.
It is the fix a careful LLM would make by judgment: a split diagram, a new label colour, a repaired edge.
Put the reason in one comment, and the file must lint clean:

```text
<!-- llm: The edge had no target, so it now points at a node B. -->   in a .md file
%% llm: Declared a label colour that reads on the fill.                in a .mmd file
```

The docs site shows it beside the original, with the reason.

## Folders

| Folder | Holds |
|---|---|
| `rules/` | One small file per behaviour, named for what it shows |
| `clean/` | Files that must report nothing |
| `contrast/`, `complexity/`, `gallery/` | Larger scenario files ported from the original skill |
| `skill-evals/` | The fixtures the original skill graded its output against |
| `regressions/` | A file for every bug found in the wild, added with the fix. Create the folder with the first one. |
