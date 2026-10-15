// Draws `mermaid-github` blocks with plain mermaid and its default theme, as a
// GitHub README shows them. Material's own mermaid forces the label colour to
// match the site theme, which would hide exactly what a contrast example shows.
// The version matches the mermaid the linter parses with; scripts/build-site.ts
// fails the build when they differ.
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs";

mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "strict" });

const render = () => {
  const nodes = [...document.querySelectorAll("div.mermaid-github:not([data-processed])")];
  if (nodes.length > 0) mermaid.run({ nodes });
};

if (window.document$) window.document$.subscribe(render);
else render();
