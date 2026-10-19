// What reads better than a split plan the tool refuses, built from the parsed
// graph alone and printed in the plan's place: a star as a markdown list of
// its hub and every leaf, and a dense mesh as a markdown adjacency matrix.
// Each draws every counted node and edge, each edge's way, label and
// connector, so a reader loses nothing the diagram says (MJL-0034).

import type { DiagramGraph, GraphEdge } from "../parse/graph.ts";
import { UNDIRECTED_KINDS } from "./quotient.ts";
import { plainText } from "./stem.ts";
import type { SplitAlternative } from "./types.ts";

// Markdown that would read as markup, written as itself: emphasis, code,
// links, html, table cells and strikethrough marks anywhere, and a heading,
// list or quote mark leading the text.
const escapeMarkdown = (s: string): string =>
  s
    .replace(/[\\`*_[\]<>|~&]/g, "\\$&")
    .replace(/^[#+\-=>]/, "\\$&")
    .replace(/^(\d+)([.)])/, "$1\\$2");

// Every node and every edge end that is no node (a subgraph a flowchart edge
// names), in the order the graph gives them.
const endpointsOf = (graph: DiagramGraph): string[] => {
  const ids = graph.nodes.map((n) => n.id);
  const known = new Set(ids);
  for (const e of graph.edges) {
    for (const end of [e.source, e.target]) {
      if (!known.has(end)) {
        known.add(end);
        ids.push(end);
      }
    }
  }
  return ids;
};

// Each endpoint's name as markdown: its label as a reader sees it, or its id
// when it has none, with the id after it when two endpoints read alike.
const namesOf = (graph: DiagramGraph, ids: readonly string[]): Map<string, string> => {
  const labelOf = new Map([...graph.subgraphs, ...graph.nodes].map((n) => [n.id, n.label]));
  const text = new Map(ids.map((id) => [id, plainText(labelOf.get(id) ?? id) || id]));
  const count = new Map<string, number>();
  for (const t of text.values()) count.set(t, (count.get(t) ?? 0) + 1);
  return new Map(
    ids.map((id) => {
      const t = text.get(id) ?? id;
      return [id, (count.get(t) ?? 0) > 1 && t !== id ? `${escapeMarkdown(t)} (\`${id}\`)` : escapeMarkdown(t)];
    }),
  );
};

// The connector a reader needs told: an erDiagram's cardinality, or any
// connector but a plain arrow or line.
const connectorOf = (e: GraphEdge): string | null => {
  const c = e.cardinality ?? e.kind;
  return c === undefined || c === "-->" || c === "---" ? null : c;
};

const isUndirected = (e: GraphEdge): boolean =>
  e.cardinality === undefined && e.kind !== undefined && UNDIRECTED_KINDS.has(e.kind);

const isBoth = (e: GraphEdge): boolean => e.kind !== undefined && /^<.*>$/.test(e.kind) && e.kind.length > 2;

