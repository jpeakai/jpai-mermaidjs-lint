// The narrow copies MJL-0027 allows, of functions mermaid keeps internal, are
// pinned here to the functions in the installed mermaid. Mermaid exports them
// only from chunks whose names are content hashes, so each chunk is found by
// reading the dependency's own source text, then imported for its behaviour.
// This reads mermaid's code, never a diagram.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { propertiesOf } from "../src/parse/styles.ts";
import { htmlEntities, sourceEntities } from "../src/split/emit.ts";
import { PROJECT_ROOT } from "./helpers.ts";

const CHUNKS = join(PROJECT_ROOT, "node_modules", "mermaid", "dist", "chunks", "mermaid.core");

type Fn = (...args: never[]) => unknown;

// The one chunk that defines `name` as a variable and lists it in its export
// block. The import is dynamic because the chunk's name is a hash, known only
// once the chunk is found.
const internal = async <T extends Fn>(name: string): Promise<T> => {
  const exported = new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\}`);
  const found: string[] = [];
  for await (const file of new Bun.Glob("chunk-*.mjs").scan(CHUNKS)) {
    const text = await Bun.file(join(CHUNKS, file)).text();
    if (text.includes(`var ${name} = `) && exported.test(text)) found.push(file);
  }
  expect(found).toHaveLength(1);
  const chunk = (await import(join(CHUNKS, found[0] ?? ""))) as Record<string, unknown>;
  const fn = chunk[name];
  if (typeof fn !== "function") throw new Error(`mermaid's ${found[0]} exports no function ${name}`);
  return fn as T;
};

const LABELS = [
  "plain text",
  "a #quot;quoted#quot; word",
  "#35; and #9829; and #+12;",
  "#amp;lt; stays one entity",
  "mixed #quot;#35;#quot;",
  "no entity # here ; at all",
  "",
];

describe("htmlEntities and sourceEntities against mermaid's own entity functions", () => {
  test("htmlEntities decodes every encoded label as mermaid's decodeEntities does", async () => {
    const encode = await internal<(s: string) => string>("encodeEntities");
    const decode = await internal<(s: string) => string>("decodeEntities");
    for (const label of LABELS) expect(htmlEntities(encode(label))).toBe(decode(encode(label)));
  });

  test("sourceEntities puts back the source of every label encodeEntities read", async () => {
    const encode = await internal<(s: string) => string>("encodeEntities");
    for (const label of LABELS) expect(sourceEntities(encode(label))).toBe(label);
  });
});

describe("propertiesOf against mermaid's compiled styles", () => {
  // compileStyles runs mermaid's internal styles2Map over a node's styles.
  type Compile = (node: { cssCompiledStyles?: string[]; cssStyles?: string[] }) => { stylesMap: Map<string, unknown> };

  // What the renderer applies: each property with a value, by lower-case key.
  const applied = (map: Map<string, unknown>): Record<string, string> =>
    Object.fromEntries(
      [...map].flatMap(
        ([k, v]): Array<[string, string]> => (typeof v === "string" && v !== "" ? [[k.trim().toLowerCase(), v]] : []),
      ),
    );

  const CASES: Array<[string[], string[]]> = [
    [["fill:#fff"], ["color:#000"]],
    [["fill:#fff", "color:#000"], ["fill:#111"]],
    [[" fill : #fff "], ["stroke-width:2px", "stroke-dasharray: 4 2"]],
    [[], ["font-family:Arial Black", "fill:url(http://x)"]],
    [["fill:rgb(255"], ["255", "255)", "color:#000"]],
    [["fill:#fff"], ["fill:"]],
    [["Fill:#ABC"], []],
  ];

  test("each declaration's key and value are read as mermaid's styles2Map reads them", async () => {
    const compile = await internal<Compile>("compileStyles");
    for (const [inherited, own] of CASES) {
      const mermaid = applied(compile({ cssCompiledStyles: inherited, cssStyles: own }).stylesMap);
      expect(propertiesOf([...inherited, ...own])).toEqual(mermaid);
    }
  });
});
