"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

interface Section {
  slug: string;
  title: string;
  chapterSlug: string;
  content: string;
  summary?: string;
  status?: "draft" | "published";
}

interface Chapter {
  slug: string;
  title: string;
  sections: Section[];
}

interface Book {
  title: string;
  chapters: Chapter[];
}

/** Stable id for a section within the book, used for selection + React keys. */
function sectionId(chapterSlug: string, sectionSlug: string): string {
  return `${chapterSlug}/${sectionSlug}`;
}

type Load =
  | { state: "loading" }
  | { state: "no-backend" }
  | { state: "error"; message: string }
  | { state: "ready"; backendUrl: string; book: Book };

export default function AppPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState<string | null>(null);

  // Always resolve a *fresh* access token for a backend call. supabase-js keeps
  // the session refreshed, so this returns a currently-valid JWT even minutes
  // into a long agent turn - reusing the token captured at page load would go
  // stale/expire and the gateway would reject it (401 "missing/invalid token").
  const getToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  // 1. Require a session, else go to /login.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
      } else {
        setSession(data.session);
      }
    });
  }, [supabase, router]);

  // 2. Once authed, find this user's backend (RLS returns only their row) and
  //    read their book from it.
  const loadBook = useCallback(
    async (s: Session) => {
      setLoad({ state: "loading" });
      const { data: row, error } = await supabase
        .from("user_backends")
        .select("backend_url")
        .maybeSingle();

      if (error) {
        setLoad({ state: "error", message: error.message });
        return;
      }
      if (!row) {
        setLoad({ state: "no-backend" });
        return;
      }

      try {
        const token = (await getToken()) ?? s.access_token;
        const res = await fetch(`${row.backend_url}/book`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`backend returned ${res.status}`);
        }
        const book = (await res.json()) as Book;
        setLoad({ state: "ready", backendUrl: row.backend_url, book });
      } catch (err) {
        setLoad({ state: "error", message: (err as Error).message });
      }
    },
    [supabase, getToken],
  );

  useEffect(() => {
    if (session) void loadBook(session);
  }, [session, loadBook]);

  // Re-fetch just the book (no loading flash) and swap it in place. Called after
  // the agent finishes a turn, since a turn may have edited the book on disk.
  const refreshBook = useCallback(
    async (backendUrl: string) => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${backendUrl}/book`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const book = (await res.json()) as Book;
        setLoad((prev) => (prev.state === "ready" ? { ...prev, book } : prev));
      } catch {
        // Keep the current book on a transient refresh failure.
      }
    },
    [getToken],
  );

  // Flat list of sections in reading order, for lookups + a sane default page.
  const sections = useMemo(
    () =>
      load.state === "ready"
        ? load.book.chapters.flatMap((c) => c.sections)
        : [],
    [load],
  );

  // Default to the first section once the book is loaded (or if the selection
  // no longer exists after a reload).
  useEffect(() => {
    if (sections.length === 0) return;
    const stillValid =
      selected && sections.some((s) => sectionId(s.chapterSlug, s.slug) === selected);
    if (!stillValid) {
      const first = sections[0]!;
      setSelected(sectionId(first.chapterSlug, first.slug));
    }
  }, [sections, selected]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!session || load.state === "loading") {
    return (
      <main className="center">
        <p className="muted">Opening your book...</p>
      </main>
    );
  }

  if (load.state === "no-backend") {
    return (
      <main className="center">
        <p className="muted">
          No backend is provisioned for your account yet. Ask an admin to run the
          provisioning script for you.
        </p>
      </main>
    );
  }

  if (load.state === "error") {
    return (
      <main className="center">
        <p className="error">Could not load your book: {load.message}</p>
      </main>
    );
  }

  const { book, backendUrl } = load;
  const current =
    sections.find((s) => sectionId(s.chapterSlug, s.slug) === selected) ??
    sections[0];

  return (
    <div className="book-shell">
      <aside className="toc">
        <div className="toc-head">
          <p className="eyebrow">AI Playbook</p>
          <strong className="toc-title">{book.title}</strong>
        </div>
        <nav>
          {book.chapters.map((chapter) => (
            <div key={chapter.slug} className="toc-chapter">
              <p className="toc-chapter-title">{chapter.title}</p>
              <ul>
                {chapter.sections.map((s) => {
                  const id = sectionId(chapter.slug, s.slug);
                  const active =
                    id === (current ? sectionId(current.chapterSlug, current.slug) : null);
                  return (
                    <li key={id}>
                      <button
                        className={`toc-link${active ? " active" : ""}`}
                        onClick={() => setSelected(id)}
                      >
                        {s.title}
                        {s.status === "draft" && <span className="tag">draft</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <button className="link toc-signout" onClick={signOut}>
          Sign out ({session.user.email})
        </button>
      </aside>

      <main className="reader">
        {book.chapters.length === 0 && (
          <p className="muted">Your book is empty - it will fill in soon.</p>
        )}
        {current && (
          <article className="page">
            <h1>{current.title}</h1>
            <Markdown>{current.content}</Markdown>
          </article>
        )}
      </main>

      <ChatColumn
        backendUrl={backendUrl}
        getToken={getToken}
        onAgentDone={() => refreshBook(backendUrl)}
      />
    </div>
  );
}

type ChatMsg =
  | { role: "you"; text: string }
  | { role: "author"; text: string }
  | { role: "error"; text: string };

/** Poll interval and overall deadline for a single agent turn. */
const POLL_MS = 2000;
const POLL_DEADLINE_MS = 15 * 60 * 1000;

function ChatColumn({
  backendUrl,
  getToken,
  onAgentDone,
}: {
  backendUrl: string;
  getToken: () => Promise<string | null>;
  onAgentDone: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Keep the transcript scrolled to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, busy]);

  // Poll one job to completion. Resolves with the reply or throws on error.
  // Each poll fetches a fresh token, so a turn that outlives the original token
  // keeps authenticating instead of failing partway through.
  const pollJob = useCallback(
    async (id: string): Promise<string> => {
      const started = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - started > POLL_DEADLINE_MS) {
          throw new Error("the author is taking unusually long - try again later");
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
        const token = await getToken();
        if (!token) throw new Error("your session expired - please sign in again");
        const res = await fetch(`${backendUrl}/ask/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) throw new Error("lost track of that request");
        if (!res.ok) throw new Error(`backend returned ${res.status}`);
        const body = (await res.json()) as {
          status: "running" | "done" | "error";
          reply?: string;
          error?: string;
        };
        if (body.status === "done") return body.reply ?? "";
        if (body.status === "error") throw new Error(body.error ?? "agent turn failed");
        // running -> keep polling
      }
    },
    [backendUrl, getToken],
  );

  async function submit() {
    const text = prompt.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: "you", text }]);
    setPrompt("");
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("your session expired - please sign in again");
      const res = await fetch(`${backendUrl}/ask`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) throw new Error(`backend returned ${res.status}`);
      const { id } = (await res.json()) as { id: string };
      const reply = await pollJob(id);
      if (!aliveRef.current) return;
      setMessages((m) => [...m, { role: "author", text: reply }]);
      onAgentDone(); // book may have changed - refresh it in place
    } catch (err) {
      if (!aliveRef.current) return;
      setMessages((m) => [...m, { role: "error", text: (err as Error).message }]);
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  return (
    <aside className="chat">
      <div className="chat-head">
        <p className="eyebrow">Ask the author</p>
        <span className="muted chat-hint">
          The author can revise the book. Answers may take a minute.
        </span>
      </div>

      <div className="chat-log" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="muted chat-empty">
            Ask for a plan, a draft, or a critique - or ask the author to add or
            revise a section of the book.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === "author" ? <Markdown>{m.text}</Markdown> : m.text}
          </div>
        ))}
        {busy && (
          <div className="bubble author thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <textarea
          rows={3}
          placeholder="Ask the author..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button type="submit" disabled={busy || !prompt.trim()}>
          {busy ? "Working..." : "Ask"}
        </button>
      </form>
    </aside>
  );
}
