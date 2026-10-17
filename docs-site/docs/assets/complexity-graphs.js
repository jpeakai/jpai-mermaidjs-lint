// Draws the parsed structure of each worked example on the Measuring
// complexity page. scripts/build-site.ts writes every `div.ml-cy` with the
// elements mermaid's parser returned in `data-graph`, and this renders them
// with cytoscape.js. Colours come from the --ml-cy-* tokens in
// complexity-graphs.css, read again whenever the reader switches palette.
// cytoscape is imported only on a page that holds a graph, so every other
// page of the site skips the download.
const CYTOSCAPE = "https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.esm.min.mjs";
let cytoscape = null;

const token = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();

const style = (el) => [
  {
    selector: "node",
    style: {
      label: "data(label)",
      shape: "round-rectangle",
      width: "label",
      height: "label",
      padding: "8px",
      "font-family": token(el, "--md-text-font-family") || "sans-serif",
      "font-size": 12,
      "text-valign": "center",
      "text-halign": "center",
      color: token(el, "--ml-cy-node-fg"),
      "background-color": token(el, "--ml-cy-node-bg"),
      "border-width": 1.5,
      "border-color": token(el, "--ml-cy-node-border"),
    },
  },
  {
    selector: "node[kind = 'subgraph']",
    style: {
      shape: "round-rectangle",
      "text-valign": "top",
      "text-halign": "center",
      "text-margin-y": -4,
      "font-weight": "bold",
      color: token(el, "--ml-cy-group-fg"),
      "background-color": token(el, "--ml-cy-group-bg"),
      "border-color": token(el, "--ml-cy-group-border"),
      "border-style": "dashed",
      padding: "14px",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "curve-style": "bezier",
      "line-color": token(el, "--ml-cy-edge"),
      "target-arrow-color": token(el, "--ml-cy-edge"),
      "target-arrow-shape": "triangle",
    },
  },
];

// A tree or a flat graph reads best in layers from its roots. Compound nodes
// need a force layout that keeps each subgraph's members together.
const layout = (el) =>
  el.dataset.layout === "cose"
    ? {
        name: "cose",
        animate: false,
        randomize: false,
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: () => 40,
        nodeRepulsion: () => 6000,
        nestingFactor: 0.8,
        gravity: 40,
        componentSpacing: 30,
        padding: 16,
      }
    : { name: "breadthfirst", directed: true, spacingFactor: 1.1, padding: 16 };

const graphs = new Map();

const draw = (el) => {
  graphs.get(el)?.destroy();
  const cy = cytoscape({
    container: el,
    elements: JSON.parse(el.dataset.graph),
    style: style(el),
    layout: layout(el),
    userZoomingEnabled: false,
    userPanningEnabled: false,
    boxSelectionEnabled: false,
    autoungrabify: true,
  });
  graphs.set(el, cy);
};

const drawAll = async () => {
  for (const [el, cy] of graphs) {
    if (el.isConnected) continue;
    cy.destroy();
    graphs.delete(el);
  }
  const targets = document.querySelectorAll("div.ml-cy");
  if (targets.length === 0) return;
  cytoscape ??= (await import(CYTOSCAPE)).default;
  for (const el of targets) draw(el);
};

// Material sets the palette on body. A change of palette redraws every graph
// with the new tokens, since cytoscape paints to a canvas and CSS cannot reach it.
new MutationObserver(drawAll).observe(document.body, {
  attributes: true,
  attributeFilter: ["data-md-color-scheme"],
});

if (window.document$) window.document$.subscribe(drawAll);
else drawAll();
