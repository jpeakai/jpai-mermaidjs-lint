// What --split-plan prints: for each diagram a split-offering complexity rule
// flags, the overview and every detail diagram of its split plan as mermaid
// fences, or why no plan met the contract. Nothing is written to a file, so
// the plan stays a recommendation a human applies (MJL-0004, MJL-0025).

import { optionsFor, type RunFlags } from "./check.ts";
import type { Diagram, DocModel } from "./model.ts";
import { thresholdsFrom } from "./parse/metrics.ts";
import { SPLIT_RULES } from "./rules/complexity.ts";
import type { Registry } from "./rules/registry.ts";
import { splitOutcomeOf } from "./rules/shared.ts";
import type { Finding, Rule } from "./rules/types.ts";
import type { SplitAlternative, SplitOutcome, SplitPlan } from "./split/index.ts";

// One checked file: its absolute path, its model, and what the check found.
export interface CheckedFile {
  file: string;
  doc: DocModel;
  found: Finding[];
}

const mermaidFence = (source: string): string => `\`\`\`mermaid\n${source.trimEnd()}\n\`\`\``;

// The lines of one plan: its overview, then each detail, and the diagrams
// drawing the rows of nodes the overview keeps last. Only diagrams that meet
// the target are printed: a detail split once more is drawn as its own
// overview and details one heading level down, never whole.
export const planLines = (plan: SplitPlan, level: number, parent: string | null = null): string[] => {
  const hashes = "#".repeat(level);
  const lines = ["", `${hashes} Overview${parent ? ` of ${parent}` : ""}`, "", mermaidFence(plan.overviewSource)];
  for (const detail of plan.details) {
    const group = plan.groups.find((g) => g.id === detail.group);
    const name = parent ? `${parent}.${detail.group}` : detail.group;
    lines.push("", `${hashes} Detail ${name}: ${group?.label ?? detail.group}`, "");
    if (detail.split) {
      lines.push(`Detail ${name} is over the target, so it is split once more (${detail.split.tier}).`);
      lines.push("", sentence(detail.split.flagged));
      lines.push(...planLines(detail.split, level + 1, name));
    } else {
      lines.push(mermaidFence(detail.source));
    }
  }
  for (const [i, rows] of plan.rowDetails.entries()) {
    lines.push("", `${hashes} Rows ${i + 1}: ${rows.members.join(", ")}`, "", mermaidFence(rows.source));
  }
  return lines;
};

const sentence = (reason: string): string => `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`;

// What stands in a refused plan's place, when a list or a table reads better.
const ALTERNATIVE_LEAD: Record<SplitAlternative["kind"], string> = {
  list: "In its place, the hub and every node it links, as a list:",
  matrix: "In its place, every link as an adjacency matrix:",
};

// One diagram's section: a heading naming file:line and the tier, then the
// plan, or the reason no plan was offered, followed by the list or table that
// reads better when there is one (MJL-0034). Each section starts with a blank
// line, so it stands apart from the report and the section before it.
export const outcomeLines = (where: string, outcome: SplitOutcome): string[] => {
  const { plan, alternative } = outcome;
  if (!plan) {
    return [
      "",
      `## ${where}: no split plan`,
      "",
      sentence(outcome.reason),
      ...outcome.violations.map((v) => `- ${v}`),
      ...(alternative ? ["", ALTERNATIVE_LEAD[alternative.kind], "", alternative.markdown] : []),
    ];
  }
  return ["", `## ${where}: split plan (${plan.tier})`, "", sentence(plan.flagged), ...planLines(plan, 3)];
};

interface Flagged {
  diagram: Diagram;
  rule: Rule;
}

// Each diagram a split-offering rule flagged, once, with the first rule that
// flagged it, whose thresholds the plan is worked out against.
const flaggedDiagrams = ({ doc, found }: CheckedFile, registry: Registry): Flagged[] => {
  const flagged = new Map<Diagram, Flagged>();
  for (const f of found) {
    const rule = registry.rules.find((r) => r.id === f.rule);
    const diagram = doc.diagrams.find((d) => d.startLine === f.line);
    if (!(rule && diagram && SPLIT_RULES.has(rule.id)) || flagged.has(diagram)) continue;
    flagged.set(diagram, { diagram, rule });
  }
  return [...flagged.values()];
};

// Every section --split-plan prints for the checked files, in file order.
export const splitPlanReport = async (
  checked: CheckedFile[],
  flags: RunFlags,
  registry: Registry,
  shown: (file: string) => string,
): Promise<string[]> => {
  const lines: string[] = [];
  for (const entry of checked) {
    for (const { diagram, rule } of flaggedDiagrams(entry, registry)) {
      const config = thresholdsFrom(optionsFor(rule, registry.options.get(rule.id), flags, entry.file));
      const outcome = await splitOutcomeOf(diagram, config);
      lines.push(...outcomeLines(`${shown(entry.file)}:${diagram.startLine}`, outcome));
    }
  }
  return lines;
};
