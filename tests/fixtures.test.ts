// The fixture corpus: every .md, .mmd and .mermaid under tests/fixtures and examples is a
// case. See tests/fixtures/README.md for how to add one.

import { describe, expect, test } from "bun:test";
import { checkMarkdown, fixSource, RULES } from "../src/index.ts";
import { loadFixtures } from "./fixture-loader.ts";

const fixtures = loadFixtures();
const pinned = fixtures.filter((f) => f.fixed !== null);
const withLlm = fixtures.filter((f) => f.llm !== null);

const distinctRules = async (source: string, file: string): Promise<string[]> =>
  [...new Set((await checkMarkdown(source, file)).map((f) => f.rule))].sort();

describe("fixture corpus", () => {
  test("is not empty", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  test("exercises every core rule at least once", () => {
    const covered = new Set(fixtures.flatMap((f) => f.expected ?? []));
    for (const rule of RULES) expect(covered).toContain(rule.id);
  });

  test.each(fixtures.map((f) => [f.rel, f] as const))("%s reports exactly what it expects", async (_, f) => {
    expect(f.expected, `${f.rel} has no expect comment`).not.toBeNull();
    expect(await distinctRules(f.source, f.path)).toEqual(f.expected as string[]);
  });

  // Four full checks, each planning a split for every oversized diagram, run
  // close to the default 5 s under coverage, so this test allows more.
  test.each(fixtures.map((f) => [f.rel, f] as const))(
    "%s fixes idempotently without adding a rule",
    async (_, f) => {
      const once = await fixSource(f.source, f.path);
      expect(await fixSource(once, f.path)).toBe(once);
      const before = new Set(await distinctRules(f.source, f.path));
      for (const rule of await distinctRules(once, f.path)) expect(before).toContain(rule);
    },
    20_000,
  );

  test.each(pinned.map((f) => [f.rel, f] as const))("%s fixes to its pinned .fixed file", async (_, f) => {
    expect(await fixSource(f.source, f.path)).toBe(f.fixed as string);
  });

  // What --fix leaves behind needs judgement, so the gallery shows an LLM fix
  // for it, and that fix must actually clear every finding.
  test.each(fixtures.map((f) => [f.rel, f] as const))("%s has an LLM fix if --fix leaves findings", async (_, f) => {
    const left = await distinctRules(await fixSource(f.source, f.path), f.path);
    if (left.length > 0) expect(f.llm, `${f.rel} keeps ${left.join(" ")} after --fix`).not.toBeNull();
  });

  test.each(withLlm.map((f) => [f.rel, f] as const))("%s LLM fix lints clean and says why", async (_, f) => {
    const llm = f.llm as NonNullable<typeof f.llm>;
    expect(llm.reason, `${llm.path} has no llm: comment`).not.toBeNull();
    expect(await distinctRules(llm.source, llm.path)).toEqual([]);
  });
});
