"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

interface PlaybookPage {
  path: string;
  title: string;
  content: string;
}

type Load =
  | { state: "loading" }
  | { state: "no-backend" }
  | { state: "error"; message: string }
  | { state: "ready"; backendUrl: string; pages: PlaybookPage[] };

export default function AppPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });

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
  //    read their playbook from it.
  const loadPlaybook = useCallback(
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
        const res = await fetch(`${row.backend_url}/playbook`, {
          headers: { Authorization: `Bearer ${s.access_token}` },
        });
        if (!res.ok) {
          throw new Error(`backend returned ${res.status}`);
        }
        const body = (await res.json()) as { pages: PlaybookPage[] };
        setLoad({
          state: "ready",
          backendUrl: row.backend_url,
          pages: body.pages,
        });
      } catch (err) {
        setLoad({ state: "error", message: (err as Error).message });
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (session) void loadPlaybook(session);
  }, [session, loadPlaybook]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (!session || load.state === "loading") {
    return (
      <main className="center">
        <p className="muted">Opening your playbook...</p>
      </main>
    );
  }

  return (
    <main className="book">
      <header className="book-header">
        <div>
          <p className="eyebrow">AI Playbook</p>
          <strong>{session.user.email}</strong>
        </div>
        <button className="link" onClick={signOut}>
          Sign out
        </button>
      </header>

      {load.state === "no-backend" && (
        <p className="muted">
          No backend is provisioned for your account yet. Ask an admin to run
          the provisioning script for you.
        </p>
      )}

      {load.state === "error" && (
        <p className="error">Could not load your playbook: {load.message}</p>
      )}

      {load.state === "ready" && (
        <>
          {load.pages.length === 0 && (
            <p className="muted">Your playbook is empty - it will fill in soon.</p>
          )}
          {load.pages.map((page) => (
            <article key={page.path} className="page">
              <Markdown>{page.content}</Markdown>
            </article>
          ))}
          <AskBox
            backendUrl={load.backendUrl}
            accessToken={session.access_token}
          />
        </>
      )}
    </main>
  );
}

function AskBox({
  backendUrl,
  accessToken,
}: {
  backendUrl: string;
  accessToken: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setReply(null);
    try {
      const res = await fetch(`${backendUrl}/ask`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`backend returned ${res.status}`);
      const body = (await res.json()) as { reply: string };
      setReply(body.reply);
      setPrompt("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ask">
      <form onSubmit={ask}>
        <label htmlFor="prompt">Ask the author</label>
        <div className="ask-row">
          <textarea
            id="prompt"
            rows={2}
            placeholder="Ask for a plan, a draft, or a critique..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? "Thinking..." : "Ask"}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {reply && <div className="reply">{reply}</div>}
    </section>
  );
}
