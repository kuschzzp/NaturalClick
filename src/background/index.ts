chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "NATURALCLICK_PING") {
    sendResponse({ ok: true, source: "background" });
    return true;
  }
  return false;
});
