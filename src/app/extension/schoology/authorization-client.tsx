"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ViewState = "checking" | "approve" | "connecting" | "connected" | "error";

export function ExtensionAuthorizationClient({ flowId }: { flowId: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ViewState>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      void Promise.resolve().then(() => {
        setState("error");
        setMessage("Daymark authentication is unavailable. Try again shortly.");
      });
      return;
    }
    void supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        const next = `${window.location.pathname}${window.location.search}`;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setEmail(data.user.email || "your Daymark account");
      setState("approve");
    });
  }, []);

  async function authorize() {
    setState("connecting");
    setMessage("");
    try {
      const response = await fetch("/api/schoology/extension/flow/authorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ flowId }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "Could not connect this extension.";
        throw new Error(error);
      }
      setState("connected");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not connect this extension.",
      );
    }
  }

  return (
    <main className="error-screen">
      <section className="setup-screen extension-authorize-card">
        <Image
          src="/brand/daymark-logo-dark.svg"
          alt="Daymark"
          width={150}
          height={36}
          className="logo-mark logo-dark"
          unoptimized
        />
        <Image
          src="/brand/daymark-logo-light.svg"
          alt="Daymark"
          width={150}
          height={36}
          className="logo-mark logo-light"
          unoptimized
        />
        <div className="eyebrow">SECURE EXTENSION CONNECTION</div>
        {state === "checking" && (
          <>
            <h1>Checking your Daymark session</h1>
            <p>One moment while we verify your account.</p>
          </>
        )}
        {state === "approve" && (
          <>
            <h1>Connect Daymark for Schoology</h1>
            <p>
              You are signed in as <strong>{email}</strong>. Allow the Daymark
              extension to sync coursework from Schoology into this account?
            </p>
            <button
              className="button primary full"
              onClick={() => void authorize()}
            >
              Authorize and connect
            </button>
            <p className="extension-authorize-note">
              The extension only reads a Schoology page when you choose Scan.
              You can revoke its access from Settings at any time.
            </p>
          </>
        )}
        {state === "connecting" && (
          <>
            <h1>Connecting the extension</h1>
            <p>
              <LoaderCircle className="spin" size={16} /> Saving your approval…
            </p>
          </>
        )}
        {state === "connected" && (
          <>
            <h1>Extension connected</h1>
            <p>
              You can return to the Daymark for Schoology extension. It will
              finish connecting automatically.
            </p>
            <p className="notice success">
              <CheckCircle2 size={16} /> Approved for {email}
            </p>
          </>
        )}
        {state === "error" && (
          <>
            <h1>Could not connect</h1>
            <p className="notice error">{message}</p>
            <a className="text-button" href="/app">
              Return to Daymark
            </a>
          </>
        )}
      </section>
    </main>
  );
}
