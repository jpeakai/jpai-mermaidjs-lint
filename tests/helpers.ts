// Shared test helpers. Temporary files live under the project's own tmp/,
// never the system temp dir, so every artifact a test writes is inspectable.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { checkMarkdown, type RunFlags } from "../src/index.ts";

export const PROJECT_ROOT = resolve(import.meta.dir, "..");
const TMP = join(PROJECT_ROOT, "tmp", "tests");

// A throwaway project directory holding the given files, so discovery and
// config tests run against a real tree rather than a stand-in.
export const tempProject = (files: Record<string, string>): string => {
  mkdirSync(TMP, { recursive: true });
  const root = mkdtempSync(join(TMP, "project-"));
  // A package.json marks the root, so discovery never walks up into this repo.
  writeFileSync(join(root, "package.json"), files["package.json"] ?? "{}");
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
};

// Runs the CLI as a subprocess, so a test sees real stdout, stderr and the
// exit code the way a user does.
export const runCli = async (
  cwd: string,
  args: string[],
  command: string[] = ["bun", join(PROJECT_ROOT, "src", "bin.ts")],
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const proc = Bun.spawn([...command, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
};

export const fence = (body: string): string => `\`\`\`mermaid\n${body}\n\`\`\`\n`;

// A flowchart that is a chain of n nodes, so its node count is exact.
export const chain = (n: number): string =>
  `flowchart LR\n${Array.from({ length: n - 1 }, (_, i) => `  N${i} --> N${i + 1}`).join("\n")}`;

export const rules = async (src: string, flags?: RunFlags, file = "doc.md"): Promise<string[]> =>
  (await checkMarkdown(src, file, flags)).map((f) => f.rule);
