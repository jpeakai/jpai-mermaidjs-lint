// Mermaid source for an overview or a detail diagram, in the diagram's own
// type. Labels are always quoted, with a double quote written #quot;. A group
// node shows " (+N)" in its label, and in a flowchart the subroutine shape; a
// stub is drawn dashed, and in a flowchart as a stadium, in a classDiagram
// with a <<stub>> annotation, since that grammar takes no dashed style.

import type { DiagramGraph, GraphEdge, GraphNode } from "../parse/graph.ts";
import { byText, type Family } from "./graph.ts";

// Mermaid's parser stores an entity such as #quot; or #35; in a label as
// marks around its name (its encodeEntities), and these put back what the
// source wrote, as mermaid's decodeEntities does, which it does not export.
export const sourceEntities = (s: string): string =>
  s.replaceAll("ﬂ°°", "#").replaceAll("ﬂ°", "#").replaceAll("¶ß", ";");
export const htmlEntities = (s: string): string =>
  s.replaceAll("ﬂ°°", "&#").replaceAll("ﬂ°", "&").replaceAll("¶ß", ";");

export const quoteLabel = (label: string): string =>
  sourceEntities(label).replaceAll('"', "#quot;").replaceAll("\r\n", "<br>").replaceAll("\n", "<br>");

const STUB_STYLE = "classDef stub stroke-dasharray:4";

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

interface Scene {
  graph: DiagramGraph;
  stubs: ReadonlySet<string>;
}

const pad = (depth: number): string => "  ".repeat(depth + 1);

const childrenIn = (graph: DiagramGraph, scope: string | null): { nodes: GraphNode[]; boxes: GraphNode[] } => ({
  nodes: graph.nodes.filter((n) => n.parent === scope && `${n.id}__group` !== scope),
  boxes: graph.subgraphs.filter((s) => s.parent === scope).sort((a, b) => byText(a.id, b.id)),
});

const flowNode = (n: GraphNode): string => {
  const label = `"${quoteLabel(n.label)}"`;
  const bracket = BRACKETS[n.shape ?? "square"];
  return bracket ? `${n.id}${bracket[0]}${label}${bracket[1]}` : `${n.id}@{ shape: ${n.shape}, label: ${label} }`;
};

const flowScope = (graph: DiagramGraph, scope: string | null, depth: number): string[] => {
  const { nodes, boxes } = childrenIn(graph, scope);
  return [
    ...nodes.map((n) => `${pad(depth)}${flowNode(n)}`),
    ...boxes.flatMap((b) => [
      `${pad(depth)}subgraph ${b.id}["${quoteLabel(b.label)}"]`,
      ...flowScope(graph, b.id, depth + 1),
      `${pad(depth)}end`,
    ]),
  ];
};

const flowEdge = (e: GraphEdge): string => {
  const kind = e.kind ?? "-->";
  const label = e.label && kind !== "~~~" ? `|"${quoteLabel(e.label)}"|` : "";
  return `${pad(0)}${e.source} ${kind}${label} ${e.target}`;
};

const stubLines = (stubs: ReadonlySet<string>): string[] =>
  stubs.size === 0 ? [] : [`${pad(0)}${STUB_STYLE}`, `${pad(0)}class ${[...stubs].sort(byText).join(",")} stub`];

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

const emitFlowchart = (head: Head, scene: Scene): string =>
  [
    ...headLines(head, ""),
    ...flowScope(scene.graph, null, 0),
    ...scene.graph.edges.map(flowEdge),
    ...stubLines(scene.stubs),
  ].join("\n");

const STATE_PSEUDO = new Set(["choice", "fork", "join"]);

const stateNode = (n: GraphNode): string => {
  if (STATE_PSEUDO.has(n.shape ?? "")) return `state ${n.id} <<${n.shape}>>`;
  return n.label === n.id ? n.id : `state "${quoteLabel(n.label)}" as ${n.id}`;
};

const markerLines = (graph: DiagramGraph, scope: string | null, depth: number): string[] => {
  const markers = new Map((graph.pseudo?.nodes ?? []).map((m) => [m.id, m]));
  return (graph.pseudo?.edges ?? []).flatMap((e) => {
    const start = markers.get(e.source);
    const end = markers.get(e.target);
    if (start && start.parent === scope) return [`${pad(depth)}[*] --> ${e.target}`];
    if (end && end.parent === scope) return [`${pad(depth)}${e.source} --> [*]`];
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
      const head = label === owner ? `state ${owner} {` : `state "${quoteLabel(label)}" as ${owner} {`;
      return [`${pad(depth)}${head}`, ...stateScope(graph, b.id, depth + 1), `${pad(depth)}}`];
    }),
    ...markerLines(graph, scope, depth),
  ];
};

const stateEdge = (e: GraphEdge): string =>
  `${pad(0)}${e.source} --> ${e.target}${e.label ? ` : ${quoteLabel(e.label)}` : ""}`;

const emitState = (head: Head, scene: Scene): string =>
  [
    ...headLines(head, "stateDiagram-v2"),
    ...stateScope(scene.graph, null, 0),
    ...scene.graph.edges.map(stateEdge),
    ...stubLines(scene.stubs),
  ].join("\n");

const entity = (n: GraphNode): string => (n.label === n.id ? n.id : `${n.id}["${quoteLabel(n.label)}"]`);

const relationship = (e: GraphEdge): string =>
  `${pad(0)}${e.source} ${e.cardinality ?? "||--||"} ${e.target} : "${quoteLabel(e.label ?? "")}"`;

const emitEr = (head: Head, scene: Scene): string =>
  [
    ...headLines(head, "erDiagram"),
    ...scene.graph.nodes.map((n) => `${pad(0)}${entity(n)}`),
    ...scene.graph.edges.map(relationship),
    ...stubLines(scene.stubs),
  ].join("\n");

const classDecl = (n: GraphNode): string =>
  n.label === n.id ? `class ${n.id}` : `class ${n.id}["${quoteLabel(n.label)}"]`;

const classEdge = (e: GraphEdge, names: Map<string, string>): string => {
  const [a, b] = [names.get(e.source) ?? e.source, names.get(e.target) ?? e.target];
  return `${pad(0)}${a} ${e.cardinality ?? e.kind ?? "--"} ${b}${e.label ? ` : ${quoteLabel(e.label)}` : ""}`;
};

// Each namespace as its own block under its full id; mermaid nests a dotted
// id inside the namespace it names.
const emitClass = (head: Head, scene: Scene): string => {
  const { graph } = scene;
  const names = new Map((graph.pseudo?.nodes ?? []).map((p) => [p.id, p.label]));
  const spaces = [...graph.subgraphs].sort((a, b) => byText(a.id, b.id));
  return [
    ...headLines(head, "classDiagram"),
    ...spaces.flatMap((s) => {
      const inside = graph.nodes.filter((n) => n.parent === s.id);
      return [`${pad(0)}namespace ${s.id} {`, ...inside.map((n) => `${pad(1)}${classDecl(n)}`), `${pad(0)}}`];
    }),
    ...graph.nodes.filter((n) => n.parent === null).map((n) => `${pad(0)}${classDecl(n)}`),
    ...[...scene.stubs].sort(byText).map((s) => `${pad(0)}<<stub>> ${s}`),
    ...graph.edges.map((e) => classEdge(e, names)),
  ].join("\n");
};

export const emitSource = (head: Head, scene: Scene): string => {
  if (head.family === "flowchart") return emitFlowchart(head, scene);
  if (head.family === "state") return emitState(head, scene);
  if (head.family === "er") return emitEr(head, scene);
  return emitClass(head, scene);
};
