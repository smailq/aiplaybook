/**
 * Reads the user's playbook (a set of markdown pages) from the Hermes volume.
 *
 * Phase 0 keeps this deliberately flat: every `.md` file under the playbook
 * directory becomes one page, ordered by path. The rich book UI/UX comes later;
 * here we only need to prove an authenticated read of the user's own data.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface PlaybookPage {
  /** Path relative to the playbook dir, e.g. "01-positioning.md". */
  path: string;
  /** Human title derived from the first markdown heading, else the filename. */
  title: string;
  /** Raw markdown. */
  content: string;
}

export interface Playbook {
  pages: PlaybookPage[];
}

async function walkMarkdown(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdown(full)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function titleOf(markdown: string, fallback: string): string {
  for (const line of markdown.split("\n")) {
    const heading = /^#\s+(.+?)\s*$/.exec(line);
    if (heading) return heading[1]!;
  }
  return fallback;
}

/** Load every markdown page under `playbookDir`, sorted by relative path. */
export async function readPlaybook(playbookDir: string): Promise<Playbook> {
  const files = (await walkMarkdown(playbookDir)).sort((a, b) =>
    a.localeCompare(b),
  );
  const pages: PlaybookPage[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    const rel = relative(playbookDir, file).split(sep).join("/");
    pages.push({ path: rel, title: titleOf(content, rel), content });
  }
  return { pages };
}
