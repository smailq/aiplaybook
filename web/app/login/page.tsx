"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="center">
      <div className="card">
        <p className="eyebrow">AI Playbook</p>
        <h1 style={{ marginTop: "0.3rem" }}>Sign in</h1>
        {status === "sent" ? (
          <p className="muted">
            Check <strong>{email}</strong> for a magic link. Open it on this
            device to continue.
          </p>
        ) : (
          <form onSubmit={sendLink}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="submit"
              disabled={status === "sending"}
              style={{ marginTop: "1rem", width: "100%" }}
            >
              {status === "sending" ? "Sending..." : "Email me a magic link"}
            </button>
            {error && (
              <p className="error" style={{ marginTop: "1rem" }}>
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
