let defaultExcludePatternsTextArea = getById("default_exclude_patterns");

// Whenever the contents of the textarea is changed and then loses focus, save the new values
defaultExcludePatternsTextArea.addEventListener("change", storeSettings);


async function storeSettings() {
  httpTracker.browser.storage.sync.set({
    'httpTrackerGlobalExcludePatterns': uniqueArray(stringToArray(defaultExcludePatternsTextArea.value, /\n|\t|\ |\,/))
  }, function() {
    // nothing to do
  });
}

async function getSetGlobalOptions(details) {
  defaultExcludePatternsTextArea.value = getStoredDetails(details).join(", ");
}

// On opening the options page, fetch stored settings and update the UI with them.
httpTracker.browser.storage.sync.get(['httpTrackerGlobalExcludePatterns'], getSetGlobalOptions);