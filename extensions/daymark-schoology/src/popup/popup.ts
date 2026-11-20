import {
  extractSchoologyDocument,
  isSchoologyPage,
} from "../extraction/extract.js";
import { getSettings, saveSettings } from "../storage/settings.js";
import {
  STORAGE_KEYS,
  type PendingExtensionFlow,
  type SchoologySnapshot,
  type SyncResult,
} from "../shared/types.js";

const DEFAULT_DAYMARK_ORIGIN = "https://daymark-virid-two.vercel.app";
const FLOW_ALARM = "daymark-schoology-pairing";

const $ = <T extends HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const status = $("#status");
const pageHint = $("#page-hint");
const courseList = $("#course-list");
const assignmentList = $("#assignment-list");
const scanButton = $("#scan") as HTMLButtonElement;
const syncButton = $("#sync") as HTMLButtonElement;
const connectButton = $("#connect") as HTMLButtonElement;
const disconnectButton = $("#disconnect") as HTMLButtonElement;
const pairingFields = $("#pairing-fields");
const originInput = $("#daymark-origin") as HTMLInputElement;
const schoologyHostInput = $("#schoology-host") as HTMLInputElement;
let currentSnapshot: SchoologySnapshot | undefined;
let isConnected = false;

function setStatus(
  message: string,
  kind: "quiet" | "success" | "error" = "quiet",
) {
  status.textContent = message;
  status.className = `status status--${kind}`;
}

function setConnectionStatus(
  message: string,
  kind: "quiet" | "success" | "error" = "quiet",
) {
  const connectionStatus = $("#connection-status");
  connectionStatus.textContent = message;
  connectionStatus.className = `connect-status${kind === "quiet" ? "" : ` connect-status--${kind}`}`;
}

function escapeText(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function formatDate(value?: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Due date unavailable"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function render(snapshot?: SchoologySnapshot) {
  currentSnapshot = snapshot;
  const courses = snapshot?.courses ?? [];
  const assignments = snapshot?.assignments ?? [];
  courseList.innerHTML = courses.length
    ? courses
        .map(
          (course) =>
            `<li><span>${escapeText(course.name)}</span><small>${course.assignments.length} assignment${course.assignments.length === 1 ? "" : "s"}</small></li>`,
        )
        .join("")
    : '<li class="empty-row">Scan a Schoology course page to see your courses.</li>';
  const upcoming = assignments
    .slice()
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"))
    .slice(0, 6);
  assignmentList.innerHTML = upcoming.length
    ? upcoming
        .map((item) => {
          const course =
            courses.find(
              (candidate) => candidate.externalId === item.courseExternalId,
            )?.name ?? "Course unavailable";
          const completion =
            item.completed === true
              ? '<span class="assignment-state">Submitted</span>'
              : item.completed === false
                ? '<span class="assignment-state">Not submitted</span>'
                : "";
          const overdue =
            item.dueAt &&
            new Date(item.dueAt).valueOf() < Date.now() &&
            item.completed !== true;
          const dueLabel = overdue ? "Overdue" : "Due";
          const title = item.url
            ? `<a href="${escapeText(item.url)}" target="_blank" rel="noreferrer">${escapeText(item.title)}</a>`
            : escapeText(item.title);
          return `<li><div class="assignment-copy">${title}<small>${escapeText(course)} · ${dueLabel} ${escapeText(formatDate(item.dueAt))}</small></div>${completion}</li>`;
        })
        .join("")
    : '<li class="empty-row">No assignments detected. Nothing will be imported until Schoology data is found.</li>';
  if (snapshot?.warnings.length) pageHint.textContent = snapshot.warnings[0];
  else if (snapshot)
    pageHint.textContent = `Scanned ${courses.length} course${courses.length === 1 ? "" : "s"} and ${assignments.length} assignment${assignments.length === 1 ? "" : "s"}.`;
  syncButton.disabled = !isConnected || !snapshot || !assignments.length;
}

async function activeTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tabs[0];
}

