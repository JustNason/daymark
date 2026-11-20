"use client";
import Image from "next/image";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeAuthReturnPath } from "@/lib/auth/return-path";
import { ArrowRight, LoaderCircle } from "lucide-react";

function DiscordIcon({
  size = 16,
  style,
}: {
  size?: number;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-label="Discord"
      style={style}
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}
function GoogleIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-label="Google"
    >
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
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
  function safeNextPath(): string {
    return safeAuthReturnPath(
      new URLSearchParams(window.location.search).get("next"),
      window.location.origin,
    );
  }
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
    else router.push(safeNextPath());
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
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(safeNextPath())}`,
      },
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
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(safeNextPath())}`,
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-brand">
        <Image
          src="/brand/daymark-logo-dark.svg"
          alt="Daymark"
          className="logo-mark logo-dark"
          width={174}
          height={42}
          unoptimized
          style={{ width: 174, height: "auto" }}
        />
        <Image
          src="/brand/daymark-logo-light.svg"
          alt="Daymark"
          className="logo-mark logo-light"
          width={174}
          height={42}
          unoptimized
          style={{ width: 174, height: "auto" }}
        />
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
              <GoogleIcon size={15} />
              Google
            </button>
            <button
              className="button subtle"
              onClick={() => oauth("discord")}
              disabled={busy}
            >
              <DiscordIcon size={15} />
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
