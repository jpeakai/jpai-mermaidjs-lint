// The fix engine: a fixpoint loop over splice edits. Each pass rebuilds the
// model, asks the fixers for edits in priority order, and keeps the first edit
// that survives verification. Offsets are only valid for the source they were
// computed from, so every accepted edit restarts the pass.

import { optionsFor, type RunFlags } from "../check.ts";
import { buildDocModel } from "../model.ts";
import { BUILTIN, HELPERS, type Registry } from "../rules/registry.ts";
import type { Edit } from "../rules/types.ts";
import { verify } from "./verify.ts";

const MAX_PASSES = 1_000;

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

export const fixSourceReport = async (
  src: string,
  file: string,
  flags: RunFlags = {},
  registry: Registry = BUILTIN,
): Promise<FixReport> => {
  const kind = file.toLowerCase().endsWith(".mmd") ? "diagram" : "markdown";
  const applied: Edit[] = [];
  const refused: Edit[] = [];
  // An edit refused once stays refused while its source slice is unchanged.
  const refusedKeys = new Set<string>();
  let current = src;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const doc = buildDocModel(current, kind);
    const keyOf = (e: Edit): string => `${e.rule}\u0000${current.slice(e.start, e.end)}\u0000${e.text}`;

    const attempt = async (edits: Edit[]): Promise<boolean> => {
      const next = splice(current, edits);
      const after = buildDocModel(next, kind);
      for (const e of edits) if ((await verify(e, doc, after)) !== "accept") return false;
      current = next;
      applied.push(...edits);
      return true;
    };

    let progressed = false;
    for (const rule of registry.fixOrder) {
      const options = optionsFor(rule, registry.options.get(rule.id), flags);
      const proposed = (await rule.fix?.({ doc, file, options, helpers: HELPERS })) ?? [];
      const sound = proposed.filter((e) => {
        if (wellFormed(e, current.length)) return true;
        const key = `${e.rule}\u0000malformed\u0000${e.start}:${e.end}`;
        if (!refusedKeys.has(key)) {
          refusedKeys.add(key);
          refused.push(e);
        }
        return false;
      });
      const edits = sound.filter((e) => current.slice(e.start, e.end) !== e.text && !refusedKeys.has(keyOf(e)));
      if (edits.length === 0) continue;

      // A rule's whole batch is proven with one re-parse, and a batch that
      // fails falls back to one edit at a time, so one bad edit never blocks
      // the rest.
      if (edits.length > 1 && !overlaps(edits) && (await attempt(edits))) {
        progressed = true;
        break;
      }
      for (const edit of edits) {
        if (await attempt([edit])) {
          progressed = true;
          break;
        }
        refusedKeys.add(keyOf(edit));
        refused.push(edit);
      }
      if (progressed) break;
    }
    if (!progressed) return { output: current, applied, refused };
  }
  throw new Error(`fix did not converge after ${MAX_PASSES} passes; a fixer keeps proposing edits`);
};

export const fixSource = async (
  src: string,
  file: string,
  flags: RunFlags = {},
  registry: Registry = BUILTIN,
): Promise<string> => (await fixSourceReport(src, file, flags, registry)).output;
