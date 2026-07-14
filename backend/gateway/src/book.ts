/**
 * The book: a chapter/section tree of markdown, read off the Hermes volume.
 *
 * The app's primary UI/UX is a real book, so the user's content is organised as
 *
 *   book/
 *     metadata.json                  <- authoritative table of contents
 *     <chapter-slug>/
 *       <section-slug>/
 *         content.md                 <- the section's markdown body (no H1 title)
 *
 * `metadata.json` is the single source of truth for human-friendly titles and for
 * order (array order, not filesystem sort or slug numbering). Slugs are stable
 * identifiers, so a section can be renamed or reordered without moving its folder.
 * A section is a *folder* (not a bare file) so it can later carry co-located assets
 * and per-section version metadata, and so it is the natural unit of a release.
 *
 * Hermes has full read/write access to everything under HERMES_HOME (/opt/data),
 * so it authors these files directly; `validateBook` is the contract it checks its
 * edits against (also exposed as a CLI - see validate-book.ts).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/** The metadata.json schema version this module reads. */
export const BOOK_SCHEMA_VERSION = 1;

/** File that holds a section's markdown body, inside its section folder. */
const CONTENT_FILE = "content.md";
/** Table-of-contents file at the book root. */
const METADATA_FILE = "metadata.json";

/** A valid chapter/section slug: lowercase alphanumerics in dash-separated groups. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A section as declared in metadata.json (no content). */
export interface SectionMeta {
  slug: string;
  title: string;
  /** Optional one-line summary, surfaced in the TOC when present. */
  summary?: string;
  /** Optional publication state; drives later versioning/UX. */
  status?: "draft" | "published";
}

/** A chapter as declared in metadata.json. */
export interface ChapterMeta {
  slug: string;
  title: string;
  sections: SectionMeta[];
}

/** The parsed metadata.json (the table of contents). */
export interface BookMeta {
  schemaVersion: number;
  title: string;
  chapters: ChapterMeta[];
}

/** A section with its markdown body attached. */
export interface Section extends SectionMeta {
  /** Slug of the chapter this section belongs to (handy for the frontend). */
  chapterSlug: string;
  /** Raw markdown from content.md. */
  content: string;
}

/** A chapter with its sections' bodies attached. */
export interface Chapter {
  slug: string;
  title: string;
  sections: Section[];
}

