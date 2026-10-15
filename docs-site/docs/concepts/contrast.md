# Contrast profiles

A label is readable when its text stands out from its fill.
The same diagram source can render with different text colours depending on where it is shown.
The tool therefore cannot score contrast without knowing the host.
A profile names the host.

## The problem: the host may choose the text colour

On GitHub, a `classDef` with `fill:` and `color:` renders as written.
The fill and the text colour you declared are the pair a reader sees.

On a MkDocs Material site, the theme forces the label text to its own colour: dark in the light theme, light in the dark theme.
Your `color:` is ignored, and the fill has to work under both of the theme's text colours.

A check that scored the declared `color:` on a Material site would pass diagrams that readers cannot read.

## The three profiles

| Profile | Scores | Used when |
|---|---|---|
| `github` | The declared fill against the declared `color:`, and against the declared `stroke:` for borders. A `linkStyle` `color:` is scored against the edge label box. An `erDiagram` is scored row by row, as [below](#an-erdiagram-is-scored-row-by-row). | The markdown renders as written, as on GitHub |
| `mkdocs-material` | The fill against the host's forced text colour, in both the light and dark theme, for every diagram type | The markdown renders through Material, which forces label text |
| `auto` | `mkdocs-material` when any parent folder of the file holds `mkdocs.yml` or `mkdocs.yaml`, otherwise `github` | The default |

Under `github`, a translucent fill is first composited over both of GitHub's page backgrounds, because a reader sees it blended with the page.

A border pair is a `stroke:` scored against its fill, and it must reach 3 to 1.
Under `github`, outside an `erDiagram`, a border pair that fails is reported as `contrast-border-below-ui-minimum`.
Under `mkdocs-material`, and in an `erDiagram` under `github`, border pairs are advisory: they are scored but never reported.
A faint fill under a saturated stroke cannot reach 3 to 1 on both theme backgrounds, and there is no warning level.
So `contrast-border-below-ui-minimum` never fires on a Material site.

Under `auto`, a `mkdocs.yml` at the repository root makes every file in the repository score as Material, `README.md` included.
[Lint a MkDocs Material site](../guides/mkdocs.md#keep-readmemd-scored-as-github-renders-it) gives the two fixes.

## The colours each profile assumes

A profile scores against fixed page and text colours, taken from the host's stock theme:

| Profile | Theme | Page background | Label text |
|---|---|---|---|
| `github` | Light | `#ffffff` | The declared `color:` |
| `github` | Dark | `#0d1117` | The declared `color:` |
| `mkdocs-material` | Light | `#ffffff` | `#36464e` |
| `mkdocs-material` | Dark | `#1e2129` | `hsl(225 18% 86% / 0.82)` |

A Material site that overrides `--md-default-fg-color` or the page background is not modelled, so its diagrams are scored as the stock theme draws them.

### Edge labels

Under `github`, outside an `erDiagram`, a `linkStyle` line that sets `color:` sets the text of that edge's label.
Mermaid draws the label on its own box, so the colour is scored against that box in both themes:

| Theme | Edge label box |
|---|---|
| Light | `#e8e8e8` |
| Dark | `#585858` |

No single colour reaches 4.5 to 1 on both boxes, so a fixed edge label colour always fails one theme.
A `linkStyle` with no `color:` styles only the line, and has no label pair.
Under `mkdocs-material` the host forces edge label text, so a `linkStyle` `color:` is ignored there.

### An erDiagram is scored row by row

Under `github`, an `erDiagram` does not draw a class's fill behind every label.
The fill paints the even attribute rows only, and the odd rows keep Mermaid's own theme surface.
So each label is scored against both rows, in both of Mermaid's themes:

| Theme | Odd row | Even row, before the fill | Label text with no `color:` |
|---|---|---|---|
| Light | `#ffffff` | `#f1f1ff` | `#333333` |
| Dark | `#2c2d2d` | `#060606` | `#cccccc` |

A declared `color:` is scored on every row, so in an `erDiagram` a `color:` with no `fill:` is scored too.
With no `color:`, the theme's label text is scored on the filled even rows.
A missing `color:` is not reported here, because a translucent fill with no `color:` is how an entity reads in both themes.
Under `mkdocs-material`, an `erDiagram` is scored like any other diagram.

## What is not scored

Contrast is scored for the colours a diagram declares.
None of these is scored, and none of them produces a finding:

- **A node with no style.** It takes the renderer's theme colours, which cannot be known without drawing it.
- **A node's `color:` with no `fill:` beside it, outside an `erDiagram`.** A `classDef` or `style` line that sets only `color:` has no declared background to score it against.
- **A `linkStyle` line's `stroke:`.** An edge line is not scored against the page.
- **A border pair under `mkdocs-material` or in an `erDiagram`.** It is scored but advisory, as [The three profiles](#the-three-profiles) explains.
- **Theme settings.** An `%%{init}%%` directive or frontmatter that sets `theme` or `themeVariables` is not read.
- **A style joined by a semicolon.** Style directives are read line by line, so `graph TD; A-->B; style A fill:#fff` hides its style.

## Why a fill with no label colour is reported

Under `github`, a `fill:` with no `color:` beside it cannot be scored: the text colour depends on the renderer's default theme.
Skipping it would let a gate pass a diagram it never checked, so it is reported as `contrast-directive-unauditable`.
Under `mkdocs-material` the host supplies the text colour, so the same directive is scoreable.

## Why some contrast findings have no fix

The only colour fix swaps a declared `color:` for black or white.
It does so only when that choice reaches 4.5 to 1 on every background the directive is scored against.

- A border has no fixer, because changing a stroke changes how a category looks.
- Under `mkdocs-material` there is no `color:` to rewrite, so the fill itself must change, and choosing a fill is a design decision.
- In an `erDiagram`, a class colours alternating rows on different backgrounds, so no single label colour may pass them all.

## Choosing a profile

Leave it on `auto` unless a file renders somewhere its folder does not reveal.
Pass `--profile` for a one-off run, or set the `profile` option on the contrast rules in the [config file](../reference/configuration.md#rule-options).
[Lint a MkDocs Material site](../guides/mkdocs.md) shows the workflow.
