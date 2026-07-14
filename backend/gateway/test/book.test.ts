/**
 * Unit tests for the book model: reading assembles the TOC + content in metadata
 * order, and validation enforces the metadata<->filesystem contract that a future
 * Hermes authoring skill checks its edits against.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BookError, readBook, readSection, validateBook } from "../src/book.js";

let dir: string;

type MetaSection = { slug: string; title: string; status?: string; summary?: string };
type MetaChapter = { slug: string; title: string; sections: MetaSection[] };

async function writeMeta(chapters: MetaChapter[], title = "Book"): Promise<void> {
  await writeFile(
    join(dir, "metadata.json"),
    JSON.stringify({ schemaVersion: 1, title, chapters }, null, 2),
  );
}

async function writeSection(chapter: string, section: string, body: string): Promise<void> {
  await mkdir(join(dir, chapter, section), { recursive: true });
  await writeFile(join(dir, chapter, section, "content.md"), body);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "book-unit-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readBook", () => {
  it("assembles chapters and sections in metadata order, not filesystem sort", async () => {
    // Declare chapter-2 before chapter-1 in metadata; on disk they sort the other way.
    await writeMeta([
      { slug: "chapter-2", title: "Second", sections: [{ slug: "section-1", title: "B" }] },
      { slug: "chapter-1", title: "First", sections: [{ slug: "section-1", title: "A" }] },
    ]);
    await writeSection("chapter-1", "section-1", "first body\n");
    await writeSection("chapter-2", "section-1", "second body\n");

    const book = await readBook(dir);
    expect(book.title).toBe("Book");
    expect(book.chapters.map((c) => c.slug)).toEqual(["chapter-2", "chapter-1"]);
    expect(book.chapters[0]!.sections[0]!.content).toBe("second body\n");
    expect(book.chapters[0]!.sections[0]!.chapterSlug).toBe("chapter-2");
  });

  it("passes through optional summary and status", async () => {
    await writeMeta([
      {
        slug: "chapter-1",
        title: "First",
        sections: [{ slug: "section-1", title: "A", status: "draft", summary: "hi" }],
      },
    ]);
    await writeSection("chapter-1", "section-1", "body\n");
    const book = await readBook(dir);
    expect(book.chapters[0]!.sections[0]!.status).toBe("draft");
    expect(book.chapters[0]!.sections[0]!.summary).toBe("hi");
  });

  it("throws BookError when a declared section is missing content.md", async () => {
    await writeMeta([
      { slug: "chapter-1", title: "First", sections: [{ slug: "section-1", title: "A" }] },
    ]);
    // no content.md written
    await expect(readBook(dir)).rejects.toBeInstanceOf(BookError);
  });

  it("throws BookError when metadata.json is missing", async () => {
    await expect(readBook(dir)).rejects.toBeInstanceOf(BookError);
  });
});

describe("readSection", () => {
  beforeEach(async () => {
    await writeMeta([
      { slug: "chapter-1", title: "First", sections: [{ slug: "section-1", title: "A" }] },
    ]);
    await writeSection("chapter-1", "section-1", "body\n");
  });

  it("returns one section", async () => {
    const section = await readSection(dir, "chapter-1", "section-1");
    expect(section?.title).toBe("A");
    expect(section?.content).toBe("body\n");
  });

  it("returns null for a section not in metadata", async () => {
    expect(await readSection(dir, "chapter-1", "ghost")).toBeNull();
    expect(await readSection(dir, "ghost", "section-1")).toBeNull();
  });
});

describe("validateBook", () => {
  it("accepts a well-formed book", async () => {
    await writeMeta([
      { slug: "chapter-1", title: "First", sections: [{ slug: "section-1", title: "A" }] },
    ]);
    await writeSection("chapter-1", "section-1", "body\n");
    const result = await validateBook(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("errors when a declared section has no content.md", async () => {
    await writeMeta([
      { slug: "chapter-1", title: "First", sections: [{ slug: "section-1", title: "A" }] },
    ]);
    const result = await validateBook(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("content.md"))).toBe(true);
  });

  it("warns (but does not fail) on an orphan content.md not in metadata", async () => {
    await writeMeta([
      { slug: "chapter-1", title: "First", sections: [{ slug: "section-1", title: "A" }] },
    ]);
    await writeSection("chapter-1", "section-1", "body\n");
    await writeSection("chapter-1", "orphan", "stray\n"); // on disk, not declared
    const result = await validateBook(dir);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("orphan"))).toBe(true);
  });

  it("rejects a bad slug", async () => {
    await writeMeta([
      { slug: "Chapter_1", title: "First", sections: [{ slug: "section-1", title: "A" }] },
    ]);
    const result = await validateBook(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("slug"))).toBe(true);
  });

  it("rejects a duplicate section slug within a chapter", async () => {
    await writeMeta([
      {
        slug: "chapter-1",
        title: "First",
        sections: [
          { slug: "section-1", title: "A" },
          { slug: "section-1", title: "B" },
        ],
      },
    ]);
    const result = await validateBook(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects an empty title", async () => {
    await writeMeta([
      { slug: "chapter-1", title: "", sections: [{ slug: "section-1", title: "A" }] },
    ]);
    const result = await validateBook(dir);
    expect(result.ok).toBe(false);
  });

  it("rejects a wrong schemaVersion", async () => {
    await writeFile(
      join(dir, "metadata.json"),
      JSON.stringify({ schemaVersion: 2, title: "Book", chapters: [] }),
    );
    const result = await validateBook(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
  });

  it("reports invalid JSON without throwing", async () => {
    await writeFile(join(dir, "metadata.json"), "{ not json");
    const result = await validateBook(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("json"))).toBe(true);
  });
});
