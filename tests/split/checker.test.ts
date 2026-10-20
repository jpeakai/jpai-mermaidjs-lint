// The strict text-only checker (checker.ts) over every evaluation case set,
// every preset: no plan may carry a BUG or AMBIG finding, and every refused
// star or mesh prints a faithful list or matrix. Then mutations of
// real plans, each a change a faithful plan never shows, which the checker
// must catch: the declared merged marker transitions and the erDiagram
// overview's exact edges are accepted only as declared.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractGraph } from "../../src/parse/graph.ts";
import { configFromPreset, PRESET_NAMES, type ThresholdConfig } from "../../src/parse/metrics.ts";
import { DENSE_MESH, STAR, splitOutcome } from "../../src/split/index.ts";
import type { SplitPlan } from "../../src/split/types.ts";
import { unfaithful } from "./alternatives.ts";
import { checkPlan } from "./checker.ts";
import { lines, target } from "./helpers.ts";

const SLOW = 30_000;
const CASES = join(import.meta.dir, "cases");
const SETS = [
  "round3",
  "adversarial",
  "semantic",
  "blind",
  "round9",
  "round11",
  "round12",
  "round13",
  "round14",
  "round15",
  "round16",
  "round17",
  "round18",
  "round19",
  "round20",
];

const serious = async (source: string, plan: SplitPlan, cfg: ThresholdConfig): Promise<string[]> =>
  (await checkPlan(source, plan, cfg, "")).filter((f) => f.sev === "BUG" || f.sev === "AMBIG").map((f) => f.msg);

describe.each(SETS)("the %s case set reads back with no BUG finding", (set) => {
  const files = readdirSync(join(CASES, set))
    .filter((f) => f.endsWith(".mmd"))
    .sort();
  test.each(files)(
    "%s",
    async (file) => {
      const source = readFileSync(join(CASES, set, file), "utf8");
      const found: string[] = [];
      for (const preset of PRESET_NAMES) {
        const cfg = configFromPreset(preset);
        const out = await splitOutcome(source, cfg);
        if (out.plan) found.push(...(await serious(source, out.plan, cfg)).map((m) => `${preset}${m}`));
        // A star or mesh refused prints a list or matrix in its place, read
        // back here against the graph, so each case is planned only once.
        if ((out.reason === STAR || out.reason === DENSE_MESH) && !out.alternative)
          found.push(`${preset} no alternative`);
        if (out.alternative)
          found.push(...unfaithful(await extractGraph(source), out.alternative).map((m) => `${preset} ${m}`));
      }
      expect(found).toEqual([]);
    },
    SLOW,
  );
});

interface Subject {
  source: string;
  cfg: ThresholdConfig;
  plan: SplitPlan;
}

const subject = async (source: string, cfg: ThresholdConfig): Promise<Subject> => {
  const plan = (await splitOutcome(source, cfg)).plan;
  if (!plan) throw new Error("no plan");
  expect(await serious(source, plan, cfg)).toEqual([]);
  return { source, cfg, plan };
};

const fromCase = async (set: string, file: string, preset: string): Promise<Subject> =>
  subject(readFileSync(join(CASES, set, file), "utf8"), configFromPreset(preset));

// The overview with one line replaced, after checking the line is there.
const rewrite = (plan: SplitPlan, from: string, to: string): SplitPlan => {
  if (!plan.overviewSource.includes(from)) throw new Error(`no line ${from}`);
  return { ...structuredClone(plan), overviewSource: plan.overviewSource.replace(from, to) };
};

const caught = async (s: Subject, broken: SplitPlan, expected: string): Promise<void> => {
  const found = await serious(s.source, broken, s.cfg);
  expect(found.some((m) => m.includes(expected))).toBe(true);
};

// Twelve start transitions, three labels; the overview merges each group's.
const STARTS = lines(
  "stateDiagram-v2",
  ...Array.from({ length: 12 }, (_, i) => `  [*] --> S${i} : start ${i % 3}`),
  ...Array.from({ length: 11 }, (_, i) => `  S${i} --> S${i + 1}`),
);
// Every start transition carries the one label "go".
const AGREED = lines(
  "stateDiagram-v2",
  ...Array.from({ length: 12 }, (_, i) => `  [*] --> S${i} : go`),
  ...Array.from({ length: 11 }, (_, i) => `  S${i} --> S${i + 1}`),
);

describe("merged start and end transitions are accepted only as declared", () => {
  test(
    "dropping a merged transition is caught",
    async () => {
      const s = await subject(STARTS, configFromPreset("low-density"));
      expect(s.plan.loss.mergedMarkers).toBeGreaterThan(0);
      await caught(s, rewrite(s.plan, "\n  [*] --> g1\n", "\n"), "overview drops the stateStart out transition");
    },
    SLOW,
  );

  test(
    "a declared count one short is caught",
    async () => {
      const s = await subject(STARTS, configFromPreset("low-density"));
      const broken = structuredClone(s.plan);
      broken.loss.mergedMarkers -= 1;
      await caught(s, broken, "marker transitions, plan declares");
    },
    SLOW,
  );

  test(
    "a merged transition drawn twice is caught",
    async () => {
      const s = await subject(STARTS, configFromPreset("low-density"));
      await caught(s, rewrite(s.plan, "\n  [*] --> g1\n", "\n  [*] --> g1\n  [*] --> g1\n"), "times");
    },
    SLOW,
  );

  test(
    "a label the merged transitions do not all carry is caught",
    async () => {
      const s = await subject(STARTS, configFromPreset("low-density"));
      await caught(s, rewrite(s.plan, "\n  [*] --> g1\n", "\n  [*] --> g1 : start 1\n"), 'labelled "start 1"');
    },
    SLOW,
  );
});

