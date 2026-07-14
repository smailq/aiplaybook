import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BookCover } from "@/components/BookCover";
import { getBook, statusLabel } from "@/lib/catalog";

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const book = getBook(params.slug);
  return book
    ? { title: `${book.title} - AI Playbook`, description: book.tagline }
    : { title: "Not found - AI Playbook" };
}

/** Book detail: what you can expect, and how it gets started. Public, no auth. */
export default function BookDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const book = getBook(params.slug);
  if (!book) notFound();

  const available = book.status === "available";

  return (
    <main className="book-detail">
      <Link className="cta-secondary detail-back" href="/library">
        &larr; The Library
      </Link>

      <div className="detail-top">
        <BookCover book={book} size="lg" />
        <div className="detail-head">
          <span className={`status-badge ${available ? "on" : "dev"}`}>
            {statusLabel(book.status)}
          </span>
          <h1>{book.title}</h1>
          <p className="lede">{book.tagline}</p>
          {available ? (
            <Link className="cta" href="/app">
              Open your playbook
            </Link>
          ) : (
            <button className="cta" disabled title="This playbook is in development">
              Coming soon
            </button>
          )}
        </div>
      </div>

      <section className="detail-section">
        <h2>What you can expect</h2>
        <ul className="detail-list">
          {book.whatToExpect.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="detail-section">
        <h2>How it gets started</h2>
        <p className="muted">
          When this playbook opens, the author writes your first edition around a
          few questions:
        </p>
        <ul className="detail-list">
          {book.onboardingPreview.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
