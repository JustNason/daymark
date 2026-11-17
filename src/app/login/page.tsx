"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CalendarDays, ArrowRight, LoaderCircle } from "lucide-react";

function DiscordIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Discord"
      style={style}
    >
      <path d="M7 7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7z" />
      <path d="M17 7a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V7z" />
      <path d="M12 18v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6" />
    </svg>
  );
}
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const supabase = createClient();
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    if (!supabase) {
      setError(
        "Connect Supabase to enable accounts. Add the two NEXT_PUBLIC_SUPABASE variables from .env.example.",
      );
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
    else router.push("/app");
    setBusy(false);
  }
  async function signUp() {
    if (!supabase) {
      setError("Configure Supabase before creating an account.");
      return;
    }
    if (!email || !password) {
      setError("Enter an email and password first.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setMessage("Check your email for a confirmation link.");
  }
  async function oauth(provider: "google" | "discord") {
    if (!supabase) {
      setError("Configure Supabase before connecting a login provider.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-brand">
        <div className="brand-mark">
          <CalendarDays size={22} />
        </div>
        <span>DAYMARK</span>
        <p>
          Make room for
          <br />
          <em>what matters.</em>
        </p>
        <small>Your work, thoughtfully arranged.</small>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <div className="eyebrow">WELCOME BACK</div>
          <h1>Sign in to Daymark</h1>
          <p className="muted">Your week is waiting.</p>
          <form onSubmit={submit} className="stack">
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="At least 8 characters"
              />
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <>
                  Sign in <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>
          <div className="auth-divider">
            <span>or continue with</span>
          </div>
          <div className="oauth-row">
            <button
              className="button subtle"
              onClick={() => oauth("google")}
              disabled={busy}
            >
              Google
            </button>
            <button
              className="button subtle"
              onClick={() => oauth("discord")}
              disabled={busy}
            >
              <DiscordIcon size={15} style={{ color: "#5865f2" }} />
              Discord
            </button>
          </div>
          {error && <div className="notice error">{error}</div>}
          {message && <div className="notice success">{message}</div>}
          <button className="text-button" onClick={signUp} disabled={busy}>
            New to Daymark? Create an account
          </button>
          <Link className="text-button" href="/auth/reset">
            Forgot password?
          </Link>
        </div>
        <footer>Private by design · Your data belongs to you</footer>
      </section>
    </main>
  );
}
