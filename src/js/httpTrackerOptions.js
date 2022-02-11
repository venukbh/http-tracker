let openAddonStyle = getById("persist_options");
openAddonStyle.addEventListener('change', storeSettings);

// Whenever the contents of the text area is changed and then loses focus, save the new values
async function storeSettings(event) {
  let id = event.target.id;
  let value = uniqueArray(stringToArray(event.target.value, /\n|\t|\ |\,/));
  let key;
  if (id === "default_exclude_patterns") {
    key = httpTracker.STORAGE_KEY_EXCLUDE_PATTERN;
  } else if (id === "default_include_patterns") {
    key = httpTracker.STORAGE_KEY_INCLUDE_PATTERN;
  } else if (id === "tab" || id === "popup") {
    key = httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB;
    value = (value[0] === 'true');
  } else if (id === "default_mask_patterns") {
    key = httpTracker.STORAGE_KEY_MASK_PATTERN;
  }
  setPropertyToStorage(key, value);
}

httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_INCLUDE_PATTERN, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN, httpTracker.STORAGE_KEY_MASK_PATTERN, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB], function(cbResponseParams) {
  let value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_INCLUDE_PATTERN);
  getById("default_include_patterns").value = getProcessedValue(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN);
  getById("default_exclude_patterns").value = getProcessedValue(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_MASK_PATTERN);
  getById("default_mask_patterns").value = getProcessedValue(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB);
  if (value === undefined) {
    setPropertyToStorage(httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB, false);
  } else {
    getById("tab").checked = value;
    getById("popup").checked = !value;
  }
});

function getProcessedValue(value) {
  if (value && value.length) {
    return value.join(", ");
  }
  return "";
}