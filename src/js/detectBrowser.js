// this cannot be used in openHttpTracker.js as that js itself is self implemented and does not take external script files

// But when ever this file is changed, make sure the same copy is updated there and vice-versa
if (window.browser) {
  httpTracker = {
    webEventConsumer: window.browser,
    browserName: "firefox",
    isFirefoxBrowser: true
  };
} else {
  httpTracker = {
    webEventConsumer: window.chrome,
    browserName: "chrome"
  };
}

function onError(e) {
  console.error(e);
}

function getStoredDetails(details) {
  if (httpTracker.webEventConsumer.runtime.lastError) {
    onError(httpTracker.webEventConsumer.runtime.lastError);
  } else {
    let existingValues = "";
    if (details.httpTrackerGlobalExcludePatterns) {
      existingValues = details.httpTrackerGlobalExcludePatterns.join(", ");
    }
    return existingValues;
  }
}