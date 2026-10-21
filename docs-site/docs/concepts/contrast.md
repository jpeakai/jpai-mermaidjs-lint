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
| `github` | The declared fill against the declared `color:`, and against the declared `stroke:` for borders. A `linkStyle` `color:` is scored against the edge label box. An `erDiagram` is scored row by row, as [below](#an-erdiagram-is-scored-row-by-row). A `sequenceDiagram` is scored by its theme colours, as [below](#a-sequence-diagram-is-scored-by-its-theme-colours). | The markdown renders as written, as on GitHub |
| `mkdocs-material` | The fill against the host's forced text colour, in both the light and dark theme, for every diagram type except a `sequenceDiagram`, whose labels the host forces outright | The markdown renders through Material, which forces label text |
| `auto` | `mkdocs-material` when any parent folder of the file holds `mkdocs.yml` or `mkdocs.yaml`, otherwise `github` | The default |

Under `github`, a translucent fill is first composited over both page backgrounds, because a reader sees it blended with the page.
The page is GitHub's unless you [set a canvas](#a-host-with-its-own-page-sets-a-canvas).

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

### A host with its own page sets a canvas

The canvas is the page colour behind everything a diagram does not box.
Under `github` it defaults to GitHub's two page colours from the table above.
A host that draws its own page sets the canvas to its own colours.
A documentation viewer with its own light and dark theme is one such host.
Every page-backed pair is then scored on that page:

- **A translucent fill.** It is composited over the canvas in each theme.
- **An edge label box.** Its translucent layers sit on the canvas, so the box shifts slightly with the page.
- **A sequence diagram's page-backed elements.** These are the rows in the [sequence table](#a-sequence-diagram-is-scored-by-its-theme-colours) whose background is the page, such as message text and lifelines.

An opaque fill, an `erDiagram` row and a sequence participant box draw their own surface, so the canvas does not change them.

Set the canvas with `--canvas-light` and `--canvas-dark`, or with the `canvas` option in the [config file](../reference/configuration.md#rule-options).
Each side is an opaque CSS colour, and a side you leave out keeps GitHub's.
A translucent canvas is refused, because nothing shows through a page.

The canvas changes the page only.
Scoring still assumes the host draws Mermaid's `default` theme in light and its `dark` theme in dark.
That assumption sets the edge label box, the `erDiagram` rows and every sequence theme variable.
A host that draws another theme, or the same theme in both modes, is not modelled, so its scores are approximate.

For a sequence diagram on a host that draws one theme in both modes, pin that theme, so both modes are scored with it.
On the host's canvas that pin can pass, though a pinned theme fails on GitHub's own page, as [the sequence section](#a-sequence-diagram-is-scored-by-its-theme-colours) explains.
Run the check with `--canvas-light` and `--canvas-dark` set to the host's page to confirm it.
A host that draws a different theme in each mode has no single theme to pin.

For a sequence diagram on that host, and for any other diagram, check the scores against the host by eye in both modes.

A canvas applies under `github` only.
Material draws its own page, and this tool models only Material's stock colours.
How a file under `mkdocs-material` treats a canvas depends on where the canvas comes from:

| Canvas from | Profile from | Result |
|---|---|---|
| The config | `auto`, by default or set | The canvas is set aside for that file, which is scored under `mkdocs-material`. One stderr line names every such file, and `--json` lists them under `canvasSetAside`. |
| `--canvas-light` or `--canvas-dark` | `auto` | Usage error `canvas-profile`, exit 2 |
| Any | `--profile mkdocs-material`, or the rule's `profile` option set to `mkdocs-material` | Usage error, exit 2: `flag` when both are flags, `rule-option` when both are on one config rule, otherwise `canvas-profile` |

The config covers the whole tree.
So a repo with a Material site keeps one config with a canvas, and its Material files set it aside.
A flag is an explicit setting for the run, so the run stops rather than ignore it and report a pass the canvas never affected.
To pass the flags in such a repo, run them over the GitHub-rendered paths only.

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

### A sequence diagram is scored by its theme colours

A `sequenceDiagram` has no style lines.
Its colours are theme variables, some set in frontmatter or an `%%{init}%%` directive and the rest derived by Mermaid's theme.
The tool reads the config with Mermaid's own parser and resolves every variable with Mermaid's own theme engine, in both themes.
Under `github` that is the `default` theme in light and the `dark` theme in dark.
A theme the config pins applies to both, because GitHub draws a pinned theme in light and in dark.

The SVG has no background, so anything without a box of its own sits on the page.
A `themeVariables.background` paints nothing behind it.
Under `github`, each element is scored against this background:

| Element | Foreground | Background | Kind |
|---|---|---|---|
| Participant label and border | `actorTextColor`, `actorBorder` | `actorBkg` | Text, border |
| Human `actor` name and stick figure | `actorTextColor`, `actorBorder` | The page | Text, border |
| Lifeline | `actorLineColor` | The page | Border |
| Message text and arrow | `signalTextColor`, `signalColor` | The page | Text, border |
| Note | `noteTextColor` | `noteBkgColor` | Text |
| Frame keyword, such as `loop` | `labelTextColor` | `labelBoxBkgColor` | Text |
| Frame description and frame line | `loopTextColor`, `labelBoxBorderColor` | The page | Text, border |
| Activation bar | `activationBorderColor` | `activationBkgColor` | Border |
| `autonumber` number | `sequenceNumberColor` | `signalColor` | Text |
| Messages and frame text inside a `rect` | `signalTextColor`, `signalColor`, `loopTextColor` | The `rect` colour | Text, border |

A row is scored when the diagram uses that kind of element.
Two rows are scored more widely.
The participant label row is scored even when every participant is a human `actor`.
Frame text inside a `rect` is scored whenever the diagram has a frame, even one outside the `rect`.

A translucent background is composited over the page first.
With no theme pinned, Mermaid's `default` and `dark` themes pass, except notes in dark.
The `dark` theme draws note text at 4.49 to 1, so a note with no colours set fails in dark.
A note draws its own box, so setting `noteBkgColor` and `noteTextColor` to one readable pair fixes it in both themes.

On GitHub's own page, a pinned theme draws both light and dark, so its page-backed text fails on one of the two pages. `theme: default` puts its dark message text on GitHub's dark page, and `theme: dark` puts its light message text on the white page.
Setting the page-backed colours yourself does not help there: no text colour reaches 4.5 to 1 on both `#ffffff` and `#0d1117`.
So with GitHub's canvas, leave the theme unpinned and let Mermaid draw `default` in light and `dark` in dark.
A host with its own canvas that draws one theme in both modes is the exception: pin that theme, as [the canvas section](#a-host-with-its-own-page-sets-a-canvas) says.

Under `mkdocs-material`, Material draws Mermaid's `default` theme in both of its schemes.
Its own CSS replaces every sequence label, box, note, frame, `rect` and number colour.
So no sequence text pair is the author's, and none is scored.
Three surfaces keep the diagram's colours: lifelines, arrowheads and activation bars.
They are scored as borders, so they are advisory, as every border under this profile is.

A config the tool cannot model is reported as `contrast-directive-unauditable`:

- **`themeCSS`.** CSS can restyle anything, and under Material it replaces the host's own CSS.
- **A theme other than `base`, `default`, `dark`, `forest` or `neutral`.** The other themes colour each actor from palettes of their own.
- **A colour Mermaid cannot read.** A bad colour that others derive from, such as `primaryColor`, stops the whole theme.
  Any other bad colour, such as `signalTextColor`, is reported for each pair it is in, and the rest of the diagram is still scored.

The colours change between Mermaid releases, so the package pins the exact Mermaid version it resolves them with.

## What is not scored

Contrast is scored for the colours a diagram declares.
None of these is scored, and none of them produces a finding:

- **A node with no style.** It takes the renderer's theme colours, which cannot be known without drawing it.
- **A node's `color:` with no `fill:` beside it, outside an `erDiagram`.** A `classDef` or `style` line that sets only `color:` has no declared background to score it against.
- **A node's `stroke:` with no `fill:` beside it.** A border on an unfilled node has no declared background to score it against, under either profile.
- **A fully transparent fill.** A `fill:transparent` or a fill with zero alpha, such as `#ffffff00`, draws no box, so its `color:` and `stroke:` are not scored.
  White text on that fill passes, even on a white page.
- **A `linkStyle` line's `stroke:`.** An edge line is not scored against the page.
- **A border pair under `mkdocs-material` or in an `erDiagram`.** It is scored but advisory, as [The three profiles](#the-three-profiles) explains.
- **Theme settings outside a `sequenceDiagram`.** An `%%{init}%%` directive or frontmatter that sets `theme` or `themeVariables` is read only for a sequence diagram.
- **A sequence `box` and the other participant shapes.** The colour of a `box` around a group of participants is not scored, and nor are shapes such as `database`.
- **Style statements outside a flowchart, `erDiagram`, `stateDiagram` or `classDiagram`.** A `classDef` or `style` in another diagram type, such as `block-beta`, is reported as `contrast-directive-unauditable`.

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
- In a `sequenceDiagram`, a colour is a theme variable that other variables derive from.
  Changing one can move pairs it was not scored in.
  Text on the page also needs a colour that flips with the theme.

## Choosing a profile

Leave it on `auto` unless a file renders somewhere its folder does not reveal.
Pass `--profile` for a one-off run, or set the `profile` option on the contrast rules in the [config file](../reference/configuration.md#rule-options).
[Lint a MkDocs Material site](../guides/mkdocs.md) shows the workflow.
