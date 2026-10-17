// Draws the parsed structure of each worked example on the Measuring
// complexity page. scripts/build-site.ts writes every `div.ml-cy` with the
// elements mermaid's parser returned in `data-graph`, and this renders them
// with cytoscape.js. Colours come from the --ml-cy-* tokens in
// complexity-graphs.css, read again whenever the reader switches palette.
// cytoscape is imported only on a page that holds a graph, so every other
// page of the site skips the download.
const CYTOSCAPE = "https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.esm.min.mjs";
// dagre lays a graph out in ranks, as mermaid does, and keeps each subgraph's
// members inside one box without boxes overlapping.
// Both ship as UMD scripts that set a global, so they load as classic scripts:
// the ESM build of cytoscape-dagre loses its dagre import.
const DAGRE = [
  "https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js",
  "https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.js",
];

const script = (src) =>
  new Promise((resolve, reject) => {
    const el = Object.assign(document.createElement("script"), { src, onload: resolve, onerror: reject });
    document.head.append(el);
  });
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
      "font-size": 14,
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

// Ranks run the way the diagram's own direction runs.
const layout = (el) => ({
  name: "dagre",
  rankDir: el.dataset.direction === "TB" ? "TB" : "LR",
  nodeSep: 18,
  rankSep: 36,
  padding: 16,
});

// Labels must stay readable, so a graph is never shrunk below MIN_ZOOM to fit.
// The box grows to the graph's height instead, and a graph still too wide pans.
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.15;
const PAD = 24;

const fitReadable = (cy, el) => {
  cy.zoom(1);
  const box = cy.elements().boundingBox();
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (el.clientWidth - 2 * PAD) / box.w));
  el.style.height = `${Math.ceil(box.h * zoom + 2 * PAD)}px`;
  cy.resize();
  cy.zoom(zoom);
  cy.center();
  cy.userPanningEnabled(box.w * zoom > el.clientWidth - 2 * PAD);
};

const graphs = new Map();

const draw = (el) => {
  graphs.get(el)?.destroy();
  const cy = cytoscape({
    container: el,
    elements: JSON.parse(el.dataset.graph),
    style: style(el),
    layout: { name: "preset" },
    userZoomingEnabled: false,
    userPanningEnabled: false,
    boxSelectionEnabled: false,
    autoungrabify: true,
  });
  cy.layout(layout(el)).run();
  fitReadable(cy, el);
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
  if (cytoscape === null) {
    const core = await import(CYTOSCAPE);
    for (const src of DAGRE) await script(src);
    cytoscape = core.default;
    cytoscape.use(window.cytoscapeDagre);
  }
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
