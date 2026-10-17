// The worked examples on the Measuring complexity page. Each step is a small
// diagram. The generator reads it with the parse engine, so the graph drawn
// beside it and the score worked under it are what the linter itself measures,
// never counted from the text (MJL-0001). scripts/build-site.ts writes one
// snippet per step into docs-site/snippets/complexity/.

import { checkMarkdown, PRESETS } from "../src/index.ts";
import { type DiagramGraph, extractGraph } from "../src/parse/graph.ts";
import { calculateComplexity, configFromPreset, DEFAULT_PRESET, type ThresholdConfig } from "../src/parse/metrics.ts";
import { type DiagramStats, extractStats } from "../src/parse/stats.ts";

export interface Step {
  // The snippet's name, as complexity.md includes it.
  slug: string;
  source: string;
  // What the graph shows, read aloud by a screen reader.
  alt: string;
}

const ORDER = `  A[Order]
  B[Payment]
  C[Stock]
  D[Packing]
  E[Shipping]
  F[Receipt]`;

const ORDER_EDGES = `  A --> B
  A --> C
  B --> F
  C --> D
  D --> E`;

export const STEPS: Step[] = [
  {
    slug: "nodes",
    alt: "Six separate nodes with no edges",
    source: `flowchart LR\n${ORDER}\n`,
  },
  {
    slug: "edges",
    alt: "The six nodes joined by five edges",
    source: `flowchart LR\n${ORDER}\n${ORDER_EDGES}\n`,
  },
  {
    slug: "subgraphs",
    alt: "The six nodes, with two subgraphs grouping five of them",
    source: `flowchart LR
  A[Order]
  subgraph billing [Billing]
    B[Payment]
    F[Receipt]
  end
  subgraph warehouse [Warehouse]
    C[Stock]
    D[Packing]
    E[Shipping]
  end
${ORDER_EDGES}
`,
  },
  {
    slug: "nesting",
    alt: "The same diagram with a Dispatch subgraph nested inside Warehouse",
    source: `flowchart LR
  A[Order]
  subgraph billing [Billing]
    B[Payment]
    F[Receipt]
  end
  subgraph warehouse [Warehouse]
    C[Stock]
    subgraph dispatch [Dispatch]
      D[Packing]
      E[Shipping]
    end
  end
${ORDER_EDGES}
`,
  },
  {
    slug: "tree",
    alt: "A mindmap tree three levels deep below its root",
    source: `mindmap
  root((Release))
    Build
      Compile
      Test
    Ship
      Package
        Sign
`,
  },
  {
    slug: "full",
    alt: "A shop architecture with fifteen nodes, fifteen edges and five subgraphs nested two deep",
    source: `flowchart TD
  CUST[Customer]
  subgraph web [Web]
    UI[Storefront]
    API[API gateway]
  end
  subgraph services [Services]
    subgraph orders [Orders]
      OS[Order service]
      OQ[Order queue]
    end
    subgraph billing [Billing]
      PS[Payment service]
      INV[Invoices]
    end
    subgraph stock [Stock]
      SS[Stock service]
      WH[Warehouse feed]
    end
  end
  DB[(Orders DB)]
  PDB[(Payments DB)]
  SDB[(Stock DB)]
  MAIL[Email]
  PSP[Card processor]
  LOG[Audit log]
  CUST --> UI
  UI --> API
  API --> OS
  OS --> OQ
  OQ --> PS
  OQ --> SS
  OS --> DB
  PS --> PDB
  PS --> PSP
  PS --> INV
  INV --> MAIL
  SS --> SDB
  WH --> SS
  OS --> LOG
  PS --> LOG
`,
  },
];

// The step whose findings are shown under every preset.
export const LADDER_STEP = "full";

export interface MeasuredStep {
  step: Step;
  stats: DiagramStats;
  graph: DiagramGraph;
  score: number;
}

export const measureStep = async (step: Step): Promise<MeasuredStep> => {
  const stats = await extractStats(step.source);
  if (stats.error !== null) throw new Error(`complexity step ${step.slug} does not parse: ${stats.error}`);
  const graph = await extractGraph(step.source);
  const score = calculateComplexity(stats, configFromPreset(DEFAULT_PRESET)).visual_complexity_score;
  return { step, stats, graph, score };
};

// A number as the page prints it: at most two decimals, and no trailing zeros.
export const num = (x: number): string => String(Number(x.toFixed(2)));

