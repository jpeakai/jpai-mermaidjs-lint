// The fix engine: a fixpoint loop over splice edits. Each pass rebuilds the
// model, asks the fixers for edits in priority order, and keeps the first batch
// or single edit that survives verification. Offsets are only valid for the source they were
// computed from, so every accepted edit restarts the pass.

import { checkRunFlags, optionsFor, type RunFlags } from "../check.ts";
import { FixNotConvergingError } from "../errors.ts";
import { buildDocModel, type DocModel, documentKind } from "../model.ts";
import { BUILTIN, HELPERS, type Registry } from "../rules/registry.ts";
import type { Edit, Rule } from "../rules/types.ts";
import { verify } from "./verify.ts";

const MAX_PASSES = 1_000;
const RECENT_PASSES = 50;

export interface FixReport {
  output: string;
  applied: Edit[];
  refused: Edit[];
}

const splice = (src: string, edits: Edit[]): string => {
  let out = src;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
};

const overlaps = (edits: Edit[]): boolean => {
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  return sorted.some((e, i) => i > 0 && e.start < (sorted[i - 1] as Edit).end);
};

// Offsets are whole numbers inside the source, in order, and the replacement is
// text. Anything else is a malformed edit from a fixer that miscounted.
const wellFormed = (e: Edit, length: number): boolean =>
  Number.isInteger(e.start) &&
  Number.isInteger(e.end) &&
  e.start >= 0 &&
  e.start <= e.end &&
  e.end <= length &&
  typeof e.text === "string";

// The state one fix run carries from pass to pass.
interface FixRun {
  file: string;
  flags: RunFlags;
  registry: Registry;
  kind: "markdown" | "diagram";
  current: string;
  applied: Edit[];
  refused: Edit[];
  // An edit refused once stays refused while its source slice is unchanged.
  refusedKeys: Set<string>;
}

const keyOf = (run: FixRun, e: Edit): string => `${e.rule}\u0000${run.current.slice(e.start, e.end)}\u0000${e.text}`;

// Splice the edits, re-parse, and keep the result only when every edit
// survives verification against the pass's model.
const attempt = async (run: FixRun, doc: DocModel, edits: Edit[]): Promise<boolean> => {
  const next = splice(run.current, edits);
  const after = buildDocModel(next, run.kind);
  for (const e of edits) if ((await verify(e, doc, after)) !== "accept") return false;
  run.current = next;
  run.applied.push(...edits);
  return true;
};

// The well-formed edits. A malformed one is refused, once per rule and span.
const soundEdits = (run: FixRun, proposed: Edit[]): Edit[] =>
  proposed.filter((e) => {
    if (wellFormed(e, run.current.length)) return true;
    const key = `${e.rule}\u0000malformed\u0000${e.start}:${e.end}`;
    if (!run.refusedKeys.has(key)) {
      run.refusedKeys.add(key);
      run.refused.push(e);
    }
    return false;
  });

// Whether one rule's edits change the source, trying its batch first.
const applyRule = async (run: FixRun, doc: DocModel, rule: Rule): Promise<boolean> => {
  const options = optionsFor(rule, run.registry.options.get(rule.id), run.flags, run.file);
  const proposed = (await rule.fix?.({ doc, file: run.file, options, helpers: HELPERS })) ?? [];
  const edits = soundEdits(run, proposed).filter(
    (e) => run.current.slice(e.start, e.end) !== e.text && !run.refusedKeys.has(keyOf(run, e)),
  );
  if (edits.length === 0) return false;

  // A rule's whole batch is proven with one re-parse, and a batch that
  // fails falls back to one edit at a time, so one bad edit never blocks
  // the rest.
  if (edits.length > 1 && !overlaps(edits) && (await attempt(run, doc, edits))) return true;
  for (const edit of edits) {
    if (await attempt(run, doc, [edit])) return true;
    run.refusedKeys.add(keyOf(run, edit));
    run.refused.push(edit);
  }
  return false;
};

// One pass over the fixers in priority order. It returns the rule whose edit
// it kept, or undefined when no rule changed the source.
const runPass = async (run: FixRun): Promise<string | undefined> => {
  const doc = buildDocModel(run.current, run.kind);
  for (const rule of run.registry.fixOrder) if (await applyRule(run, doc, rule)) return rule.id;
  return undefined;
};

export const fixSourceReport = async (
  src: string,
  file: string,
  flags: RunFlags = {},
  registry: Registry = BUILTIN,
): Promise<FixReport> => {
  checkRunFlags(flags);
  const run: FixRun = {
    file,
    flags,
    registry,
    kind: documentKind(file),
    current: src,
    applied: [],
    refused: [],
    refusedKeys: new Set<string>(),
  };

  // The rule whose edit each pass kept, so a run that never converges can name
  // the rules still proposing edits at the end.
  const keptBy: string[] = [];

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const kept = await runPass(run);
    if (kept === undefined) return { output: run.current, applied: run.applied, refused: run.refused };
    keptBy.push(kept);
  }
  // The last passes show who was still editing: a fixer that never converges
  // keeps one in every pass.
  const lingering = [...new Set(keptBy.slice(-RECENT_PASSES))].sort();
  throw new FixNotConvergingError(file, MAX_PASSES, lingering);
};

export const fixSource = async (
  src: string,
  file: string,
  flags: RunFlags = {},
  registry: Registry = BUILTIN,
): Promise<string> => (await fixSourceReport(src, file, flags, registry)).output;
