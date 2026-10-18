// Mermaid source for an overview or a detail diagram, in the diagram's own
// type. Each label is written so mermaid's parser reads back the label it was
// read from: a markdown label in backticks, a double quote as #quot; where the
// grammar quotes it. A group node shows " (+N)" in its label, the subroutine
// shape in a flowchart, a thick dashed border in a stateDiagram or erDiagram
// and a <<group>> annotation in a classDiagram; a stub is drawn dashed, and
// in a classDiagram with a <<stub>> annotation, since that grammar takes no
// style. Nodes and edges are written in reading order: along the flow from
// the nodes nothing enters, breadth first, ties in natural order of ids.

import type { DiagramGraph, GraphEdge, GraphNode } from "../parse/graph.ts";
import { byNatural, byText, type Family } from "./graph.ts";

// Mermaid's parser stores an entity such as #quot; or #35; in a label as
// marks around its name (its encodeEntities). htmlEntities is a copy of
// mermaid's decodeEntities, which mermaid exports only from a hash-named
// chunk, a gap MJL-0027 records. sourceEntities undoes encodeEntities, putting
// back what the source wrote. tests/mermaid-mirrors.test.ts pins both to the
// functions in the installed mermaid.
export const sourceEntities = (s: string): string =>
  s.replaceAll("ﬂ°°", "#").replaceAll("ﬂ°", "#").replaceAll("¶ß", ";");
export const htmlEntities = (s: string): string =>
  s.replaceAll("ﬂ°°", "&#").replaceAll("ﬂ°", "&").replaceAll("¶ß", ";");

// A label as source text. Mermaid's sanitizer writes a "<" or ">" that opens
// no tag as &lt; or &gt;, and writes it so again when it reads the bare sign,
// so the bare sign goes back: a state or class line ends at the ";" of the
// entity otherwise.
const sourceText = (label: string): string => sourceEntities(label).replaceAll("&lt;", "<").replaceAll("&gt;", ">");

const oneLine = (s: string): string => s.replaceAll("\r\n", "<br>").replaceAll("\n", "<br>");

export const quoteLabel = (label: string): string => oneLine(sourceText(label).replaceAll('"', "#quot;"));

// A label inside double quotes; a markdown label keeps its lines in backticks.
const quoted = (label: string, markdown: true | undefined): string =>
  markdown ? `"\`${sourceText(label)}\`"` : `"${quoteLabel(label)}"`;

// A label at the end of a line, after a colon, where a quote is plain text.
const tail = (label: string | undefined): string => (label ? ` : ${oneLine(sourceText(label))}` : "");

const STUB_STYLE = "classDef stub stroke-dasharray:4";
const GROUP_STYLE = "classDef group stroke-width:3px,stroke-dasharray:6 3";

const BRACKETS: Record<string, [string, string]> = {
  square: ["[", "]"],
  round: ["(", ")"],
  stadium: ["([", "])"],
  subroutine: ["[[", "]]"],
  cylinder: ["[(", ")]"],
  circle: ["((", "))"],
  doublecircle: ["(((", ")))"],
  odd: [">", "]"],
  diamond: ["{", "}"],
  hexagon: ["{{", "}}"],
  lean_right: ["[/", "/]"],
  lean_left: ["[\\", "\\]"],
  trapezoid: ["[/", "\\]"],
  inv_trapezoid: ["[\\", "/]"],
};

export interface Scene {
  graph: DiagramGraph;
  stubs: ReadonlySet<string>;
  groups?: ReadonlySet<string>;
}

const pad = (depth: number): string => "  ".repeat(depth + 1);

const byId = (a: { id: string }, b: { id: string }): number => byNatural(a.id, b.id);

// The stubs of each graph being emitted, which start the reading order last.
const stubsOf = new WeakMap<DiagramGraph, ReadonlySet<string>>();

// Where a walk may start, in turn: start markers, then the diagram's own
// nodes, then its stubs, each in natural order of ids.
const startOrder = (graph: DiagramGraph): string[] => {
  const stubs = stubsOf.get(graph) ?? new Set<string>();
  const markers = (graph.pseudo?.nodes ?? []).filter((m) => m.shape === "stateStart").map((m) => m.id);
  const own = [...graph.nodes.map((n) => n.id), ...graph.subgraphs.map((s) => s.id)].filter((id) => !stubs.has(id));
  return [...markers.sort(byNatural), ...own.sort(byNatural), ...[...stubs].sort(byNatural)];
};

// Each node's place in reading order: a breadth-first walk along the edges
// from every node nothing enters, then from whatever is left, each step in
// natural order of ids. It reads the graph alone, so statement order never
// reaches it.
const readingOrder = (graph: DiagramGraph): Map<string, number> => {
  const ids = startOrder(graph);
  const out = new Map<string, string[]>();
  const entered = new Set<string>();
  for (const e of [...graph.edges, ...(graph.pseudo?.edges ?? [])]) {
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    if (e.source !== e.target) entered.add(e.target);
  }
  const rank = new Map<string, number>();
  const walk = (start: string): void => {
    for (let queue = [start]; queue.length > 0; ) {
      const id = queue.shift() as string;
      if (rank.has(id)) continue;
      rank.set(id, rank.size);
      queue = [...queue, ...[...(out.get(id) ?? [])].sort(byNatural)];
    }
  };
  for (const id of ids.filter((x) => !entered.has(x))) walk(id);
  for (const id of ids) walk(id);
  return rank;
};

