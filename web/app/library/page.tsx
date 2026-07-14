import Link from "next/link";
import { BookCover } from "@/components/BookCover";
import { CATALOG } from "@/lib/catalog";

/** The bookshelf: browse the playbook products. Public, no auth. */
export default function LibraryPage() {
  return (
    <main className="shelf">
      <header className="shelf-head">
        <Link className="cta-secondary" href="/">
          &larr; Home
        </Link>
        <p className="eyebrow">The Library</p>
        <h1>Playbooks on the shelf</h1>
        <p className="lede">
          Each playbook is a living book for a specific kind of business - written
          by an AI author, edited by human experts, and revised as results come in.
          More are on the way.
        </p>
      </header>

      <ul className="shelf-grid">
        {CATALOG.map((book) => (
          <li key={book.slug}>
            <Link className="shelf-item" href={`/library/${book.slug}`}>
              <BookCover book={book} />
              <span className="shelf-item-title">{book.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
