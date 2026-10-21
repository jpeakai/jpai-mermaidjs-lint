// Format the reading surface without rewriting immutable decision records.
// Paragraph boundaries are curated in the template's prose-breaks.json.
import { checkMarkdown, fixMarkdown } from "@jpeakai/prose-gates";
import breaks from "../adrs/templates/prose-breaks.json";

const paragraphStarts: Record<string, string[]> = breaks;

export const formatAdrProse = async (file: string, source: string): Promise<string> => {
  let output = await fixMarkdown(source);
  for (const marker of paragraphStarts[file] ?? []) {
    const lines = output.split("\n");
    const matches = lines.flatMap((line, index) => (line.trim() === marker ? [index] : []));
    if (matches.length !== 1) throw new Error(`${file}: paragraph boundary must match exactly once: ${marker}`);
    lines.splice(matches[0] as number, 0, "");
    output = lines.join("\n");
  }
  if (source.replace(/\s+/g, "") !== output.replace(/\s+/g, "")) {
    throw new Error(`${file}: ADR presentation must preserve every non-whitespace character`);
  }
  const findings = await checkMarkdown(output, file);
  if (findings.length) throw new Error(`${file}: ${JSON.stringify(findings)}`);
  return output;
};

if (import.meta.main) {
  const input: Record<string, string> = JSON.parse(await Bun.stdin.text());
  const output: Record<string, string> = {};
  for (const [file, source] of Object.entries(input)) output[file] = await formatAdrProse(file, source);
  process.stdout.write(JSON.stringify(output));
}
