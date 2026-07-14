import Link from "next/link";

/**
 * Marketing landing page at the root. The app itself lives at /app (auth-gated);
 * the primary CTA sends visitors there - returning users land in their book, new
 * ones are routed to /login.
 */
export default function Home() {
  return (
    <main className="landing">
      <section className="hero">
        <p className="eyebrow">AI Playbook</p>
        <h1>The marketing guide that writes itself around your business.</h1>
        <p className="lede">
          A fully tailored marketing playbook for your business - authored by AI,
          reviewed and edited by real marketing experts, and interactive: it adapts
          as trends shift and your direction changes.
        </p>
        <div className="cta-row">
          <Link className="cta" href="/library">
            Explore the library
          </Link>
          <Link className="cta-secondary" href="/app">
            Open your playbook
          </Link>
          <Link className="cta-secondary" href="/login">
            Sign in
          </Link>
        </div>
      </section>

      <section className="features">
        <article className="feature">
          <h2>Tailored to your business</h2>
          <p>
            Not generic advice. Every page is written for your product, your
            market, and your goals - a plan you actually execute against.
          </p>
        </article>
        <article className="feature">
          <h2>Reviewed by marketing experts</h2>
          <p>
            A human expert edits the book and gives direction to both you and the
            AI, so the plan is sound and accountable - not just plausible.
          </p>
        </article>
        <article className="feature">
          <h2>An interactive, living book</h2>
          <p>
            It adapts to new trends and changes of direction, improving each
            section on its own - like a software release - as evidence comes in.
          </p>
        </article>
      </section>

      <footer className="landing-foot">
        <span className="muted">
          Your living playbook - the marketing plan that turns into customers.
        </span>
      </footer>
    </main>
  );
}