const ranked = (graph: DiagramGraph): ((a: { id: string }, b: { id: string }) => number) => {
  const rank = readingOrder(graph);
  return (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) || byId(a, b);
};

const edgeOrder = (graph: DiagramGraph): ((a: GraphEdge, b: GraphEdge) => number) => {
  const rank = readingOrder(graph);
  const at = (id: string): number => rank.get(id) ?? -1;
  return (a, b) =>
    at(a.source) - at(b.source) || at(a.target) - at(b.target) || byNatural(a.source, b.source) || byText(a.id, b.id);
};

const childrenIn = (graph: DiagramGraph, scope: string | null): { nodes: GraphNode[]; boxes: GraphNode[] } => ({
  nodes: graph.nodes.filter((n) => n.parent === scope && `${n.id}__group` !== scope).sort(ranked(graph)),
  boxes: graph.subgraphs.filter((s) => s.parent === scope).sort(ranked(graph)),
});

// A shape with no bracket is written in mermaid's shape data, whose label is
// always read as markdown, so a plain label is written only when it is the id.
const shapeData = (n: GraphNode): string => {
  if (n.markdown) return `${n.id}@{ shape: ${n.shape}, label: "${sourceText(n.label)}" }`;
  return n.label === n.id
    ? `${n.id}@{ shape: ${n.shape} }`
    : `${n.id}@{ shape: ${n.shape}, label: "${quoteLabel(n.label)}" }`;
};

const flowNode = (n: GraphNode): string => {
  const bracket = BRACKETS[n.shape ?? "square"];
  return bracket ? `${n.id}${bracket[0]}${quoted(n.label, n.markdown)}${bracket[1]}` : shapeData(n);
};

const flowScope = (graph: DiagramGraph, scope: string | null, depth: number): string[] => {
  const { nodes, boxes } = childrenIn(graph, scope);
  return [
    ...nodes.map((n) => `${pad(depth)}${flowNode(n)}`),
    ...boxes.flatMap((b) => [
      `${pad(depth)}subgraph ${b.id}[${quoted(b.label, b.markdown)}]`,
      ...flowScope(graph, b.id, depth + 1),
      `${pad(depth)}end`,
    ]),
  ];
};

const flowEdge = (e: GraphEdge): string => {
  const kind = e.kind ?? "-->";
  const label = e.label && kind !== "~~~" ? `|${quoted(e.label, e.markdown)}|` : "";
  return `${pad(0)}${e.source} ${kind}${label} ${e.target}`;
};

const classLines = (ids: ReadonlySet<string> | undefined, name: string, style: string): string[] =>
  !ids || ids.size === 0 ? [] : [`${pad(0)}${style}`, `${pad(0)}class ${[...ids].sort(byNatural).join(",")} ${name}`];

const styleLines = (scene: Scene, groups: boolean): string[] => [
  ...classLines(scene.stubs, "stub", STUB_STYLE),
  ...(groups ? classLines(scene.groups, "group", GROUP_STYLE) : []),
];

// The lines a diagram opens with: its keyword, and the direction the source
// was parsed with. A flowchart names it on the keyword line.
export interface Head {
  family: Family;
  type: string;
  direction: string;
}

const headLines = (head: Head, keyword: string): string[] => {
  if (head.family === "flowchart") {
    return [`${head.type === "flowchart-elk" ? "flowchart-elk" : "flowchart"} ${head.direction || "TB"}`];
  }
  return [keyword, ...(head.direction && head.direction !== "TB" ? [`${pad(0)}direction ${head.direction}`] : [])];
};

const sortedEdges = (graph: DiagramGraph): GraphEdge[] => [...graph.edges].sort(edgeOrder(graph));

const emitFlowchart = (head: Head, scene: Scene): string =>
  [
    ...headLines(head, ""),
    ...flowScope(scene.graph, null, 0),
    ...sortedEdges(scene.graph).map(flowEdge),
    ...styleLines(scene, false),
  ].join("\n");

const STATE_PSEUDO = new Set(["choice", "fork", "join"]);

const stateNode = (n: GraphNode): string => {
  if (STATE_PSEUDO.has(n.shape ?? "")) return `state ${n.id} <<${n.shape}>>`;
  return n.label === n.id ? n.id : `state ${quoted(n.label, undefined)} as ${n.id}`;
};

