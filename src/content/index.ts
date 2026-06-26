chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "NATURALCLICK_PING") {
    sendResponse({ ok: true, source: "content" });
    return true;
  }
  return false;
});
