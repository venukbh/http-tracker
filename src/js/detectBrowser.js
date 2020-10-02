// this cannot be used in openHttpTracker.js as that js itself is self implemented and does not take external script files

// But when ever this file is changed, make sure the same copy is updated there and vice-versa
let httpTracker =
  (window.browser) ? {
    webEventConsumer: window.browser,
    browserName: "firefox",
    isFirefoxBrowser: true
  } : {
    webEventConsumer: window.chrome,
    browserName: "chrome"
  };

function onError(e) {
  console.error(e);
}

function getStoredDetails(details) {
  if (httpTracker.webEventConsumer.runtime.lastError) {
    onError(httpTracker.webEventConsumer.runtime.lastError);
  } else {
    let existingValues = "";
    if (details.httpTrackerGlobalExcludePatterns) {
      existingValues = details.httpTrackerGlobalExcludePatterns;
    }
    return existingValues;
  }
}

// Shorthand for document.getElementById
function getById(elementId) {
  return document.getElementById(elementId);
}

// Shorthand for document.getElementsByClassName which returns a live HTMLCollection of found elements.
function getByClassNames(classNamesSpaceDelimited) {
  return document.getElementsByClassName(classNamesSpaceDelimited);
}