// An edge's label and connector, as markdown after its way.
const detailOf = (e: GraphEdge): string => {
  const connector = connectorOf(e);
  const label = e.label === undefined ? "" : plainText(e.label);
  return `${connector === null ? "" : ` as \`${connector}\``}${label === "" ? "" : `, labelled *${escapeMarkdown(label)}*`}`;
};

type Way = "Into it" | "Out of it" | "Linked with it";

const wayOf = (e: GraphEdge, centre: string): Way =>
  isUndirected(e) || isBoth(e) ? "Linked with it" : e.source === centre ? "Out of it" : "Into it";

// One centre's list item: its name, then one item per way, label and
// connector, each holding the other end of every such edge.
const section = (centre: string, edges: GraphEdge[], names: Map<string, string>, lead: string): string[] => {
  const buckets = new Map<string, string[]>();
  for (const e of edges) {
    const key = `${wayOf(e, centre)}${detailOf(e)}`;
    const other = e.source === centre ? e.target : e.source;
    buckets.set(key, [...(buckets.get(key) ?? []), names.get(other) ?? other]);
  }
  return [
    `- **${names.get(centre) ?? centre}**${lead}`,
    ...[...buckets].flatMap(([head, ends]) => [`  - ${head} (${ends.length}):`, ...ends.map((x) => `    - ${x}`)]),
  ];
};

// A star as a list: the node with the most links first, with each of its
// links by way, label and connector; then each other edge under its source;
// then any node no edge touches.
export const starList = (graph: DiagramGraph): SplitAlternative => {
  const ids = endpointsOf(graph);
  const names = namesOf(graph, ids);
  const degree = (id: string): number => graph.edges.filter((e) => e.source === id || e.target === id).length;
  const hub = ids.reduce((best, id) => (degree(id) > degree(best) ? id : best), ids[0] ?? "");
  const own = graph.edges.filter((e) => e.source === hub || e.target === hub);
  const lines = section(hub, own, names, `, ${own.length} links:`);
  const rest = graph.edges.filter((e) => !own.includes(e));
  const sources = [...new Set(rest.map((e) => e.source))];
  for (const s of sources)
    lines.push(
      ...section(
        s,
        rest.filter((e) => e.source === s),
        names,
        ":",
      ),
    );
  for (const id of ids) if (id !== hub && degree(id) === 0) lines.push(`- **${names.get(id) ?? id}**, no links`);
  return { kind: "list", markdown: lines.join("\n") };
};

const GLYPH = { out: "→", in: "←", both: "↔", undirected: "●" } as const;

// What one edge reads as in a row's cell: its way from the row, then its
// label and connector.
const glyphOf = (e: GraphEdge, row: string): string =>
  isUndirected(e) ? GLYPH.undirected : isBoth(e) ? GLYPH.both : e.source === row ? GLYPH.out : GLYPH.in;

const token = (e: GraphEdge, row: string): string => {
  const glyph = glyphOf(e, row);
  const connector = connectorOf(e);
  const label = e.label === undefined ? "" : plainText(e.label);
  return `${glyph}${label === "" ? "" : ` *${escapeMarkdown(label)}*`}${connector === null ? "" : ` \`${connector.replaceAll("|", "\\|")}\``}`;
};

// A dense mesh as an adjacency matrix: a row and a column per node, each cell
// holding every edge between its row and column, drawn in both cells, with a
// line before it naming the pairs no edge joins.
export const meshMatrix = (graph: DiagramGraph): SplitAlternative => {
  const ids = endpointsOf(graph);
  const names = namesOf(graph, ids);
  const between = (a: string, b: string): GraphEdge[] =>
    graph.edges.filter((e) => (e.source === a && e.target === b) || (a !== b && e.source === b && e.target === a));
  const cell = (r: string, c: string): string =>
    between(r, c)
      .map((e) => token(e, r))
      .join("<br>");
  const unlinked = ids.flatMap((a, i) =>
    ids.slice(i + 1).flatMap((b) => (between(a, b).length === 0 ? [`${names.get(a)} and ${names.get(b)}`] : [])),
  );
  const pairs = (ids.length * (ids.length - 1)) / 2;
  const used = new Set<string>(graph.edges.map((e) => glyphOf(e, e.source)));
  const legend = [
    used.has(GLYPH.out) ? "→ runs from the row to the column, ← from the column to the row" : "",
    used.has(GLYPH.both) ? "↔ runs both ways" : "",
    used.has(GLYPH.undirected) ? "● is a link with no direction" : "",
  ].filter(Boolean);
  const lines = [
    `${ids.length} nodes, ${pairs - unlinked.length} of ${pairs} pairs linked by ${graph.edges.length} edges. ${
      unlinked.length === 0 ? "Every pair is linked." : `Not linked: ${unlinked.join("; ")}.`
    }`,
    "",
    `In each cell, ${legend.join("; ")}.`,
    "",
    `| | ${ids.map((id) => names.get(id)).join(" | ")} |`,
    `|---|${ids.map(() => ":-:").join("|")}|`,
    ...ids.map((r) => `| **${names.get(r)}** | ${ids.map((c) => cell(r, c)).join(" | ")} |`),
  ];
  return { kind: "matrix", markdown: lines.join("\n") };
};
