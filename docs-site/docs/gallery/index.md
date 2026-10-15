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

The test suite and this gallery both pick the file up, with no code to write.