async function scan() {
  scanButton.disabled = true;
  setStatus("Reading the current Schoology page…");
  try {
    const tab = await activeTab();
    const settings = await getSettings();
    if (
      !tab?.id ||
      !tab.url ||
      !isSchoologyPage(tab.url, settings.schoologyHost)
    ) {
      render(undefined);
      pageHint.textContent =
        "Open a signed-in Schoology home, courses, or course page to scan.";
      setStatus("This tab is not a supported Schoology page.");
      return;
    }
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.outerHTML,
    });
    const html = result[0]?.result;
    if (!html)
      throw new Error(
        "Schoology did not return a readable page. Check that you are signed in and try again.",
      );
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const snapshot = extractSchoologyDocument(parsed, tab.url);
    await chrome.storage.local.set({ [STORAGE_KEYS.snapshot]: snapshot });
    render(snapshot);
    setStatus("Schoology page scanned.", "success");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not scan this Schoology page.";
    setStatus(message, "error");
  } finally {
    scanButton.disabled = false;
  }
}

function validatedOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw new Error(
      "Use an HTTPS Daymark address. HTTP is allowed only for localhost.",
    );
  return url.origin;
}

async function ensurePermission(origin: string): Promise<void> {
  const originPattern = `${origin}/*`;
  if (await chrome.permissions.contains({ origins: [originPattern] })) return;
  const granted = await chrome.permissions.request({
    origins: [originPattern],
  });
  if (!granted)
    throw new Error(
      "Daymark host access was not granted. Allow access to connect and sync.",
    );
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function startPairingFlow() {
  connectButton.disabled = true;
  connectButton.textContent = "Starting…";
  setConnectionStatus("Preparing a secure Daymark connection…");
  try {
    const settings = await getSettings();
    const origin = validatedOrigin(
      originInput.value.trim() ||
        settings.daymarkOrigin ||
        DEFAULT_DAYMARK_ORIGIN,
    );
    const schoologyHost = validatedSchoologyHost(schoologyHostInput.value);
    await ensurePermission(origin);
    const flowId = randomSecret();
    const pollToken = randomSecret();
    const extensionToken = randomSecret();
    const response = await fetch(
      `${origin}/api/schoology/extension/flow/start`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flowId,
          pollToken,
          extensionTokenHash: await sha256Hex(extensionToken),
        }),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const serverMessage =
        body &&
        typeof body === "object" &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error.slice(0, 240)
          : null;
      throw new Error(
        serverMessage ||
          `Daymark could not start connection (HTTP ${response.status}).`,
      );
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("expiresAt" in body) ||
      typeof body.expiresAt !== "string"
    )
      throw new Error("Daymark returned an invalid connection response.");
    const pendingFlow: PendingExtensionFlow = {
      flowId,
      pollToken,
      extensionToken,
      expiresAt: body.expiresAt,
    };
    await saveSettings({
      ...settings,
      daymarkOrigin: origin,
      schoologyHost,
      pendingFlow,
      pairingMessage:
        "Sign in to Daymark and authorize the extension in the tab that just opened.",
    });
    await chrome.alarms.create(FLOW_ALARM, { delayInMinutes: 0.5 });
    const tab = await chrome.tabs.create({
      url: `${origin}/extension/schoology?flow=${encodeURIComponent(flowId)}`,
    });
    if (!tab.id)
      throw new Error(
        "Chrome could not open the Daymark sign-in tab. Try again.",
      );
    connectButton.textContent = "Waiting for approval…";
    setConnectionStatus(
      "Daymark opened in a new tab. Sign in and authorize; the extension will connect automatically.",
    );
    await refreshSettings();
  } catch (error) {
    const message =
      error instanceof TypeError
        ? "Could not reach Daymark. Check the address and allow the requested site access in Chrome."
        : error instanceof Error
          ? error.message
          : "Pairing failed. Check the Daymark address and pairing code.";
    setStatus(message, "error");
    setConnectionStatus(message, "error");
    connectButton.disabled = false;
    connectButton.textContent = "Connect to Daymark";
    return;
  } finally {
    if (connectButton.textContent !== "Waiting for approval…") {
      connectButton.disabled = false;
      connectButton.textContent = "Connect to Daymark";
    }
  }
}