/** The assembled book returned by GET /book. */
export interface Book {
  title: string;
  chapters: Chapter[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Thrown when the book on disk is missing or structurally invalid. */
export class BookError extends Error {
  readonly errors: string[];
  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = "BookError";
    this.errors = errors;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parse and structurally validate a metadata.json value. Collects every problem
 * into `errors` rather than throwing on the first, so a human (or the agent) sees
 * the full picture. Only shapes that pass become a usable `BookMeta`.
 */
function parseMeta(raw: unknown, errors: string[]): BookMeta | null {
  if (!isRecord(raw)) {
    errors.push(`${METADATA_FILE}: top level must be a JSON object`);
    return null;
  }
  if (raw.schemaVersion !== BOOK_SCHEMA_VERSION) {
    errors.push(
      `${METADATA_FILE}: schemaVersion must be ${BOOK_SCHEMA_VERSION} (got ${JSON.stringify(raw.schemaVersion)})`,
    );
  }
  if (typeof raw.title !== "string" || raw.title.trim() === "") {
    errors.push(`${METADATA_FILE}: "title" must be a non-empty string`);
  }
  if (!Array.isArray(raw.chapters)) {
    errors.push(`${METADATA_FILE}: "chapters" must be an array`);
    return null;
  }

  const chapters: ChapterMeta[] = [];
  const chapterSlugs = new Set<string>();
  raw.chapters.forEach((chapterRaw, ci) => {
    const where = `chapters[${ci}]`;
    if (!isRecord(chapterRaw)) {
      errors.push(`${where}: must be an object`);
      return;
    }
    const slug = chapterRaw.slug;
    const title = chapterRaw.title;
    if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
      errors.push(`${where}.slug: must match ${SLUG_RE} (got ${JSON.stringify(slug)})`);
    } else if (chapterSlugs.has(slug)) {
      errors.push(`${where}.slug: duplicate chapter slug "${slug}"`);
    } else {
      chapterSlugs.add(slug);
    }
    if (typeof title !== "string" || title.trim() === "") {
      errors.push(`${where}.title: must be a non-empty string`);
    }
    if (!Array.isArray(chapterRaw.sections)) {
      errors.push(`${where}.sections: must be an array`);
      return;
    }

    const sections: SectionMeta[] = [];
    const sectionSlugs = new Set<string>();
    chapterRaw.sections.forEach((sectionRaw, si) => {
      const swhere = `${where}.sections[${si}]`;
      if (!isRecord(sectionRaw)) {
        errors.push(`${swhere}: must be an object`);
        return;
      }
      const sslug = sectionRaw.slug;
      const stitle = sectionRaw.title;
      if (typeof sslug !== "string" || !SLUG_RE.test(sslug)) {
        errors.push(`${swhere}.slug: must match ${SLUG_RE} (got ${JSON.stringify(sslug)})`);
      } else if (sectionSlugs.has(sslug)) {
        errors.push(`${swhere}.slug: duplicate section slug "${sslug}" in chapter "${String(slug)}"`);
      } else {
        sectionSlugs.add(sslug);
      }
      if (typeof stitle !== "string" || stitle.trim() === "") {
        errors.push(`${swhere}.title: must be a non-empty string`);
      }
      if (
        sectionRaw.status !== undefined &&
        sectionRaw.status !== "draft" &&
        sectionRaw.status !== "published"
      ) {
        errors.push(`${swhere}.status: must be "draft" or "published" when present`);
      }
      if (sectionRaw.summary !== undefined && typeof sectionRaw.summary !== "string") {
        errors.push(`${swhere}.summary: must be a string when present`);
      }
      const section: SectionMeta = {
        slug: String(sslug),
        title: String(stitle),
      };
      if (typeof sectionRaw.summary === "string") section.summary = sectionRaw.summary;
      if (sectionRaw.status === "draft" || sectionRaw.status === "published") {
        section.status = sectionRaw.status;
      }
      sections.push(section);
    });

    chapters.push({ slug: String(slug), title: String(title), sections });
  });

  if (errors.length > 0) return null;
  return {
    schemaVersion: BOOK_SCHEMA_VERSION,
    title: String(raw.title),
    chapters,
  };
}

/** Read + parse metadata.json, throwing a BookError with all problems if invalid. */
async function loadMeta(bookDir: string): Promise<BookMeta> {
  const metaPath = join(bookDir, METADATA_FILE);
  let text: string;
  try {
    text = await readFile(metaPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new BookError(`${METADATA_FILE} not found in ${bookDir}`, [
        `${METADATA_FILE}: not found`,
      ]);
    }
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new BookError(`${METADATA_FILE} is not valid JSON`, [
      `${METADATA_FILE}: invalid JSON (${(err as Error).message})`,
    ]);
  }
  const errors: string[] = [];
  const meta = parseMeta(raw, errors);
  if (!meta) throw new BookError(`${METADATA_FILE} failed validation`, errors);
  return meta;
}

/** Absolute path to a section's content.md. */
function contentPath(bookDir: string, chapterSlug: string, sectionSlug: string): string {
  return join(bookDir, chapterSlug, sectionSlug, CONTENT_FILE);
}

async function readContent(
  bookDir: string,
  chapterSlug: string,
  sectionSlug: string,
): Promise<string | null> {
  try {
    return await readFile(contentPath(bookDir, chapterSlug, sectionSlug), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Read the whole book: metadata (TOC) with every section's content.md inlined,
 * in metadata order. Throws BookError if metadata is invalid or any declared
 * section is missing its content.md.
 */
export async function readBook(bookDir: string): Promise<Book> {
  const meta = await loadMeta(bookDir);
  const missing: string[] = [];
  const chapters: Chapter[] = [];
  for (const chapter of meta.chapters) {
    const sections: Section[] = [];
    for (const section of chapter.sections) {
      const content = await readContent(bookDir, chapter.slug, section.slug);
      if (content === null) {
        missing.push(`${chapter.slug}/${section.slug}/${CONTENT_FILE}: not found`);
        continue;
      }
      sections.push({ ...section, chapterSlug: chapter.slug, content });
    }
    chapters.push({ slug: chapter.slug, title: chapter.title, sections });
  }
  if (missing.length > 0) {
    throw new BookError("book has sections without content.md", missing);
  }
  return { title: meta.title, chapters };
}

/**
 * Read a single section by slug. Returns null when the section is not declared in
 * metadata or its content.md is missing (both surface as a 404 to the client).
 */
export async function readSection(
  bookDir: string,
  chapterSlug: string,
  sectionSlug: string,
): Promise<Section | null> {
  const meta = await loadMeta(bookDir);
  const chapter = meta.chapters.find((c) => c.slug === chapterSlug);
  const section = chapter?.sections.find((s) => s.slug === sectionSlug);
  if (!chapter || !section) return null;
  const content = await readContent(bookDir, chapterSlug, sectionSlug);
  if (content === null) return null;
  return { ...section, chapterSlug, content };
}

/** Shallow scan for content.md files actually on disk: book/<chapter>/<section>/content.md. */
async function scanContentFiles(bookDir: string): Promise<Set<string>> {
  const found = new Set<string>();
  let chapterEntries;
  try {
    chapterEntries = await readdir(bookDir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return found;
    throw err;
  }
  for (const chapterEntry of chapterEntries) {
    if (!chapterEntry.isDirectory()) continue;
    const chapterDir = join(bookDir, chapterEntry.name);
    const sectionEntries = await readdir(chapterDir, { withFileTypes: true });
    for (const sectionEntry of sectionEntries) {
      if (!sectionEntry.isDirectory()) continue;
      try {
        const s = await stat(join(chapterDir, sectionEntry.name, CONTENT_FILE));
        if (s.isFile()) found.add(`${chapterEntry.name}/${sectionEntry.name}`);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
  }
  return found;
}

/**
 * Validate the book on disk without assembling it: metadata schema + the
 * metadata<->filesystem contract. Errors are hard failures (a section missing its
 * content.md); warnings are non-fatal (a content.md on disk not referenced by
 * metadata - an orphan that will never be served). Never throws; returns a report.
 */
export async function validateBook(bookDir: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const metaPath = join(bookDir, METADATA_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(metaPath, "utf8"));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") errors.push(`${METADATA_FILE}: not found in ${bookDir}`);
    else errors.push(`${METADATA_FILE}: unreadable or invalid JSON (${(err as Error).message})`);
    return { ok: false, errors, warnings };
  }

  const meta = parseMeta(raw, errors);
  if (!meta) return { ok: false, errors, warnings };

  const declared = new Set<string>();
  for (const chapter of meta.chapters) {
    for (const section of chapter.sections) {
      const key = `${chapter.slug}/${section.slug}`;
      declared.add(key);
      const content = await readContent(bookDir, chapter.slug, section.slug);
      if (content === null) {
        errors.push(`${key}/${CONTENT_FILE}: declared in metadata but not found on disk`);
      }
    }
  }

  const onDisk = await scanContentFiles(bookDir);
  for (const key of onDisk) {
    if (!declared.has(key)) {
      warnings.push(`${key}/${CONTENT_FILE}: on disk but not referenced in ${METADATA_FILE} (will not be served)`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
