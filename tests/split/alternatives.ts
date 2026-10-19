// Reads a refused plan's list or matrix back through mdast, and compares the
// edges it draws with the parsed graph's: every counted node and edge, each
// edge's ends, way, label and connector (MJL-0034). Nothing here reads the
// emitted text but mdast's own tree.

import type { List, ListItem, Node, Parent, Root, RootContent, Table } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type { DiagramGraph, GraphEdge } from "../../src/parse/graph.ts";
import { UNDIRECTED_KINDS } from "../../src/split/quotient.ts";
import { plainText } from "../../src/split/stem.ts";
import type { SplitAlternative } from "../../src/split/types.ts";

const tree = (markdown: string): Root =>
  fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });

// The text a node holds, as mdast reads it.
const textOf = (node: Node): string => {
  if ("value" in node && typeof node.value === "string") return node.value;
  return "children" in node ? (node as Parent).children.map(textOf).join("") : "";
};

// An edge as the alternative must draw it: its ends (sorted when it has no
// direction), its label as a reader sees it and the connector it names.
const drawnKey = (ends: [string, string], undirected: boolean, label: string, connector: string): string =>
  JSON.stringify([undirected ? [...ends].sort() : ends, undirected, label, connector]);

const isUndirected = (e: GraphEdge): boolean =>
  (e.cardinality === undefined && e.kind !== undefined && UNDIRECTED_KINDS.has(e.kind)) ||
  (e.kind !== undefined && e.kind.length > 2 && e.kind.startsWith("<") && e.kind.endsWith(">"));

const connectorOf = (e: GraphEdge): string => {
  const c = e.cardinality ?? e.kind;
  return c === undefined || c === "-->" || c === "---" ? "" : c;
};

// The name each endpoint is drawn under: its label as a reader sees it, or
// its id, with the id after it when two read alike.
const namesOf = (graph: DiagramGraph): Map<string, string> => {
  const ids = [...new Set([...graph.nodes.map((n) => n.id), ...graph.edges.flatMap((e) => [e.source, e.target])])];
  const labelOf = new Map([...graph.subgraphs, ...graph.nodes].map((n) => [n.id, n.label]));
  const text = new Map(ids.map((id) => [id, plainText(labelOf.get(id) ?? id) || id]));
  const count = new Map<string, number>();
  for (const t of text.values()) count.set(t, (count.get(t) ?? 0) + 1);
  return new Map(
    ids.map((id) => {
      const t = text.get(id) ?? id;
      return [id, (count.get(t) ?? 0) > 1 && t !== id ? `${t} (${id})` : t];
    }),
  );
};

export const wanted = (graph: DiagramGraph): string[] =>
  graph.edges
    .map((e) =>
      drawnKey([e.source, e.target], isUndirected(e), e.label === undefined ? "" : plainText(e.label), connectorOf(e)),
    )
    .sort();

const idsByName = (graph: DiagramGraph): Map<string, string> =>
  new Map([...namesOf(graph)].map(([id, name]) => [name, id]));

const childrenOf = (node: Node | undefined): RootContent[] =>
  node && "children" in node ? ((node as Parent).children as RootContent[]) : [];

const listIn = (item: ListItem): List | undefined => item.children.find((c): c is List => c.type === "list");

// The text of the first child of a given type among some mdast nodes.
const partText = (parts: RootContent[], type: string): string => {
  const part = parts.find((c) => c.type === type);
  return part ? textOf(part) : "";
};

const idOf = (ids: Map<string, string>, name: string): string => ids.get(name) ?? `?${name}`;

// One bucket's edges: its way (its leading text), label (its emphasis) and
// connector (its code), and each leaf item's name.
const readBucket = (ids: Map<string, string>, centre: string, bucket: ListItem, nodes: Set<string>): string[] => {
  const parts = childrenOf(bucket.children[0]);
  const way = parts[0] ? textOf(parts[0]) : "";
  const [label, connector] = [partText(parts, "emphasis"), partText(parts, "inlineCode")];
  return (listIn(bucket)?.children ?? []).map((leafItem) => {
    const leaf = idOf(ids, textOf(leafItem.children[0] as Node));
    nodes.add(leaf);
    const ends: [string, string] = way.startsWith("Into it") ? [leaf, centre] : [centre, leaf];
    return drawnKey(ends, way.startsWith("Linked with it"), label, connector);
  });
};

