// The worked example on the Summarising a diagram page. Each snippet is built
// from what splitOutcome returns for the real diagram, so the overview drawn,
// its parsed graph and the tier the page names cannot drift from the split code.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cytoscapeElements, measureStep, num } from "../scripts/complexity-steps.ts";
import {
  DIAGRAM,
  drawnSources,
  planPresets,
  presetSnippet,
  splitSnippets,
  tableSnippet,
} from "../scripts/split-steps.ts";
import { configFromPreset, PRESETS } from "../src/parse/metrics.ts";
import { splitPlan } from "../src/split/index.ts";
import { PROJECT_ROOT } from "./helpers.ts";

const PAGE = readFileSync(join(PROJECT_ROOT, "docs-site", "docs", "concepts", "summarisation.md"), "utf8");

const fences = (snippet: string, lang: string): string[] =>
  [...snippet.matchAll(new RegExp(`\`\`\`${lang}\\n([\\s\\S]*?)\\n\`\`\``, "g"))].map((m) => m[1] ?? "");

const decode = (attr: string): unknown =>
  JSON.parse(attr.replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&"));

describe("the summarisation page", () => {
  test("includes every snippet, in the order the generator writes them", async () => {
    const included = [...PAGE.matchAll(/--8<-- "(summarisation\/[\w-]+\.md)"/g)].map((m) => m[1]);
    expect(included).toEqual(Object.keys(await splitSnippets()));
    expect(included).toEqual([
      `summarisation/${DIAGRAM.slug}.md`,
      "summarisation/presets.md",
      ...Object.keys(PRESETS).map((p) => `summarisation/${p}.md`),
    ]);
  });

  test("each score the page states is the diagram's computed score", async () => {
    const stated = [...PAGE.matchAll(/\bscores? (\d+(?:\.\d+)?)\b/g)].map((m) => m[1]);
    expect(stated).toEqual([num((await measureStep(DIAGRAM)).score)]);
  });

  test("each tier the page states is the tier splitPlan selects, preset by preset", async () => {
    const stated = [...PAGE.matchAll(/Under `([\w-]+)`, the plan selects `(T\d)`/g)].map((m) => [m[1], m[2]]);
    const computed = [];
    for (const name of Object.keys(PRESETS)) {
      const plan = await splitPlan(DIAGRAM.source, configFromPreset(name));
      if (plan) computed.push([name, plan.tier]);
    }
    expect(computed.length).toBeGreaterThan(0);
    expect(stated).toEqual(computed);
  });

  test("names no tier in its worked-example prose that the table does not hold", async () => {
    const table = tableSnippet(await planPresets());
    const worked = PAGE.slice(PAGE.indexOf("## A worked example"));
    for (const m of worked.matchAll(/`(T\d)`/g)) expect(table).toContain(`| ${m[1]} |`);
  });
});

describe("the summarisation snippets", () => {
  test("each preset's overview graph is the parsed overview, and each drawn fence is an emitted source", async () => {
    const snippets = await splitSnippets();
    for (const p of await planPresets()) {
      const snippet = snippets[`summarisation/${p.name}.md`] ?? "";
      expect(snippet).toContain(`targets ${p.config.node_target} nodes and a score of ${p.config.vcs_target}`);
      const plan = p.outcome.plan;
      if (!plan) {
        expect(snippet).toContain(p.outcome.reason);
        continue;
      }
      const graph = /data-graph="([^"]*)"/.exec(snippet)?.[1] ?? "";
      expect(decode(graph)).toEqual(cytoscapeElements(plan.overview));
      expect(fences(snippet, "mermaid")).toEqual(drawnSources(plan).map((s) => s.trimEnd()));
      expect(fences(snippet, "text")[0]).toBe(plan.overviewSource.trimEnd());
      expect(snippet).toContain(`tier:          ${plan.tier}`);
      expect(snippet).toContain(`overview:      ${plan.overviewNodes} nodes, score ${num(plan.overviewScore)}`);
      expect(snippet).toContain(`declared loss: ${plan.loss.newReachablePairs} new reachable pairs`);
    }
  });

  test("the table holds each preset's targets, tier, overview and detail count", async () => {
    const planned = await planPresets();
    const table = tableSnippet(planned);
    for (const { name, config, outcome } of planned) {
      const plan = outcome.plan;
      const row = plan
        ? `| \`${name}\` | ${config.node_target} / ${config.vcs_target} | ${plan.tier} | ${plan.overviewNodes} / ${num(plan.overviewScore)} | ${plan.details.length} | ${plan.loss.newReachablePairs} |`
        : `| \`${name}\` | ${config.node_target} / ${config.vcs_target} | No plan |`;
      expect(table).toContain(row);
    }
  });

  test("the diagram's own snippet draws the source and every parsed element", async () => {
    const snippets = await splitSnippets();
    const m = await measureStep(DIAGRAM);
    const snippet = snippets[`summarisation/${DIAGRAM.slug}.md`] ?? "";
    expect(fences(snippet, "mermaid")).toEqual([DIAGRAM.source.trimEnd()]);
    expect(decode(/data-graph="([^"]*)"/.exec(snippet)?.[1] ?? "")).toEqual(cytoscapeElements(m.graph));
  });

  test("a preset with no plan shows why, and a detail split again draws its own overview and details", async () => {
    // The same diagram with its four service regions inside one Services region.
    const nested = DIAGRAM.source
      .replace("  subgraph orders", "  subgraph services [Services]\n  subgraph orders")
      .replace("  SS[Stock service]", "  end\n  SS[Stock service]");
    const planned = await planPresets(nested);
    const none = planned.find((p) => p.outcome.plan === null);
    const again = planned.find((p) => p.outcome.plan?.details.some((d) => d.split !== null));
    if (!(none && again?.outcome.plan)) throw new Error("the nested diagram no longer has both cases");
    const shown = await presetSnippet(none);
    expect(shown).toContain("No plan is offered:");
    expect(shown).toContain(none.outcome.reason);
    const drawn = fences(await presetSnippet(again), "mermaid");
    const sources = drawnSources(again.outcome.plan);
    expect(sources.length).toBeGreaterThan(again.outcome.plan.details.length + 1);
    expect(drawn).toEqual(sources.map((s) => s.trimEnd()));
  });
});
