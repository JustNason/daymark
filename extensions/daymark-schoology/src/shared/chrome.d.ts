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
declare const chrome: {
  runtime: { onInstalled: { addListener(callback: () => void): void } };
  storage: { local: ChromeStorageArea };
  tabs: {
    query(query: {
      active: boolean;
      lastFocusedWindow: boolean;
    }): Promise<ChromeTab[]>;
    create(options: { url: string }): void;
  };
  scripting: {
    executeScript(options: {
      target: { tabId: number };
      func: () => string;
    }): Promise<Array<{ result?: string }>>;
  };
  permissions: { request(options: { origins: string[] }): Promise<boolean> };
};
