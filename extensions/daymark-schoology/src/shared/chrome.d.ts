interface ChromeStorageArea {
  get(keys?: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface ChromeTab {
  id?: number;
  url?: string;
  title?: string;
}
interface ChromeStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}
declare const chrome: {
  runtime: {
    onInstalled: { addListener(callback: () => void): void };
    onStartup: { addListener(callback: () => void): void };
  };
  storage: {
    local: ChromeStorageArea;
    onChanged: {
      addListener(
        callback: (
          changes: Record<string, ChromeStorageChange>,
          areaName: string,
        ) => void,
      ): void;
    };
  };
  alarms: {
    create(name: string, alarmInfo: { delayInMinutes: number }): Promise<void>;
    clear(name: string): Promise<boolean>;
    onAlarm: { addListener(callback: (alarm: { name: string }) => void): void };
  };
  tabs: {
    query(query: {
      active: boolean;
      lastFocusedWindow: boolean;
    }): Promise<ChromeTab[]>;
    create(options: { url: string }): Promise<ChromeTab>;
  };
  scripting: {
    executeScript(options: {
      target: { tabId: number };
      func: () => string;
    }): Promise<Array<{ result?: string }>>;
  };
  permissions: {
    contains(options: { origins: string[] }): Promise<boolean>;
    request(options: { origins: string[] }): Promise<boolean>;
  };
};
