// Every diagram in tests/fixtures and examples/ that exceeds high-density
// acceptable, planned under each preset: a plan offered must pass the
// contract and read back whole from its emitted text, and a refusal must say
// why.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { buildDocModel, documentKind } from "../../src/model.ts";
import { calculateComplexity, configFromPreset, PRESET_NAMES } from "../../src/parse/metrics.ts";
import { extractStats } from "../../src/parse/stats.ts";
import { splitOutcome } from "../../src/split/index.ts";
import { PROJECT_ROOT } from "../helpers.ts";
import { faithful } from "./faithful.ts";

const walk = (path: string): string[] =>
  statSync(path).isFile() ? [path] : readdirSync(path).flatMap((f) => walk(join(path, f)));

const files = ["tests/fixtures", "examples"]
  .flatMap((root) => walk(join(PROJECT_ROOT, root)))
  .filter((f) => /\.(md|mmd)$/.test(f))
  .sort();

const high = configFromPreset("high-density");

const oversized: Array<{ where: string; source: string }> = [];
for (const file of files) {
  const model = buildDocModel(readFileSync(file, "utf8"), documentKind(file));
  for (const d of model.diagrams) {
    const stats = await extractStats(d.source);
    if (stats.error !== null) continue;
    const score = calculateComplexity(stats, high).visual_complexity_score;
    if (stats.nodes > high.node_acceptable || score > high.vcs_acceptable) {
      oversized.push({ where: `${relative(PROJECT_ROOT, file)}:${d.startLine}`, source: d.source });
    }
  }
}

describe("split plans over the repo's own oversized diagrams", () => {
  test("there are oversized diagrams to plan", () => {
    expect(oversized.length).toBeGreaterThan(0);
  });

  for (const { where, source } of oversized) {
    test(where, async () => {
      for (const preset of PRESET_NAMES) {
        const out = await splitOutcome(source, configFromPreset(preset));
        expect({ where, preset, violations: out.violations }).toEqual({ where, preset, violations: [] });
        if (out.plan === null) expect(out.reason).not.toBe("");
        else
          expect({ where, preset, problems: await faithful(source, out.plan) }).toEqual({
            where,
            preset,
            problems: [],
          });
      }
    });
  }
});
