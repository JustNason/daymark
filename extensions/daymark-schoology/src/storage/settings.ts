import { STORAGE_KEYS, type ExtensionSettings } from "../shared/types.js";

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return (
    (result[STORAGE_KEYS.settings] as ExtensionSettings | undefined) ?? {
      daymarkOrigin: "",
    }
  );
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}