async function pollPendingFlow(flow: PendingExtensionFlow): Promise<void> {
  const settings = await getSettings();
  if (settings.pendingFlow?.flowId !== flow.flowId) return;
  if (new Date(flow.expiresAt).valueOf() <= Date.now()) {
    await chrome.alarms.clear(FLOW_ALARM);
    await saveSettings({
      ...settings,
      pendingFlow: null,
      pairingMessage: "The connection request expired. Start again to connect.",
    });
    await refreshSettings();
    return;
  }
  try {
    const response = await fetch(
      `${settings.daymarkOrigin}/api/schoology/extension/flow/poll?flow=${encodeURIComponent(flow.flowId)}`,
      {
        headers: { authorization: `Bearer ${flow.pollToken}` },
        cache: "no-store",
      },
    );
    if (response.status === 410) {
      await chrome.alarms.clear(FLOW_ALARM);
      await saveSettings({
        ...settings,
        pendingFlow: null,
        pairingMessage:
          "The connection request expired. Start again to connect.",
      });
      await refreshSettings();
      return;
    }
    if (!response.ok) return;
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== "object" ||
      !("status" in result) ||
      result.status !== "approved"
    )
      return;
    await chrome.alarms.clear(FLOW_ALARM);
    await saveSettings({
      ...settings,
      token: flow.extensionToken,
      connectedAt: new Date().toISOString(),
      pendingFlow: null,
      pairingMessage: "Connected to Daymark. You can scan and sync coursework.",
    });
    await refreshSettings();
    setConnectionStatus("Connected to Daymark.", "success");
    setStatus("Connected to Daymark.", "success");
  } catch {
    // A transient network issue leaves the short-lived flow available for another poll.
  }
}

connectButton.addEventListener("click", () => void startPairingFlow());

syncButton.addEventListener("click", async () => {
  syncButton.disabled = true;
  try {
    const settings = await getSettings();
    if (!settings.token || !currentSnapshot)
      throw new Error(
        "Connect the extension and scan Schoology before syncing.",
      );
    const response = await fetch(
      `${settings.daymarkOrigin}/api/schoology/extension/sync`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${settings.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(currentSnapshot),
      },
    );
    const result: unknown = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await saveSettings({ daymarkOrigin: settings.daymarkOrigin });
        await refreshSettings();
      }
      const serverMessage =
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error.slice(0, 240)
          : null;
      throw new Error(
        response.status === 401 || response.status === 403
          ? "Daymark connection expired. Pair the extension again in Settings."
          : serverMessage ||
            "Daymark could not sync this scan. Try again in a moment.",
      );
    }
    if (!isSyncResult(result))
      throw new Error("Daymark returned an invalid sync summary.");
    await chrome.storage.local.set({ [STORAGE_KEYS.sync]: result });
    renderSync(result);
    await refreshSettings();
    setStatus(
      `Synced ${result.detectedAssignments} assignment${result.detectedAssignments === 1 ? "" : "s"}.`,
      result.errors.length ? "error" : "success",
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Sync failed.", "error");
  } finally {
    syncButton.disabled = false;
  }
});

function isSyncResult(value: unknown): value is SyncResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    [
      "detectedCourses",
      "detectedAssignments",
      "imported",
      "updated",
      "unchanged",
    ].every((key) => Number.isInteger(result[key])) &&
    Array.isArray(result.errors)
  );
}

function renderSync(result: SyncResult) {
  pageHint.textContent = `${result.imported} new · ${result.updated} updated · ${result.unchanged} unchanged${result.errors.length ? ` · ${result.errors.length} issue${result.errors.length === 1 ? "" : "s"}` : ""}`;
}

function renderLastSync(value?: string | null) {
  const target = document.querySelector<HTMLElement>("#last-sync");
  if (!target) return;
  const date = value ? new Date(value) : null;
  target.textContent = `Last sync: ${date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date) : "Never"}`;
}