// The score worked line by line, from the stats and the default weights. The
// last line is the score calculateComplexity returns, and the lines above it
// must arrive there, or the step fails.
export const workedScore = (stats: DiagramStats, c: ThresholdConfig): string => {
  const { nodes: n, edges: e, subgraphs: s } = stats;
  const d = Math.max(stats.max_subgraph_depth, stats.max_tree_depth);
  const base = n + c.edge_weight * e + c.subgraph_weight * s;
  const scale = 1 + c.depth_weight * d;
  const score = calculateComplexity(stats, c).visual_complexity_score;
  if (num(base * scale) !== num(score)) throw new Error(`worked score ${base * scale} is not ${score}`);
  const w = (x: number): string => num(x);
  return [
    `depth = max(subgraph nesting ${stats.max_subgraph_depth}, tree depth ${stats.max_tree_depth}) = ${d}`,
    "",
    `score = (nodes + ${w(c.edge_weight)} × edges + ${w(c.subgraph_weight)} × subgraphs) × (1 + ${w(c.depth_weight)} × depth)`,
    `      = (${n} + ${w(c.edge_weight)} × ${e} + ${w(c.subgraph_weight)} × ${s}) × (1 + ${w(c.depth_weight)} × ${d})`,
    `      = (${n} + ${num(c.edge_weight * e)} + ${num(c.subgraph_weight * s)}) × ${num(scale)}`,
    `      = ${num(base)} × ${num(scale)}`,
    `      = ${num(score)}`,
  ].join("\n");
};

const escapeAttr = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// The parsed structure as cytoscape elements: a subgraph is a compound node
// that its members name as their parent.
export const cytoscapeElements = (graph: DiagramGraph): unknown[] => [
  ...graph.subgraphs.map((g) => ({
    data: { id: g.id, label: g.label, kind: "subgraph", ...(g.parent ? { parent: g.parent } : {}) },
  })),
  ...graph.nodes.map((n) => ({
    data: { id: n.id, label: n.label, kind: "node", ...(n.parent ? { parent: n.parent } : {}) },
  })),
  ...graph.edges.map((e, i) => ({ data: { id: `e${i}`, source: e.source, target: e.target } })),
];

const fence = (text: string, lang: string): string => `\`\`\`${lang}\n${text.replace(/\n+$/, "")}\n\`\`\``;

const caption = (text: string): string => `<p class="ml-caption">${text}</p>`;

// A graph larger than this, or one with subgraphs, is drawn across the page
// below its source, since half a page leaves its labels too small to read.
const WIDE_NODES = 10;

const card = (lines: string[]): string[] => ["<div markdown>", "", ...lines, "", "</div>"];

export const stepSnippet = (m: MeasuredStep): string => {
  // The direction the graph is laid out in, as mermaid would draw it. A mindmap grows sideways.
  const direction = /^\s*flowchart\s+(TD|TB|BT)\b/.test(m.step.source) ? "TB" : "LR";
  const wide = m.stats.nodes > WIDE_NODES || m.stats.subgraphs > 0;
  const data = escapeAttr(JSON.stringify(cytoscapeElements(m.graph)));
  const counts = `${m.stats.nodes} nodes, ${m.stats.edges} edges, ${m.stats.subgraphs} subgraphs`;
  const source = card([caption("Mermaid source"), "", fence(m.step.source, "text")]);
  const graph = card([
    caption(`What the parser returned: ${counts}`),
    "",
    `<div class="ml-cy${wide ? " ml-cy--wide" : ""}" role="img" aria-label="${escapeAttr(m.step.alt)}" data-direction="${direction}" data-graph="${data}"></div>`,
  ]);
  const cards = wide
    ? [...source, "", "</div>", "", '<div class="grid ml-compare" markdown>', "", ...graph]
    : [...source, "", ...graph];
  return [
    '<div class="grid ml-compare" markdown>',
    "",
    ...cards,
    "",
    "</div>",
    "",
    fence(workedScore(m.stats, configFromPreset(DEFAULT_PRESET)), "text"),
  ].join("\n");
};

// The ladder step's findings under each preset, from a real run of the
// complexity rules, so each row is what the linter reports.
export const presetSnippet = async (m: MeasuredStep, file: string): Promise<string> => {
  const page = `${fence(m.step.source, "mermaid")}\n`;
  const rows: string[] = [];
  for (const name of Object.keys(PRESETS)) {
    const c = configFromPreset(name);
    const score = calculateComplexity(m.stats, c).visual_complexity_score;
    const findings = (await checkMarkdown(page, file, { profile: "github", preset: name })).filter((f) =>
      f.rule.startsWith("complexity-"),
    );
    const fired = findings.length ? findings.map((f) => `\`${f.rule}\``).join("<br>") : "None";
    rows.push(
      `| \`${name}\` | ${m.stats.nodes} | ${c.node_acceptable} / ${c.node_complex} / ${c.node_hard_limit} | ${num(score)} | ${c.vcs_acceptable} / ${c.vcs_complex} | ${fired} |`,
    );
  }
  return [
    "| Preset | Nodes | `nodeAcceptable` / `nodeComplex` / `nodeHardLimit` | Score | `vcsAcceptable` / `vcsComplex` | Rules that fire |",
    "|---|---:|---|---:|---|---|",
    ...rows,
  ].join("\n");
};

// Every step's snippet, keyed by its path under docs-site/snippets/.
export const complexitySnippets = async (file: string): Promise<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const step of STEPS) {
    const m = await measureStep(step);
    out[`complexity/${step.slug}.md`] = stepSnippet(m);
    if (step.slug === LADDER_STEP) out["complexity/presets.md"] = await presetSnippet(m, file);
  }
  return out;
};
