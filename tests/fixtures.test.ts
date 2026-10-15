// The fixture corpus: every .md and .mmd under tests/fixtures and examples is a
// case. See tests/fixtures/README.md for how to add one.

import { describe, expect, test } from "bun:test";
import { checkMarkdown, fixSource, RULES } from "../src/index.ts";
import { loadFixtures } from "./fixture-loader.ts";

const fixtures = loadFixtures();
const pinned = fixtures.filter((f) => f.fixed !== null);

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

  test.each(fixtures.map((f) => [f.rel, f] as const))("%s fixes idempotently without adding a rule", async (_, f) => {
    const once = await fixSource(f.source, f.path);
    expect(await fixSource(once, f.path)).toBe(once);
    const before = new Set(await distinctRules(f.source, f.path));
    for (const rule of await distinctRules(once, f.path)) expect(before).toContain(rule);
  });

  test.each(pinned.map((f) => [f.rel, f] as const))("%s fixes to its pinned .fixed file", async (_, f) => {
    expect(await fixSource(f.source, f.path)).toBe(f.fixed as string);
  });
});
