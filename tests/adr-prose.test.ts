import { expect, test } from "bun:test";
import { formatAdrProse } from "../scripts/adr-prose.ts";

test("ADR presentation reflows sentences without changing their words", async () => {
  const source = "## Decision\n\nKeep every word. Render a readable surface.\n";
  expect(await formatAdrProse("example.md", source)).toBe(
    "## Decision\n\nKeep every word.\nRender a readable surface.\n",
  );
});

test("ADR presentation refuses a non-whitespace fix", async () => {
  await expect(formatAdrProse("example.md", "Keep this — exactly.\n")).rejects.toThrow(
    "must preserve every non-whitespace character",
  );
});

test("ADR presentation requires a curated boundary to match once", async () => {
  await expect(
    formatAdrProse("0042-twin-chains-in-a-nested-detail-fold-in-runs-of-lanes.md", "Different text.\n"),
  ).rejects.toThrow("paragraph boundary must match exactly once");
});

test("ADR presentation reports paragraphs that need an editorial boundary", async () => {
  await expect(
    formatAdrProse("example.md", "One runs. Two runs. Three runs. Four runs. Five runs. Six runs.\n"),
  ).rejects.toThrow("paragraph-sentence-budget-exceeded");
});
