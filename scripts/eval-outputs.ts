#!/usr/bin/env bun
// Copies the latest eval run into docs-site/eval-outputs/ for the agent evals
// page: the file each cell's agent left behind, and results.json, which holds
// each cell's verdict, turns and cost with the run's date and the skill commit
// it measured. The run must keep its workspaces (xharness_keep_workspaces in
// pyproject.toml), since a removed workspace leaves nothing to copy.
//
//   bun run scripts/eval-outputs.ts

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";
import { PROJECT_ROOT } from "../tests/helpers.ts";

const SKILL = "mermaidjs-lint";
const CACHE = join(PROJECT_ROOT, ".xharness_eval_cache");
const RESULTS = join(CACHE, "results", SKILL);
const BUILD = join(CACHE, "build");
const EVALS = join(PROJECT_ROOT, "skills", SKILL, "evals");
const SKILL_MD = join(PROJECT_ROOT, "skills", SKILL, "SKILL.md");
const OUT = join(PROJECT_ROOT, "docs-site", "eval-outputs");

interface History {
  case: string;
  fixture: string;
  harness: string;
  model: string;
  family_tier: number;
  verdict: string;
  turns: number;
  estimated_cost_usd: number;
  at: string;
}

export interface EvalCell {
  case: string;
  fixture: string;
  harness: string;
  model: string;
  tier: number;
  verdict: string;
  turns: number;
  cost_usd: number;
}

export interface EvalResults {
  run: string;
  date: string;
  skill_commit: string;
  cost_usd: number;
  cells: EvalCell[];
}

const dirs = (path: string): string[] =>
  existsSync(path)
    ? readdirSync(path, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : [];

// Every session directory, as results/<harness>/<model>/<run>/<session>/.
const sessions = (): { run: string; dir: string }[] =>
  dirs(RESULTS).flatMap((h) =>
    dirs(join(RESULTS, h)).flatMap((m) =>
      dirs(join(RESULTS, h, m)).flatMap((run) =>
        dirs(join(RESULTS, h, m, run)).map((s) => ({ run, dir: join(RESULTS, h, m, run, s) })),
      ),
    ),
  );

// The file each case asks the agent to fix, from its TARGET constant.
const caseTarget = (name: string): string => {
  const src = readFileSync(join(EVALS, `${name}.py`), "utf8");
  const target = src.match(/^TARGET = "([^"]+)"/m)?.[1];
  if (!target) throw new Error(`${name}.py names no TARGET constant`);
  return target;
};

// The run graded the skill files it hashed, so the current SKILL.md must be
// the one it saw, or the commit written beside the results would be wrong.
const checkSkillUnchanged = (resultJson: string): void => {
  const coverage = JSON.parse(readFileSync(resultJson, "utf8")).skill_coverage;
  const seen = coverage.files.find((f: { path: string }) => f.path === "SKILL.md")?.sha256;
  const now = createHash("sha256").update(readFileSync(SKILL_MD)).digest("hex");
  if (seen !== now) throw new Error("SKILL.md has changed since the run, so the run cannot be tied to a commit");
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { help: { type: "boolean", short: "h" } } });
  if (values.help) {
    console.log("Usage: bun run scripts/eval-outputs.ts\n\nCopy the latest eval run into docs-site/eval-outputs/.");
    return;
  }
  const all = sessions();
  const run = all
    .map((s) => s.run)
    .sort()
    .at(-1);
  if (!run) throw new Error(`no eval results under ${RESULTS}`);
  const latest = all.filter((s) => s.run === run);
  checkSkillUnchanged(join(latest[0]?.dir ?? "", "result.json"));

  rmSync(OUT, { recursive: true, force: true });
  const cells: EvalCell[] = [];
  let date = "";
  for (const { dir } of latest) {
    const h: History = JSON.parse(readFileSync(join(dir, "history.json"), "utf8"));
    const target = caseTarget(h.case);
    const file = join(BUILD, `${h.case}-${h.harness}-${h.model}`, target);
    if (!existsSync(file)) throw new Error(`${file} is missing: run the evals with xharness_keep_workspaces`);
    const dest = join(OUT, h.fixture, h.harness, `${h.model}.md`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(file, "utf8"));
    cells.push({
      case: h.case.replace(/^eval_/, ""),
      fixture: h.fixture,
      harness: h.harness,
      model: h.model,
      tier: h.family_tier,
      verdict: h.verdict,
      turns: h.turns,
      cost_usd: h.estimated_cost_usd,
    });
    date = h.at.slice(0, 10) > date ? h.at.slice(0, 10) : date;
  }
  cells.sort((a, b) => a.case.localeCompare(b.case) || a.harness.localeCompare(b.harness) || a.tier - b.tier);
  const skillCommit = (await $`git log -1 --format=%h -- ${dirname(SKILL_MD)}`.text()).trim();
  const results: EvalResults = {
    run,
    date,
    skill_commit: skillCommit,
    cost_usd: Math.round(cells.reduce((sum, c) => sum + c.cost_usd, 0) * 100) / 100,
    cells,
  };
  writeFileSync(join(OUT, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`eval-outputs: wrote ${cells.length} outputs from run ${run} to ${basename(OUT)}/`);
};

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
