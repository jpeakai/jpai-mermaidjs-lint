// Expanding paths into diagram-bearing files. A directory argument is the
// documented invocation, so it is walked through its subdirectories: stopping
// at the first level would silently omit nested diagrams and let a gate exit 0
// on files it never read.

import { type Dirent, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { DIAGRAM_EXTS } from "./model.ts";

// What a directory walk picks up: raw diagram files and markdown files.
export const DIAGRAM_FILE_EXTS = new Set<string>([...DIAGRAM_EXTS, ".md", ".markdown"]);

// Directories never worth walking. Vendored trees dwarf real content, and
// dot-directories hold VCS and tool state, not diagrams. A denylist keeps the
// walker dependency-free, so it behaves the same outside a git repo.
export const SKIP_DIRS = new Set(["node_modules", "vendor", "dist", "build", "tmp", "__pycache__"]);

const skipDir = (name: string): boolean => name.startsWith(".") || SKIP_DIRS.has(name);

const isDiagramFile = (name: string): boolean => DIAGRAM_FILE_EXTS.has(extname(name).toLowerCase());

// Whether a link resolves to a directory. A dangling link resolves to nothing.
const linksToDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

export interface Collected {
  files: string[];
  // Paths that could not be read, which the caller reports as usage errors.
  unreadable: string[];
  // Symbolic links a directory walk passed over, to files or folders alike.
  // A walk never follows a link, so it cannot leave the tree it was given or
  // loop, and the caller says which it skipped so a gate never passes in
  // silence over a file it did not read. A link named as a path is followed.
  symlinks: string[];
}

export const collectFiles = (paths: string[]): Collected => {
  const files: string[] = [];
  const unreadable: string[] = [];
  const symlinks: string[] = [];
  const seen = new Set<string>();

  // A file reached by more than one path is listed once.
  const add = (abs: string): void => {
    if (seen.has(abs)) return;
    seen.add(abs);
    files.push(abs);
  };

  const visit = (dir: string, entry: Dirent): void => {
    const abs = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (!skipDir(entry.name) && (isDiagramFile(entry.name) || linksToDir(abs))) symlinks.push(abs);
    } else if (entry.isDirectory()) {
      if (!skipDir(entry.name)) walk(abs);
    } else if (entry.isFile() && isDiagramFile(entry.name)) {
      add(abs);
    }
  };

  const walk = (dir: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      unreadable.push(dir);
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) visit(dir, entry);
  };

  for (const p of paths) {
    const abs = resolve(p);
    try {
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
      } else if (st.isFile()) {
        // An explicitly named file is honoured whatever its extension.
        add(abs);
      }
    } catch {
      unreadable.push(p);
    }
  }
  return { files, unreadable, symlinks };
};
