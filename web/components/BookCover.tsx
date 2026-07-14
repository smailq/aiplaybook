import type { CatalogBook } from "@/lib/catalog";
import { statusLabel } from "@/lib/catalog";

/**
 * A CSS-rendered book cover (no image asset) - a colored cover with a spine, the
 * title in serif, an "AI Playbook" imprint line, and a status ribbon for books
 * that are not yet available. Used on the shelf and the detail page.
 */
export function BookCover({
  book,
  size = "md",
}: {
  book: CatalogBook;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={`book-cover ${size}`}
      style={
        {
          "--cover": book.cover.color,
          "--cover-accent": book.cover.accent,
        } as React.CSSProperties
      }
    >
      <div className="book-cover-spine" aria-hidden="true" />
      <div className="book-cover-face">
        <span className="book-cover-imprint">AI Playbook</span>
        <span className="book-cover-title">{book.title}</span>
        <span className="book-cover-rule" aria-hidden="true" />
      </div>
      {book.status !== "available" && (
        <span className="book-cover-ribbon">{statusLabel(book.status)}</span>
      )}
    </div>
  );
}
