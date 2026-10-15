# Gallery

Real files, drawn as this site renders them, with what the linter reports for each.
Both pages are generated from files in the repository, and the site build fails if any of them stops behaving as recorded.

| Page | What it shows |
|---|---|
| [Fixtures](fixtures.md) | The test corpus: one file per behaviour, clean files, and larger scenario files |
| [Layout examples](examples.md) | Layouts, looks and icon packs, each linted clean |

## Add a fixture

A diagram that misbehaves becomes a fixture: one file under `tests/fixtures` in the repository.
Put an `expect` comment on any line, naming the rules the file must report:

```text
<!-- expect: contrast-text-below-aa -->   in a .md file
%% expect: none                          in a .mmd file
```

`none` means the file must lint clean, and a file with no `expect` comment fails the suite.
To pin the exact output of `--fix`, add a sibling named `<name>.fixed.md`.

## What an LLM would fix

`--fix` only makes changes it can prove safe.
A split diagram, a new label colour or a repaired edge needs judgment.
So every fixture that `--fix` leaves dirty has a sibling, `<name>.llm.md`, holding the fix an LLM would make.

Each one states its reason in a comment, and the suite fails if it does not lint clean:

```text
<!-- llm: The edge had no target, so it now points at a node B. -->
```

The [Fixtures](fixtures.md) page draws it beside the original, and the [Rules](../reference/rules.md) page does the same for each reported example.

The test suite and this gallery both pick the file up, with no code to write.
