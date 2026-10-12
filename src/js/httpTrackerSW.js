importScripts(
    '/src/js/httpTrackerConstants.js',
    '/src/js/httpTrackerUtils.js',
    '/src/js/httpTrackerOpen.js',
);

const connectedTrackerPorts = new Set();

httpTracker.browser.runtime.onConnect.addListener((port) => {
  if (port.name === 'http-tracker-session') {
    connectedTrackerPorts.add(port);
    port.onDisconnect.addListener(() => {
      connectedTrackerPorts.delete(port);
      if (connectedTrackerPorts.size === 0) {
        clearAllSessionRules();
      }
    });
  }
});

httpTracker.browser.runtime.onInstalled.addListener(() => {
  clearAllSessionRules();
});

httpTracker.browser.runtime.onStartup.addListener(() => {
  clearAllSessionRules();
});