describe("merged start and end transitions keep their label, originals and scope", () => {
  test(
    "an agreed label changed or dropped is caught",
    async () => {
      const s = await subject(AGREED, configFromPreset("low-density"));
      expect(s.plan.overviewSource).toContain("[*] --> g1 : go");
      await caught(s, rewrite(s.plan, "[*] --> g1 : go", "[*] --> g1 : run"), 'agree on "go"');
      await caught(s, rewrite(s.plan, "[*] --> g1 : go", "[*] --> g1"), 'agree on "go"');
    },
    SLOW,
  );

  test(
    "a fake transition onto a group no original reaches is caught",
    async () => {
      const s = await fromCase("round3", "s02-cross-composite-transitions.mmd", "low-density");
      await caught(
        s,
        rewrite(s.plan, "\n  [*] --> A\n", "\n  [*] --> A\n  [*] --> g1\n"),
        "has no original transition",
      );
    },
    SLOW,
  );

  test(
    "a transition onto a detail's stub is caught",
    async () => {
      const s = await subject(STARTS, configFromPreset("low-density"));
      const broken = structuredClone(s.plan);
      const detail = broken.details.find((d) => Object.keys(d.stubs).length > 0);
      const stub = Object.keys(detail?.stubs ?? {})[0];
      if (!(detail && stub)) throw new Error("no stub");
      detail.source = `${detail.source.trimEnd()}\n  [*] --> ${stub}\n`;
      await caught(s, broken, "marker transition on a stub");
    },
    SLOW,
  );
});

// Two owners joined by two relationships, one owner a hub kept in view and
// the other's aggregate folded, so one overview pair carries two labels.
const TWO_LABELS = lines(
  "erDiagram",
  ...[1, 2, 3].map((i) => `  A ||--o{ A${i} : a${i}`),
  ...[1, 2, 3].map((i) => `  B ||--o{ B${i} : b${i}`),
  "  A ||--o{ B : has",
  "  A ||--o{ B : link",
  "  C }o--o{ A : tags",
  "  D }o--o{ B : tags",
  "  C }o--o{ D : pairs",
);

describe("erDiagram overview edges are exact per pair, label and cardinality", () => {
  const ER = (): Promise<Subject> => subject(TWO_LABELS, target(6, 30));
  const HAS = '  A ||--o{ g1 : "has"';

  test(
    "two labels between the same pair are each drawn once and accepted",
    async () => {
      const s = await ER();
      expect(s.plan.overviewSource).toContain(HAS);
      expect(s.plan.overviewSource).toContain('  A ||--o{ g1 : "link"');
    },
    SLOW,
  );

  test(
    "a dropped edge is caught",
    async () => {
      const s = await ER();
      await caught(s, rewrite(s.plan, `\n${HAS}`, ""), "has no overview edge A->g1");
    },
    SLOW,
  );

  test(
    "a duplicated edge is caught",
    async () => {
      const s = await ER();
      await caught(s, rewrite(s.plan, HAS, `${HAS}\n${HAS}`), "2 times");
    },
    SLOW,
  );

  test(
    "a changed label is caught",
    async () => {
      const s = await ER();
      await caught(s, rewrite(s.plan, HAS, '  A ||--o{ g1 : "owns"'), "has no original witness");
    },
    SLOW,
  );

  test(
    "a changed cardinality is caught",
    async () => {
      const s = await ER();
      await caught(s, rewrite(s.plan, HAS, '  A }|..|{ g1 : "has"'), "has no original witness");
    },
    SLOW,
  );
});

// Two author regions joined by two links, the second written the other way.
const twoWay = (link: string): string =>
  lines(
    "flowchart LR",
    "  subgraph A",
    "    a1 --> a2 --> a3",
    "  end",
    "  subgraph B",
    "    b1 --> b2 --> b3",
    "  end",
    `  a1 ${link} b1`,
    `  b3 ${link} a3`,
    "  x --> y --> z --> w",
  );

describe("other overview edges are one per directed pair, or declared reversed", () => {
  test(
    "a group edge drawn twice is caught",
    async () => {
      const s = await subject(twoWay("-->"), target(6, 20));
      const line = s.plan.overviewSource.split("\n").find((l) => /^ {2}g\d+ --> g\d+$/.test(l)) ?? "";
      await caught(s, rewrite(s.plan, line, `${line}\n${line}`), "2 times");
    },
    SLOW,
  );

  test(
    "an undirected edge standing for both directions is accepted only with its declared count",
    async () => {
      const s = await subject(twoWay("---"), target(6, 20));
      expect(s.plan.loss.reversedEdges).toBe(1);
      const broken = structuredClone(s.plan);
      broken.loss.reversedEdges = 0;
      await caught(s, broken, "edges the other way, plan declares 0");
    },
    SLOW,
  );
});
