#!/usr/bin/env bun
// Writes the OsakaNights colour tokens from design-tokens.json into the token
// block of osakanights.css, between its tokens:start and tokens:end markers.
// Everything outside the markers is authored by hand. With --check it writes
// nothing and fails when the block differs, so a hand edit to a token is caught.
//
//   bun run docs-site/theme/osakanights/tokens.ts [--check]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const HERE = import.meta.dir;
const TOKENS_PATH = join(HERE, "design-tokens.json");
const CSS_PATH = join(HERE, "overrides", "assets", "osakanights", "osakanights.css");
const START = "/* tokens:start. Generated from design-tokens.json by tokens.ts, so edit the JSON. */";
const END = "/* tokens:end */";

// Each mode of the brand, the heading it carries and the Material scheme that draws it.
const MODES = [
  { key: "night", title: "Night", scheme: "slate" },
  { key: "day", title: "Day", scheme: "default" },
] as const;

interface Token {
  $type: string;
  $value: string;
  $description?: string;
}

type Group = Record<string, Token | string>;

const printHelp = (): void => {
  console.log(
    [
      "Usage: bun run docs-site/theme/osakanights/tokens.ts [--check]",
      "",
      "Write the colour tokens from design-tokens.json into osakanights.css.",
      "",
      "Options:",
      "  --check     Write nothing, and fail when the CSS token block is out of date",
      "  -h, --help  Show this help and exit",
    ].join("\n"),
  );
};

const heading = (title: string): string => `/* ── ${title} ${"─".repeat(66 - title.length)} */`;

const renderMode = (title: string, scheme: string, group: Group): string => {
  const lines = Object.entries(group)
    .filter((entry): entry is [string, Token] => !entry[0].startsWith("$"))
    .map(([name, token]) => {
      const note = token.$description ? ` /* ${token.$description} */` : "";
      return `  --${name}: ${token.$value};${note}`;
    });
  return [heading(title), `[data-md-color-scheme="${scheme}"] {`, ...lines, "}"].join("\n");
};

export const renderTokens = (tokens: Record<string, Group>): string => {
  const blocks = MODES.map(({ key, title, scheme }) => {
    const group = tokens[key];
    if (group === undefined) throw new Error(`design-tokens.json has no "${key}" group`);
    return renderMode(title, scheme, group);
  });
  return [START, ...blocks, END].join("\n\n");
};

const spliceTokens = (css: string, block: string): string => {
  const start = css.indexOf(START);
  const end = css.indexOf(END);
  if (start < 0 || end < start) throw new Error(`${CSS_PATH} has no token markers`);
  return css.slice(0, start) + block + css.slice(end + END.length);
};

const main = (): void => {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      check: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help) {
    printHelp();
    return;
  }
  const css = readFileSync(CSS_PATH, "utf8");
  const next = spliceTokens(css, renderTokens(JSON.parse(readFileSync(TOKENS_PATH, "utf8"))));
  if (values.check) {
    if (next !== css) throw new Error("osakanights.css tokens differ from design-tokens.json: run make theme");
    console.log("osakanights.css tokens match design-tokens.json");
    return;
  }
  writeFileSync(CSS_PATH, next);
  console.log(`wrote the tokens into ${CSS_PATH}`);
};

if (import.meta.main) {
  try {
    main();
  } catch (err: unknown) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
