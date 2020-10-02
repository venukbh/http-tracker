let defaultExcludePatternsTextArea = document.getElementById("default_exclude_patterns");

function storeSettings() {
  let excludedPatternsArray = defaultExcludePatternsTextArea.value.split(/\n|\t|\ |\,/).map(e => e.trim()).filter(e => e);
  let excludedPatternsUniqueArray = [...new Set(excludedPatternsArray)];
  httpTracker.webEventConsumer.storage.sync.set({
    'httpTrackerGlobalExcludePatterns': excludedPatternsUniqueArray
  }, function() {
    // nothing to do
  });
}

// Whenever the contents of the textarea is changed and then loses focus, save the new values
defaultExcludePatternsTextArea.addEventListener("change", storeSettings);

function updateGlobalOptions(details) {
  defaultExcludePatternsTextArea.value = getStoredDetails(details).join(", ");
}

// On opening the options page, fetch stored settings and update the UI with them.
httpTracker.webEventConsumer.storage.sync.get(['httpTrackerGlobalExcludePatterns'], updateGlobalOptions);