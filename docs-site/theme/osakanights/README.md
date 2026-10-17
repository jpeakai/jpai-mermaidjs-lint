# OsakaNights for MkDocs Material

This folder is the brand-generic half of the docs site's look, kept apart so another MkDocs Material site can reuse it.
It carries the palette, fonts, type, buttons, hero and diagram canvas, and the markdown extensions they rely on.
A site keeps its own name, logo, navigation and classes in its own config and stylesheet.

## What is in it

| Path | What it does |
|---|---|
| `mkdocs.base.yml` | The theme, its features, the palette, the fonts and the markdown extensions, pulled in with `INHERIT` |
| `overrides/main.html` | Loads the stylesheet after Material's own and before the site's `extra_css` |
| `overrides/assets/osakanights/osakanights.css` | The colour tokens for Night and Day, then the generic rules that use them |
| `design-tokens.json` | The brand parameters, one entry per colour token in each mode |
| `tokens.ts` | Writes the tokens from `design-tokens.json` into the stylesheet, or checks them with `--check` |

## Adopt it in another site

1. Copy this whole folder into the other repo, for example to `site-theme/osakanights/`.
   Keep `overrides/` beside `mkdocs.base.yml`.
2. Add `INHERIT` as the first key of the site's `mkdocs.yml`, with a path relative to that `mkdocs.yml`.
   For the example above, that is `INHERIT: site-theme/osakanights/mkdocs.base.yml`.
3. Set `theme.custom_dir` to the copied `overrides/` folder, also relative to the site's `mkdocs.yml`.
   For the example above, that is `custom_dir: site-theme/osakanights/overrides` under `theme`.
4. Delete `theme.name`, `theme.palette` and `theme.font` from the site's config, as the base sets them.
   A palette left in the site's config replaces the theme's palette, so its colours would never apply.
5. Delete `theme.features` too, unless the site wants a different set.
   A features list in the site's config replaces the base list whole.
6. Rewrite the site's `markdown_extensions` as a mapping, and keep only what the base lacks or sets differently.
   A list there replaces every base extension, so the theme's fences, tabs and admonitions would vanish.
7. Keep the site's own `site_name`, `nav`, `theme.logo` and `extra_css` as they are.
8. Run `mkdocs build --strict` and check that it passes.

A converted extension set looks like this, adding snippets to the base set:

```yaml
markdown_extensions:
  pymdownx.snippets:
```

An extension with no settings takes an empty value, as `pymdownx.snippets` does here.

## How the parts resolve

These were checked against MkDocs 1.6.1, in `mkdocs/utils/yaml.py` and `mkdocs/config/config_options.py`.

- **`INHERIT` is relative to the file that names it**.
  MkDocs reads the base file first, then merges the site's file over it.
- **A mapping merges, a list replaces**.
  The merge is `mergedeep` with its default strategy, so the site's lists and plain values win whole.
  That is why the base writes `markdown_extensions` as a mapping, a form MkDocs accepts.
- **A list inside a mapping still replaces**.
  A site that sets `pymdownx.superfences.custom_fences` must repeat the base `mermaid` fence in its own list.
- **`custom_dir` is relative to the site's `mkdocs.yml`**.
  MkDocs resolves it after the merge, so the base file cannot set it for the site.
- **The stylesheet does not depend on `docs_dir`**.
  MkDocs copies every static file under `custom_dir` into the built site at the same path.
  So it works even when a script assembles `docs_dir` afresh before each build.
  A file at the same path in `docs_dir` would win, which is why the stylesheet sits under its own `assets/osakanights/`.
- **`extra_css` paths resolve against the built site, not this folder**.
  The theme avoids `extra_css`, because a site that sets its own list would drop the theme's entry.

A site that already has a `custom_dir` cannot set a second one.
Copy `overrides/main.html` and `overrides/assets/osakanights/` into the site's own overrides folder instead.
If the site has its own `main.html`, add the theme's `styles` block to it.

## Use the theme's classes and tokens

The theme styles Material's own markup, so most pages need nothing extra.

- **A primary button is the Encore,** the one saturated element per view, set with `{ .md-button .md-button--primary }`.
- **A landing hero** is `<div class="on-hero" markdown>` holding the title and a `<p class="on-lede">`.
- **A Material-drawn mermaid diagram** sits on `--on-diagram-bg`, one fixed canvas per mode.
- **A site's own classes** can use `--on-pass`, `--on-fail`, `--on-card-border` and `--on-heading`.

## Change the colours

1. Edit `design-tokens.json`, never the token block in `osakanights.css`.
2. Run `bun run <path to this folder>/tokens.ts` to write the block, or `make theme` in this repo.
3. Run it with `--check` in the site's gate, so a hand edit to the block fails.

A `md-` token is one of Material's own custom properties, and an `on-` token is the theme's.
Night is drawn as Material's `slate` scheme and Day as its `default` scheme.
