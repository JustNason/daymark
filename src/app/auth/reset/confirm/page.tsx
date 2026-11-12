"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CalendarDays } from "lucide-react";
export default function ConfirmResetPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else router.replace("/app");
  }
  return (
    <main className="reset-screen">
      <div className="brand-mark"><CalendarDays size={21} /></div>
      <div className="eyebrow">ACCOUNT RECOVERY</div>
      <h1>Choose a new password</h1>
      <p className="muted">Use at least eight characters.</p>
      <form className="stack" onSubmit={submit}>
        <label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="button primary full" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </form>
      {error && <div className="notice error">{error}</div>}
    </main>
  );
}