// A list's edges: each centre item's strong name, then each of its buckets.
const readList = (graph: DiagramGraph, root: Root): { edges: string[]; nodes: Set<string> } => {
  const ids = idsByName(graph);
  const nodes = new Set<string>();
  const top = root.children.find((c): c is List => c.type === "list");
  const edges = (top?.children ?? []).flatMap((centreItem) => {
    const centre = idOf(ids, partText(childrenOf(centreItem.children[0]), "strong"));
    nodes.add(centre);
    return (listIn(centreItem)?.children ?? []).flatMap((bucket) => readBucket(ids, centre, bucket, nodes));
  });
  return { edges: edges.sort(), nodes };
};

// One cell's edges, from its row's side: the tokens between <br> breaks, each
// a way glyph, an emphasised label and a connector in code.
const cellTokens = (cell: Node): Array<{ glyph: string; label: string; connector: string }> => {
  const tokens: RootContent[][] = [[]];
  for (const c of childrenOf(cell)) {
    if (c.type === "html") tokens.push([]);
    else tokens.at(-1)?.push(c);
  }
  return tokens
    .filter((t) => t.length > 0)
    .map((t) => {
      const emphasis = t.find((c) => c.type === "emphasis");
      const code = t.find((c) => c.type === "inlineCode");
      return {
        glyph: textOf(t[0] as Node).trim(),
        label: emphasis ? textOf(emphasis) : "",
        connector: code ? textOf(code) : "",
      };
    });
};

// A matrix's edges, read from its cells on and above the diagonal, with every
// cell below checked to hold its mirror's edges seen from the other side.
const readMatrix = (graph: DiagramGraph, root: Root): { edges: string[]; nodes: Set<string>; mirror: string[] } => {
  const ids = idsByName(graph);
  const table = root.children.find((c): c is Table => c.type === "table");
  const [header, ...rows] = table?.children ?? [];
  const cols = (header?.children ?? []).slice(1).map((c) => ids.get(textOf(c)) ?? `?${textOf(c)}`);
  const edges: string[] = [];
  const mirror: string[] = [];
  const flip: Record<string, string> = { "→": "←", "←": "→", "●": "●", "↔": "↔" };
  const rowIds = rows.map((r) => ids.get(textOf(r.children[0] as Node)) ?? `?${textOf(r.children[0] as Node)}`);
  rows.forEach((row, i) => {
    const r = rowIds[i] as string;
    cols.forEach((c, j) => {
      const tokens = cellTokens(row.children[j + 1] as Node);
      if (j < i) {
        const back = cellTokens(rows[j]?.children[i + 1] as Node).map((t) => ({ ...t, glyph: flip[t.glyph] ?? "" }));
        if (JSON.stringify(tokens) !== JSON.stringify(back)) mirror.push(`${r}/${c}`);
        return;
      }
      for (const t of tokens) {
        const undirected = t.glyph === "●" || t.glyph === "↔";
        const ends: [string, string] = t.glyph === "←" ? [c, r] : [r, c];
        edges.push(drawnKey(ends, undirected, t.label, t.connector));
      }
    });
  });
  return { edges: edges.sort(), nodes: new Set([...cols, ...rowIds]), mirror };
};

// Every way the alternative differs from the parsed graph: a node it leaves
// out or invents, an edge it leaves out, invents or draws otherwise, and in a
// matrix a cell that does not mirror its partner.
export const unfaithful = (graph: DiagramGraph, alternative: SplitAlternative): string[] => {
  const root = tree(alternative.markdown);
  const read =
    alternative.kind === "list" ? { ...readList(graph, root), mirror: [] as string[] } : readMatrix(graph, root);
  const want = wanted(graph);
  const problems: string[] = [];
  const ids = [...namesOf(graph).keys()];
  for (const id of ids) if (!read.nodes.has(id)) problems.push(`node ${id} not drawn`);
  for (const id of read.nodes) if (!ids.includes(id)) problems.push(`node ${id} unknown`);
  const left = [...read.edges];
  for (const w of want) {
    const at = left.indexOf(w);
    if (at < 0) problems.push(`edge ${w} not drawn`);
    else left.splice(at, 1);
  }
  for (const extra of left) problems.push(`edge ${extra} not in the diagram`);
  for (const m of read.mirror) problems.push(`cell ${m} does not mirror its partner`);
  return problems;
};