// A start or end transition, with its label, inside the box its marker sits in.
const markerLines = (graph: DiagramGraph, scope: string | null, depth: number): string[] => {
  const markers = new Map((graph.pseudo?.nodes ?? []).map((m) => [m.id, m]));
  return [...(graph.pseudo?.edges ?? [])].sort(edgeOrder(graph)).flatMap((e) => {
    const start = markers.get(e.source);
    const end = markers.get(e.target);
    if (start && start.parent === scope) return [`${pad(depth)}[*] --> ${e.target}${tail(e.label)}`];
    if (end && end.parent === scope) return [`${pad(depth)}${e.source} --> [*]${tail(e.label)}`];
    return [];
  });
};

const stateScope = (graph: DiagramGraph, scope: string | null, depth: number): string[] => {
  const { nodes, boxes } = childrenIn(graph, scope);
  const labelOf = new Map(graph.nodes.map((n) => [n.id, n.label]));
  return [
    ...nodes.map((n) => `${pad(depth)}${stateNode(n)}`),
    ...boxes.flatMap((b) => {
      const owner = graph.nodes.find((n) => `${n.id}__group` === b.id)?.id ?? b.id;
      const label = labelOf.get(owner) ?? owner;
      const head = label === owner ? `state ${owner} {` : `state ${quoted(label, undefined)} as ${owner} {`;
      return [`${pad(depth)}${head}`, ...stateScope(graph, b.id, depth + 1), `${pad(depth)}}`];
    }),
    ...markerLines(graph, scope, depth),
  ];
};

const stateEdge = (e: GraphEdge): string => `${pad(0)}${e.source} --> ${e.target}${tail(e.label)}`;

const emitState = (head: Head, scene: Scene): string =>
  [
    ...headLines(head, "stateDiagram-v2"),
    ...stateScope(scene.graph, null, 0),
    ...sortedEdges(scene.graph).map(stateEdge),
    ...styleLines(scene, true),
  ].join("\n");

// A node's rows in braces after its declaration, one per line.
const withRows = (decl: string, n: GraphNode, depth: number): string[] =>
  n.rows?.length
    ? [`${pad(depth)}${decl} {`, ...n.rows.map((r) => `${pad(depth + 1)}${r}`), `${pad(depth)}}`]
    : [`${pad(depth)}${decl}`];

const entity = (n: GraphNode): string[] =>
  withRows(n.label === n.id ? n.id : `${n.id}[${quoted(n.label, undefined)}]`, n, 0);

const relationship = (e: GraphEdge): string =>
  `${pad(0)}${e.source} ${e.cardinality ?? "||--||"} ${e.target} : ${quoted(e.label ?? "", undefined)}`;

const emitEr = (head: Head, scene: Scene): string =>
  [
    ...headLines(head, "erDiagram"),
    ...[...scene.graph.nodes].sort(ranked(scene.graph)).flatMap(entity),
    ...sortedEdges(scene.graph).map(relationship),
    ...styleLines(scene, true),
  ].join("\n");

const classDecl = (n: GraphNode, depth: number): string[] =>
  withRows(n.label === n.id ? `class ${n.id}` : `class ${n.id}[${quoted(n.label, undefined)}]`, n, depth);

const classEdge = (e: GraphEdge, names: Map<string, string>): string => {
  const [a, b] = [names.get(e.source) ?? e.source, names.get(e.target) ?? e.target];
  return `${pad(0)}${a} ${e.cardinality ?? e.kind ?? "--"} ${b}${tail(e.label)}`;
};

const annotations = (ids: ReadonlySet<string> | undefined, name: string): string[] =>
  [...(ids ?? [])].sort(byNatural).map((s) => `${pad(0)}<<${name}>> ${s}`);

// Each namespace holding a class as its own block under its full id; mermaid
// nests a dotted id inside the namespace it names, and makes each namespace
// around it, so one holding only namespaces needs no block.
const emitClass = (head: Head, scene: Scene): string => {
  const { graph } = scene;
  const names = new Map((graph.pseudo?.nodes ?? []).map((p) => [p.id, p.label]));
  const spaces = [...graph.subgraphs].sort(byId);
  return [
    ...headLines(head, "classDiagram"),
    ...spaces.flatMap((s) => {
      const inside = graph.nodes.filter((n) => n.parent === s.id).sort(ranked(graph));
      if (inside.length === 0) return [];
      return [`${pad(0)}namespace ${s.id} {`, ...inside.flatMap((n) => classDecl(n, 1)), `${pad(0)}}`];
    }),
    ...graph.nodes
      .filter((n) => n.parent === null)
      .sort(ranked(graph))
      .flatMap((n) => classDecl(n, 0)),
    ...annotations(scene.stubs, "stub"),
    ...annotations(scene.groups, "group"),
    ...sortedEdges(graph).map((e) => classEdge(e, names)),
  ].join("\n");
};

export const emitSource = (head: Head, scene: Scene): string => {
  stubsOf.set(scene.graph, scene.stubs);
  if (head.family === "flowchart") return emitFlowchart(head, scene);
  if (head.family === "state") return emitState(head, scene);
  if (head.family === "er") return emitEr(head, scene);
  return emitClass(head, scene);
};
