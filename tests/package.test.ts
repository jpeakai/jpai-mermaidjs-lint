// The published package as a consumer meets it: the type declarations a
// TypeScript plugin author compiles against, the files npm packs, and the peer
// range the plugin guide tells authors to copy. `make test` builds dist first.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };
import { PROJECT_ROOT, tempProject } from "./helpers.ts";

const TSC = join(PROJECT_ROOT, "node_modules", "typescript", "bin", "tsc");

const run = async (cmd: string[], cwd: string): Promise<{ code: number; out: string }> => {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: `${stdout}${stderr}` };
};

describe("type declarations", () => {
  test("every types condition points at a built .d.ts file", () => {
    const targets = [pkg.types, pkg.exports["."].types, pkg.exports["./testing"].types];
    for (const target of targets) {
      expect(target).toEndWith(".d.ts");
      expect(existsSync(join(PROJECT_ROOT, target))).toBe(true);
    }
  });

  test("a strict nodenext consumer type-checks with skipLibCheck false", async () => {
    const root = tempProject({
      "package.json": JSON.stringify({ name: "consumer", private: true, type: "module" }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "nodenext",
          moduleResolution: "nodenext",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: [],
        },
        files: ["rule.ts"],
      }),
      "rule.ts": [
        'import { checkMarkdown, type Finding, type Plugin, type PluginRule } from "@jpeakai/mermaidjs-lint";',
        'import { checkRule } from "@jpeakai/mermaidjs-lint/testing";',
        "const rule: PluginRule = {",
        '  category: "house",',
        '  summary: "no TODO",',
        '  check: ({ doc }) => doc.diagrams.map((d) => ({ line: d.startLine, message: "TODO" })),',
        "};",
        'export const plugin: Plugin = { meta: { name: "acme", namespace: "acme", apiVersion: 1 }, rules: { "house-x": rule } };',
        'export const a: Promise<Finding[]> = checkRule(plugin, "house-x", "x");',
        'export const b: Promise<Finding[]> = checkMarkdown("x", "a.md");',
        "",
      ].join("\n"),
    });
    // The package as installed: a folder in node_modules whose package.json
    // is this one, so its exports map is what TypeScript resolves.
    mkdirSync(join(root, "node_modules", "@jpeakai"), { recursive: true });
    symlinkSync(PROJECT_ROOT, join(root, "node_modules", "@jpeakai", "mermaidjs-lint"));
    const ok = await run(["bun", TSC, "-p", root], root);
    expect(ok.out).toBe("");
    expect(ok.code).toBe(0);

    // The check is real: a wrong type is an error, read from the declarations.
    writeFileSync(
      join(root, "rule.ts"),
      `${readFileSync(join(root, "rule.ts"), "utf8")}export const wrong: number = checkMarkdown("x", "a.md");\n`,
    );
    const bad = await run(["bun", TSC, "-p", root], root);
    expect(bad.code).not.toBe(0);
    expect(bad.out).toContain("TS2322");
  }, 60_000);

  test("npm packs the declarations", async () => {
    const r = await run(["npm", "pack", "--dry-run", "--json", "--ignore-scripts"], PROJECT_ROOT);
    expect(r.code).toBe(0);
    const [packed] = JSON.parse(r.out.slice(r.out.indexOf("["))) as { files: { path: string }[] }[];
    const paths = (packed?.files ?? []).map((f) => f.path);
    expect(paths).toContain("dist/types/index.d.ts");
    expect(paths).toContain("dist/types/testing.d.ts");
  }, 60_000);
});

describe("the plugin package guide", () => {
  test("its package.json template accepts the version this package is", () => {
    const guide = readFileSync(join(PROJECT_ROOT, "docs-site", "docs", "guides", "plugin-package.md"), "utf8");
    const block = [...guide.matchAll(/```json\n([\s\S]*?)```/g)]
      .map((m) => m[1] as string)
      .find((body) => body.includes('"peerDependencies"'));
    expect(block).toBeDefined();
    const template = JSON.parse(block as string) as {
      peerDependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    for (const field of [template.peerDependencies, template.devDependencies]) {
      const range = field[pkg.name];
      expect(range).toBeDefined();
      expect(Bun.semver.satisfies(pkg.version, range as string)).toBe(true);
    }
  });
});
