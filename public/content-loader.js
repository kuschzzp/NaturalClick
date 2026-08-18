(() => {
  const key = "__naturalclickContentModulePromise";
  const scope = globalThis;
  scope[key] ??= import(chrome.runtime.getURL("content.js"));
  scope[key].catch((error) => {
    console.error("[NaturalClick] Failed to load content module", error);
  });
})();
