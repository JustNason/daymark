chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("daymarkSettings").then((result) => {
    if (!result.daymarkSettings)
      chrome.storage.local.set({ daymarkSettings: { daymarkOrigin: "" } });
  });
});
