if (typeof importScripts === 'function') {
  importScripts(
      '/src/js/constants.js',
      '/src/js/utils.js',
      '/src/js/open.js',
  );
}

const connectedTrackerPorts = new Set();
const clearRules = () => clearAllSessionRules().catch(onError);

httpTracker.browser.runtime.onConnect.addListener((port) => {
  if (port.name === 'http-tracker-session') {
    connectedTrackerPorts.add(port);
    port.onDisconnect.addListener(() => {
      connectedTrackerPorts.delete(port);
      if (connectedTrackerPorts.size === 0) {
        clearRules();
      }
    });
  }
});

const handleInstalled = (details) => {
  clearRules();
  if (details?.reason === 'update') {
    const currentVersion = httpTracker.browser?.runtime?.getManifest?.()?.version;
    if (details.previousVersion && details.previousVersion !== currentVersion) {
      if (typeof openWhatsNewPage === 'function') {
        openWhatsNewPage(false);
      }
    }
  }
};

httpTracker.browser.runtime.onInstalled.addListener(handleInstalled);
httpTracker.browser.runtime.onStartup.addListener(clearRules);