async function refreshSettings() {
  const settings = await getSettings();
  originInput.value = settings.daymarkOrigin || DEFAULT_DAYMARK_ORIGIN;
  schoologyHostInput.value = settings.schoologyHost ?? "";
  let connected = Boolean(settings.token);
  const waitingForApproval = Boolean(settings.pendingFlow);
  let connectionStatusAvailable = true;
  if (connected && settings.daymarkOrigin) {
    try {
      const response = await fetch(
        `${settings.daymarkOrigin}/api/schoology/extension/status`,
        { headers: { authorization: `Bearer ${settings.token}` } },
      );
      if (response.status === 401 || response.status === 403) {
        await saveSettings({
          daymarkOrigin: settings.daymarkOrigin,
          schoologyHost: settings.schoologyHost,
        });
        connected = false;
      } else if (response.ok) {
        const result: unknown = await response.json();
        if (result && typeof result === "object" && "lastSyncedAt" in result)
          renderLastSync(
            typeof result.lastSyncedAt === "string"
              ? result.lastSyncedAt
              : null,
          );
        connected = Boolean(
          result &&
            typeof result === "object" &&
            "connected" in result &&
            result.connected === true,
        );
        if (!connected)
          await saveSettings({
            daymarkOrigin: settings.daymarkOrigin,
            schoologyHost: settings.schoologyHost,
          });
      } else connectionStatusAvailable = false;
    } catch {
      // Keep the locally paired state when Daymark is temporarily unreachable.
      connectionStatusAvailable = false;
    }
  }
  isConnected = connected;
  document.querySelector("#connection-label")!.textContent = connected
    ? connectionStatusAvailable
      ? "Daymark connected"
      : "Daymark status unavailable"
    : waitingForApproval
      ? "Waiting for Daymark approval"
      : "Daymark not connected";
  document.querySelector("#connection-dot")!.className =
    `dot ${connected && connectionStatusAvailable ? "dot--on" : ""}`;
  document.querySelector("#connection-badge")!.textContent = connected
    ? "Connected"
    : waitingForApproval
      ? "Waiting"
      : "Not connected";
  document.querySelector<HTMLElement>("#connection-intro")!.textContent =
    connected
      ? "Your Daymark workspace is linked. Scan Schoology and sync coursework when you are ready."
      : waitingForApproval
        ? "Finish signing in and approve the request in the Daymark tab. This extension will connect automatically."
        : "Sign in to Daymark in your browser and approve the request there. The extension connects automatically afterward.";
  document.querySelector<HTMLElement>("#advanced-settings")!.hidden = connected;
  disconnectButton.hidden = !connected;
  connectButton.hidden = connected;
  pairingFields.hidden = connected;
  connectButton.disabled = waitingForApproval;
  connectButton.textContent = waitingForApproval
    ? "Waiting for approval…"
    : "Connect to Daymark";
  const connectionStatus =
    document.querySelector<HTMLElement>("#connection-status");
  if (!connected && settings.pairingMessage) {
    connectionStatus!.textContent = settings.pairingMessage;
    connectionStatus!.className = `connect-status${settings.pairingMessage.startsWith("Connected") ? " connect-status--success" : ""}`;
  }
  syncButton.disabled = !connected || !currentSnapshot?.assignments.length;
}

function validatedSchoologyHost(value: string): string | undefined {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  if (host && !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host))
    throw new Error(
      "Enter a valid Schoology host name, such as school.example.edu.",
    );
  return host || undefined;
}
disconnectButton.addEventListener("click", async () => {
  const settings = await getSettings();
  if (!settings.token) return;
  disconnectButton.disabled = true;
  try {
    const response = await fetch(
      `${settings.daymarkOrigin}/api/schoology/extension/disconnect`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${settings.token}` },
      },
    );
    if (!response.ok && response.status !== 401 && response.status !== 403)
      throw new Error("Daymark did not revoke the token.");
    await saveSettings({
      daymarkOrigin: settings.daymarkOrigin,
      schoologyHost: settings.schoologyHost,
    });
    await refreshSettings();
    setStatus("Daymark connection revoked.", "success");
  } catch {
    setStatus(
      "Could not reach Daymark. The local token was kept so you can retry.",
      "error",
    );
  } finally {
    disconnectButton.disabled = false;
  }
});
scanButton.addEventListener("click", scan);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEYS.settings])
    void refreshSettings();
});

void (async () => {
  await refreshSettings();
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.snapshot,
    STORAGE_KEYS.sync,
  ]);
  const snapshot = stored[STORAGE_KEYS.snapshot] as
    | SchoologySnapshot
    | undefined;
  if (snapshot) render(snapshot);
  const sync = stored[STORAGE_KEYS.sync] as SyncResult | undefined;
  if (sync) renderSync(sync);
  const tab = await activeTab();
  const settings = await getSettings();
  if (tab?.url && isSchoologyPage(tab.url, settings.schoologyHost))
    pageHint.textContent =
      "Schoology is open. Scan when you are ready to read the rendered page.";
  else
    pageHint.textContent =
      "Open a signed-in Schoology page to scan coursework.";
  const pendingFlow = settings.pendingFlow;
  if (pendingFlow) {
    void pollPendingFlow(pendingFlow);
    window.setInterval(() => void pollPendingFlow(pendingFlow), 4000);
  }
})();
