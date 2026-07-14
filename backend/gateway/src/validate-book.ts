/**
 * CLI: validate a book directory against the format contract.
 *
 *   node dist/validate-book.js [bookDir]     (default: $BOOK_DIR or /opt/data/book)
 *
 * Prints errors and warnings; exits non-zero if there is any error. This is the
 * hook a Hermes skill shells out to after authoring or editing the book, so the
 * agent can check its own work before handing the book back to the reader.
 */
import { validateBook } from "./book.js";

async function main(): Promise<number> {
  const bookDir =
    process.argv[2] ?? process.env.BOOK_DIR ?? "/opt/data/book";
  const { ok, errors, warnings } = await validateBook(bookDir);

  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);

  if (ok) {
    console.log(
      `OK: ${bookDir} is a valid book` +
        (warnings.length ? ` (${warnings.length} warning(s))` : ""),
    );
    return 0;
  }
  console.error(`FAILED: ${bookDir} has ${errors.length} error(s)`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`error: ${(err as Error).message}`);
    process.exit(2);
  },
);
