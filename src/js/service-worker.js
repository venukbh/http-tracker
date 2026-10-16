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

httpTracker.browser.runtime.onInstalled.addListener(clearRules);
httpTracker.browser.runtime.onStartup.addListener(clearRules);

