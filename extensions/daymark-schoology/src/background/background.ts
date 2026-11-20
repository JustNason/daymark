import { STORAGE_KEYS, type ExtensionSettings } from "../shared/types.js";

const FLOW_ALARM = "daymark-schoology-pairing";

async function scheduleFlowCheck() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = stored[STORAGE_KEYS.settings] as
    | ExtensionSettings
    | undefined;
  if (settings?.pendingFlow)
    await chrome.alarms.create(FLOW_ALARM, { delayInMinutes: 0.5 });
  else await chrome.alarms.clear(FLOW_ALARM);
}

async function checkFlow() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  const settings = stored[STORAGE_KEYS.settings] as
    | ExtensionSettings
    | undefined;
  const flow = settings?.pendingFlow;
  if (!settings || !flow) {
    await chrome.alarms.clear(FLOW_ALARM);
    return;
  }
  if (new Date(flow.expiresAt).valueOf() <= Date.now()) {
    await saveExpiredFlow(settings);
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
      await saveExpiredFlow(settings);
      return;
    }
    if (response.ok) {
      const result: unknown = await response.json();
      if (
        result &&
        typeof result === "object" &&
        "status" in result &&
        result.status === "approved"
      ) {
        const rest = { ...settings };
        delete rest.pendingFlow;
        await chrome.storage.local.set({
          [STORAGE_KEYS.settings]: {
            ...rest,
            token: flow.extensionToken,
            connectedAt: new Date().toISOString(),
            pendingFlow: null,
            pairingMessage:
              "Connected to Daymark. You can scan and sync coursework.",
          },
        });
        await chrome.alarms.clear(FLOW_ALARM);
        return;
      }
    }
  } catch {
    // Keep polling through short network outages until this short-lived flow expires.
  }
  await chrome.alarms.create(FLOW_ALARM, { delayInMinutes: 0.5 });
}

async function saveExpiredFlow(settings: ExtensionSettings) {
  const rest = { ...settings };
  delete rest.pendingFlow;
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: {
      ...rest,
      pendingFlow: null,
      pairingMessage: "The connection request expired. Start again to connect.",
    },
  });
  await chrome.alarms.clear(FLOW_ALARM);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(STORAGE_KEYS.settings).then((result) => {
    if (!result[STORAGE_KEYS.settings])
      return chrome.storage.local.set({
        [STORAGE_KEYS.settings]: { daymarkOrigin: "" },
      });
    return undefined;
  });
  void scheduleFlowCheck();
});

chrome.runtime.onStartup.addListener(() => void scheduleFlowCheck());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLOW_ALARM) void checkFlow();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEYS.settings])
    void scheduleFlowCheck();
});
