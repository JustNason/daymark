"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CalendarDays, ArrowLeft } from "lucide-react";
export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const c = createClient();
    if (!c) {
      setError("Configure Supabase before requesting a password reset.");
      setBusy(false);
      return;
    }
    const { error } = await c.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/auth/reset/confirm`,
    });
    if (error) setError(error.message);
    else
      setMessage(
        "If an account exists for this address, a reset link is on its way.",
      );
    setBusy(false);
  }
  return (
    <main className="reset-screen">
      <div className="brand-mark">
        <CalendarDays size={21} />
      </div>
      <div className="eyebrow">ACCOUNT RECOVERY</div>
      <h1>Reset your password</h1>
      <p className="muted">We’ll send a secure reset link to your email.</p>
      <form className="stack" onSubmit={submit}>
        <label>
          Email address
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <button className="button primary full" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}
      <Link href="/login" className="text-button">
        <ArrowLeft size={14} /> Back to sign in
      </Link>
    </main>
  );
}
