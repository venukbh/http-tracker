let defaultExcludePatternsTextArea = getById("default_exclude_patterns");

// Whenever the contents of the textarea is changed and then loses focus, save the new values
defaultExcludePatternsTextArea.addEventListener("change", storeSettings);


async function storeSettings() {
  let value = uniqueArray(stringToArray(defaultExcludePatternsTextArea.value, /\n|\t|\ |\,/));
  httpTracker.browser.storage.sync.set({
    [httpTracker.STORAGE_KEY_EXCLUDE_PATTERN]: value
  }, function() {
    // nothing to do after successfull storing
  });
}

async function getSetGlobalOptions(details) {
  defaultExcludePatternsTextArea.value = getStoredDetails(details).join(", ");
}

// On opening the options page, fetch stored settings and update the textarea with them.
httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_EXCLUDE_PATTERN], getSetGlobalOptions);