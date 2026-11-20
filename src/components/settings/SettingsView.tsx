"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { format } from "date-fns";
import {
  Bell,
  Check,
  GraduationCap,
  LogOut,
  Moon,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type IntegrationState = {
  provider: string;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
};
const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export function NotificationPreferences() {
  const [value, setValue] = useState({
    in_app_enabled: true,
    push_enabled: false,
    discord_enabled: false,
    discord_user_id: "",
    email_enabled: false,
    reminder_minutes: [1440, 120],
    quiet_start: "",
    quiet_end: "",
    daily_summary: false,
    weekly_summary: false,
  });
  const [message, setMessage] = useState("");
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [discordLinked, setDiscordLinked] = useState(false);
  useEffect(() => {
    const c = createClient();
    fetch("/api/integrations/discord")
      .then((response) => response.json())
      .then((result: { connected?: boolean }) =>
        setDiscordLinked(result.connected === true),
      )
      .catch(() => setDiscordLinked(false));
    c?.from("notification_preferences")
      .select("*")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setMessage(error.message);
          return;
        }
        if (data)
          setValue((v) => ({
            ...v,
            ...data,
            discord_user_id: data.discord_user_id || "",
            quiet_start: data.quiet_start || "",
            quiet_end: data.quiet_end || "",
          }));
      });
  }, []);
  async function save() {
    const c = createClient();
    if (!c) {
      setMessage("Supabase is not configured.");
      return false;
    }
    const { data } = await c.auth.getUser();
    const { error } = await c.from("notification_preferences").upsert({
      ...value,
      user_id: data.user?.id,
      discord_user_id: value.discord_user_id || null,
      quiet_start: value.quiet_start || null,
      quiet_end: value.quiet_end || null,
    });
    setMessage(error ? error.message : "Notification preferences saved.");
    return !error;
  }
  async function testDiscord() {
    setTestingDiscord(true);
    setMessage("");
    try {
      if (!(await save())) return;
      const response = await fetch("/api/notifications/discord-test", {
        method: "POST",
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      setMessage(
        response.ok && result.ok
          ? "Test Discord notification sent. Check your DMs."
          : result.error || "Could not send the Discord test notification.",
      );
    } catch {
      setMessage("Could not send the Discord test notification. Try again.");
    } finally {
      setTestingDiscord(false);
    }
  }
  async function unlinkDiscord() {
    setMessage("");
    try {
      const response = await fetch("/api/integrations/discord", {
        method: "DELETE",
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(result.error || "Could not unlink Discord.");
        return;
      }
      setValue((v) => ({ ...v, discord_user_id: "", discord_enabled: false }));
      setDiscordLinked(false);
      setMessage("Discord account unlinked.");
    } catch {
      setMessage("Could not unlink Discord. Please try again.");
    }
  }
  async function subscribePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage("Browser push is not available in this browser.");
      return;
    }
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      setMessage(
        "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY first.",
      );
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setMessage("Browser notification permission was not granted.");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(
          atob(key.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      }));
    const result = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    setMessage(
      result.ok
        ? "Browser push is enabled."
        : "Could not save push subscription.",
    );
  }
  async function unsubscribePush() {
    try {
      if (!("serviceWorker" in navigator)) {
        setMessage("Browser push is not available in this browser.");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok)
          throw new Error("Could not remove the browser subscription.");
        await subscription.unsubscribe();
      } else {
        const c = createClient();
        const { data } = (await c?.auth.getUser()) || { data: { user: null } };
        if (c && data.user) {
          const { error } = await c.from("notification_preferences").upsert({
            user_id: data.user.id,
            push_enabled: false,
          });
          if (error) throw error;
        }
      }
      setValue((current) => ({ ...current, push_enabled: false }));
      setMessage("Browser push is disabled.");
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "Could not disable browser push.",
      );
    }
  }
  function toggle(key: "in_app_enabled" | "discord_enabled" | "email_enabled") {
    setValue((v) => ({ ...v, [key]: !v[key] }));
  }
  return (
    <section className="panel notification-preferences">
      <div className="panel-heading">
        <h2>Reminder preferences</h2>
        <button className="button subtle small-button" onClick={save}>
          Save preferences
        </button>
      </div>
      <div className="preference-grid">
        <label>
          <input
            type="checkbox"
            checked={value.in_app_enabled}
            onChange={() => toggle("in_app_enabled")}
          />{" "}
          In-app
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.discord_enabled}
            onChange={() => toggle("discord_enabled")}
          />{" "}
          Discord DM
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.email_enabled}
            onChange={() => toggle("email_enabled")}
          />{" "}
          Email
        </label>
      </div>
      <div className="preference-grid secondary">
        <span className="muted reminder-label">Remind me</span>
        {[4320, 1440, 120].map((minutes) => (
          <label key={minutes}>
            <input
              type="checkbox"
              checked={value.reminder_minutes.includes(minutes)}
              onChange={() =>
                setValue((v) => ({
                  ...v,
                  reminder_minutes: v.reminder_minutes.includes(minutes)
                    ? v.reminder_minutes.filter((item) => item !== minutes)
                    : [...v.reminder_minutes, minutes].sort((a, b) => b - a),
                }))
              }
            />
            {minutes === 4320
              ? "3 days before"
              : minutes === 1440
                ? "1 day before"
                : "2 hours before"}
          </label>
        ))}
        <label>
          Quiet from{" "}
          <input
            type="time"
            value={value.quiet_start}
            onChange={(e) =>
              setValue((v) => ({ ...v, quiet_start: e.target.value }))
            }
          />
        </label>
        <label>
          until{" "}
          <input
            type="time"
            value={value.quiet_end}
            onChange={(e) =>
              setValue((v) => ({ ...v, quiet_end: e.target.value }))
            }
          />
        </label>
      </div>
      <div className="preference-footer">
        <div className="discord-link-status">
          <span className="muted">
            {discordLinked
              ? "Discord account linked"
              : "No Discord account linked"}
          </span>
          <a
            className="button subtle small-button"
            href="/api/integrations/discord/connect"
          >
            {discordLinked ? "Reconnect Discord" : "Link Discord account"}
          </a>
          {discordLinked && (
            <button
              className="button subtle small-button"
              onClick={unlinkDiscord}
            >
              Unlink
            </button>
          )}
        </div>
        <button className="button subtle small-button" onClick={subscribePush}>
          Enable browser push
        </button>
        <button
          className="button subtle small-button"
          onClick={unsubscribePush}
        >
          Disable browser push
        </button>
        <button
          className="button subtle small-button"
          onClick={testDiscord}
          disabled={testingDiscord}
        >
          {testingDiscord ? "Sending test…" : "Test Discord notification"}
        </button>
        <span className="muted">
          Email delivery requires a configured provider and may be quota
          limited.
        </span>
      </div>
      {message && <p className="preference-message">{message}</p>}
    </section>
  );
}
export function SettingsView({
  user,
  integrations,
  onTimezoneChange,
  onWeekStartsOnChange,
  onDisplayNameChange,
  onSignOut,
  onRefresh,
}: {
  user: { id: string; email?: string } | null;
  integrations: IntegrationState[];
  onTimezoneChange: (timezone: string) => void;
  onWeekStartsOnChange: (day: 0 | 1 | 6) => void;
  onDisplayNameChange: (name: string) => void;
  onSignOut: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [theme, setTheme] = useState("dark");
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [displayName, setDisplayName] = useState(
    user?.email?.split("@")[0] || "",
  );
  const [workdayStart, setWorkdayStart] = useState("09:00");
  const [workdayEnd, setWorkdayEnd] = useState("17:00");
  const [weekStartsOn, setWeekStartsOn] = useState(1);
  const [saved, setSaved] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [activeSettingsSection, setActiveSettingsSection] = useState("General");
  const [schoologyPairing, setSchoologyPairing] = useState<{
    pairingCode: string;
    expiresAt: string;
  } | null>(null);
  const [schoologyMessage, setSchoologyMessage] = useState("");
  const [schoologyBusy, setSchoologyBusy] = useState(false);
  const settingsSections = [
    "General",
    "Calendar",
    "Appearance",
    "Notifications",
    "Integrations",
    "Schoology",
    "Discord",
    "AI Planner",
    "Account",
  ];
  const schoologyIntegration = integrations.find(
    (item) => item.provider === "schoology",
  );
  const discordIntegration = integrations.find(
    (item) => item.provider === "discord",
  );
  async function refreshSchoologyStatus() {
    try {
      const response = await fetch("/api/schoology/extension", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not refresh extension status");
      const result = (await response.json()) as { connected?: boolean };
      setSchoologyMessage(
        result.connected
          ? "The Daymark extension is connected."
          : "No Daymark extension is currently connected.",
      );
      await onRefresh();
    } catch {
      setSchoologyMessage(
        "Could not refresh the extension status. Try again in a moment.",
      );
    }
  }
  async function createSchoologyPairingCode() {
    setSchoologyBusy(true);
    setSchoologyMessage("");
    try {
      const response = await fetch("/api/schoology/extension/pairing-code", {
        method: "POST",
      });
      const result = (await response.json()) as {
        pairingCode?: string;
        expiresAt?: string;
        error?: string;
      };
      if (!response.ok || !result.pairingCode || !result.expiresAt)
        throw new Error(result.error || "Could not create a pairing code");
      setSchoologyPairing({
        pairingCode: result.pairingCode,
        expiresAt: result.expiresAt,
      });
      try {
        await navigator.clipboard.writeText(result.pairingCode);
        setSchoologyMessage(
          "One-time code copied. Paste it into the Daymark extension; it expires in 10 minutes.",
        );
      } catch {
        setSchoologyMessage(
          "Enter the one-time code in the Daymark extension. It expires in 10 minutes.",
        );
      }
    } catch (failure) {
      setSchoologyMessage(
        failure instanceof Error
          ? failure.message
          : "Could not create a pairing code",
      );
    } finally {
      setSchoologyBusy(false);
    }
  }
  async function disconnectSchoologyExtension() {
    setSchoologyBusy(true);
    try {
      const response = await fetch("/api/schoology/extension", {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error("Could not disconnect the Daymark extension");
      setSchoologyPairing(null);
      setSchoologyMessage(
        "Extension disconnected. Existing imported coursework remains in Daymark.",
      );
      await onRefresh();
    } catch (failure) {
      setSchoologyMessage(
        failure instanceof Error
          ? failure.message
          : "Could not disconnect the extension",
      );
    } finally {
      setSchoologyBusy(false);
    }
  }
  useEffect(() => {
    if (!user?.id) return;
    const c = createClient();
    c?.from("user_preferences")
      .select("theme,timezone,workday_start,workday_end,week_starts_on")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTheme(data.theme);
          setTimezone(data.timezone);
          setWorkdayStart(data.workday_start.slice(0, 5));
          setWorkdayEnd(data.workday_end.slice(0, 5));
          setWeekStartsOn(data.week_starts_on);
        }
      });
    c?.from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
      });
    fetch("/api/ai/plan")
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Could not read AI provider status")),
      )
      .then((result: { configured: boolean }) =>
        setAiConfigured(result.configured),
      )
      .catch(() => setAiConfigured(null));
  }, [user?.id]);
  useEffect(() => {
    const applyTheme = (event: globalThis.Event) => {
      const nextTheme = (event as CustomEvent<string>).detail;
      if (nextTheme) setTheme(nextTheme);
    };
    window.addEventListener("daymark-theme", applyTheme);
    return () => window.removeEventListener("daymark-theme", applyTheme);
  }, []);
  async function save() {
    if (workdayEnd <= workdayStart) {
      alert("Workday end must be after the start time.");
      return;
    }
    const c = createClient();
    const {
      data: { user: u },
    } = await c!.auth.getUser();
    const { error } = await c!.from("user_preferences").upsert({
      user_id: u?.id,
      theme,
      timezone,
      workday_start: workdayStart,
      workday_end: workdayEnd,
      week_starts_on: weekStartsOn,
    });
    const profileResult = await c!
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", u?.id);
    if (error || profileResult.error)
      alert(error?.message || profileResult.error?.message);
    else {
      setSaved(true);
      onTimezoneChange(timezone);
      onWeekStartsOnChange(weekStartsOn as 0 | 1 | 6);
      onDisplayNameChange(displayName);
      window.dispatchEvent(new CustomEvent("daymark-theme", { detail: theme }));
      localStorage.setItem("theme", theme);
    }
  }
  async function deleteAccount() {
    if (
      !confirm(
        "Permanently delete your Daymark account and all of its data? This cannot be undone.",
      )
    )
      return;
    const response = await fetch("/api/account", { method: "DELETE" });
    if (response.ok) onSignOut();
    else {
      const result = await response.json().catch(() => ({}));
      alert(result.error || "Account deletion failed.");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>Settings</h1>
          <p>Preferences for your Daymark workspace.</p>
        </div>
        <button className="button primary" onClick={save}>
          {saved ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : (
            "Save changes"
          )}
        </button>
      </div>
      <div className="settings-layout">
        <div className="settings-nav">
          {settingsSections.map((name) => (
            <button
              type="button"
              className={name === activeSettingsSection ? "selected" : ""}
              aria-current={
                name === activeSettingsSection ? "location" : undefined
              }
              key={name}
              onClick={() => {
                setActiveSettingsSection(name);
                document
                  .getElementById(`settings-${name.toLowerCase()}`)
                  ?.scrollIntoView({
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "auto"
                      : "smooth",
                    block: "start",
                  });
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="settings-content">
          <section className="settings-section" id="settings-general">
            <div className="settings-section-head">
              <h2>General</h2>
              <p>Set the basics for how Daymark works for you.</p>
            </div>
            <label>
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label>
              Timezone
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {[
                  timezone,
                  "UTC",
                  "America/Los_Angeles",
                  "America/New_York",
                  "Europe/London",
                ]
                  .filter((x, i, a) => a.indexOf(x) === i)
                  .map((x) => (
                    <option key={x}>{x}</option>
                  ))}
              </select>
            </label>
          </section>
          <section className="settings-section" id="settings-calendar">
            <div className="settings-section-head">
              <h2>Calendar</h2>
              <p>Set the regular working window for scheduling proposals.</p>
            </div>
            <div className="form-row settings-hours">
              <label>
                Workday starts
                <input
                  type="time"
                  value={workdayStart}
                  onChange={(e) => setWorkdayStart(e.target.value)}
                />
              </label>
              <label>
                Workday ends
                <input
                  type="time"
                  value={workdayEnd}
                  onChange={(e) => setWorkdayEnd(e.target.value)}
                />
              </label>
            </div>
            <label>
              First day of week
              <select
                value={weekStartsOn}
                onChange={(e) => setWeekStartsOn(Number(e.target.value))}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={6}>Saturday</option>
              </select>
            </label>
          </section>
          <section className="settings-section" id="settings-appearance">
            <div className="settings-section-head">
              <h2>Appearance</h2>
              <p>Choose a comfortable working environment.</p>
            </div>
            <div className="theme-options">
              <button
                className={theme === "dark" ? "chosen" : ""}
                onClick={() => setTheme("dark")}
              >
                <Moon size={16} /> Dark
              </button>
              <button
                className={theme === "light" ? "chosen" : ""}
                onClick={() => setTheme("light")}
              >
                <Sun size={16} /> Light
              </button>
              <button
                className={theme === "system" ? "chosen" : ""}
                onClick={() => setTheme("system")}
              >
                <Settings2 size={16} /> System
              </button>
            </div>
          </section>
          <section className="settings-section" id="settings-integrations">
            <div className="settings-section-head">
              <h2>Integrations</h2>
              <p>
                Connect optional services. Your core workspace works without
                them.
              </p>
            </div>
            <div className="integration-row" id="settings-schoology">
              <span className="integration-icon">
                <GraduationCap size={17} />
              </span>
              <span>
                <b>Schoology</b>
                <small>
                  Scan courses and assignments from a Schoology tab where you
                  are already signed in.
                </small>
              </span>
              <span
                className={`state ${schoologyIntegration?.last_error || schoologyIntegration?.status === "error" ? "error" : schoologyIntegration?.status === "connected" ? "complete" : "neutral"}`}
              >
                {schoologyIntegration?.last_error ||
                  (schoologyIntegration?.status
                    ? label(schoologyIntegration.status)
                    : "Not connected")}
              </span>
              {schoologyIntegration?.status === "connected" ? (
                <button
                  type="button"
                  className="button subtle small-button"
                  disabled={schoologyBusy}
                  onClick={() => void disconnectSchoologyExtension()}
                >
                  Disconnect extension
                </button>
              ) : (
                <button
                  type="button"
                  className="button primary small-button"
                  disabled={schoologyBusy}
                  onClick={() => void createSchoologyPairingCode()}
                >
                  {schoologyBusy ? "Working…" : "Connect extension"}
                </button>
              )}
            </div>
            <div className="schoology-extension-setup">
              <h3>Finish connecting your extension</h3>
              <ol>
                <li>
                  Open the extension and choose Continue with Daymark. Sign in
                  here if asked.
                </li>
                <li>
                  Create a one-time code below, then paste it into the
                  extension.
                </li>
                <li>Return to Schoology and scan your coursework.</li>
              </ol>
              {schoologyPairing && (
                <div className="pairing-code">
                  <span>One-time code · expires in 10 minutes</span>
                  <code>{schoologyPairing.pairingCode}</code>
                  <small>
                    Expires{" "}
                    {format(
                      new Date(schoologyPairing.expiresAt),
                      "MMM d, h:mm a",
                    )}
                  </small>
                  <button
                    type="button"
                    className="text-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          schoologyPairing.pairingCode,
                        );
                        setSchoologyMessage(
                          "Pairing code copied. It expires shortly.",
                        );
                      } catch {
                        setSchoologyMessage(
                          "Select and copy the pairing code above.",
                        );
                      }
                    }}
                  >
                    Copy code
                  </button>
                </div>
              )}
              {schoologyMessage && (
                <p className="preference-message" role="status">
                  {schoologyMessage}
                </p>
              )}
              {schoologyIntegration?.status === "connected" && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void refreshSchoologyStatus()}
                >
                  Refresh connection status
                </button>
              )}
              <small>
                Daymark does not ask for your Schoology password or store
                Schoology cookies. Imported courses and assignments stay
                available if you disconnect.
              </small>
            </div>
            <div className="integration-row" id="settings-ai-planner">
              <span className="integration-icon">
                <Sparkles size={17} />
              </span>
              <span>
                <b>AI provider</b>
                <small>
                  Optional OpenAI-compatible endpoint; secrets stay on the
                  server.
                </small>
              </span>
              <span
                className={`state ${aiConfigured ? "complete" : "neutral"}`}
              >
                {aiConfigured === null
                  ? "Status unavailable"
                  : aiConfigured
                    ? "Configured"
                    : "Not configured"}
              </span>
              <span className="muted">
                Set AI_BASE_URL and AI_MODEL on the server.
              </span>
            </div>
            <div className="integration-row" id="settings-discord">
              <span className="integration-icon">
                <DiscordIcon size={17} />
              </span>
              <span>
                <b>Discord</b>
                <small>
                  Link your Discord account for notifications and DMs.
                </small>
              </span>
              <span
                className={`state ${discordIntegration?.status === "connected" ? "complete" : "neutral"}`}
              >
                {discordIntegration?.status
                  ? label(discordIntegration.status)
                  : "Not linked"}
              </span>
              <a
                className="button subtle small-button"
                href="/api/integrations/discord/connect"
              >
                {discordIntegration?.status === "connected"
                  ? "Reconnect"
                  : "Connect"}
              </a>
            </div>
            <div className="integration-row">
              <span className="integration-icon">
                <Bell size={17} />
              </span>
              <span>
                <b>Browser notifications</b>
                <small>Web Push support and permission</small>
              </span>
              <button
                className="button subtle small-button"
                disabled={
                  typeof window !== "undefined" && !("Notification" in window)
                }
                onClick={() => {
                  if (!("Notification" in window)) return;
                  void Notification.requestPermission();
                }}
              >
                Enable
              </button>
            </div>
          </section>
          <section className="settings-section" id="settings-notifications">
            <div className="settings-section-head">
              <h2>Notifications</h2>
              <p>Choose delivery channels and reminder timing.</p>
            </div>
            <NotificationPreferences />
          </section>
          <section className="settings-section" id="settings-account">
            <div className="settings-section-head">
              <h2>Account</h2>
              <p>Signed in as {user?.email}</p>
            </div>
            <button className="button danger-outline" onClick={onSignOut}>
              <LogOut size={15} /> Sign out
            </button>
            <button className="button danger-outline" onClick={deleteAccount}>
              Delete account and data
            </button>
          </section>
        </div>
      </div>
    </>
  );
}

export function DiscordIcon({
  size = 16,
  style,
}: {
  size?: number;
  style?: CSSProperties;
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
