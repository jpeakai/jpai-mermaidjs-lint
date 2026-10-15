// What the running JavaScript can import. Bun runs TypeScript directly, and Node
// strips types from 22.18 and from 23.6 (earlier with a flag, and not at all
// before 22.6). A
// local rule written in TypeScript therefore works under `bunx --bun` or a recent
// Node, and anywhere else it fails with a message that says how to fix it.

export interface RuntimeInfo {
  versions: Record<string, string | undefined>;
  features: Record<string, unknown>;
}

export const canImportTypeScript = (runtime: RuntimeInfo = process as unknown as RuntimeInfo): boolean =>
  typeof runtime.versions.bun === "string" || Boolean(runtime.features.typescript);

export const TYPESCRIPT_HELP =
  "TypeScript cannot be imported by this runtime. Run with Bun (bunx --bun @jpeakai/mermaidjs-lint), use Node 22.18 or newer (23.6 or newer on Node 23), or write a .js or .mjs file";
