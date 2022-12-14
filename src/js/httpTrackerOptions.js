let openAddonStyle = getById("persist_options");
openAddonStyle.addEventListener("change", storeSettings);

const idToKeyLookup = {
  "default_exclude_patterns": httpTracker.STORAGE_KEY_EXCLUDE_PATTERN,
  "default_include_patterns": httpTracker.STORAGE_KEY_INCLUDE_PATTERN,
  "tab": httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB,
  "popup": httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB,
  "default_mask_patterns": httpTracker.STORAGE_KEY_MASK_PATTERN,
  "dark_mode_enabled": httpTracker.STORAGE_KEY_DARK_MODE_ENABLED,
  "dark_mode_disabled": httpTracker.STORAGE_KEY_DARK_MODE_ENABLED,
};

const toggles = new Set([
  "tab",
  "popup",
  "dark_mode_enabled",
  "dark_mode_disabled"
]);

// Whenever the contents of the text area is changed and then loses focus, save the new values
async function storeSettings(event) {
  let id = event.target.id;
  let value = uniqueArray(stringToArray(event.target.value, /\n|\t|\ |\,/));
  const key = idToKeyLookup[id];
  if (!key) {
    console.error(`No id to preference key lookup for id '${id}'`);
    return;
  }

  if (toggles.has(id)) {
    value = (value[0] === "true");
  }

  setPropertyToStorage(key, value);
}

httpTracker.browser.storage.sync.get(httpTracker.allStorageKeys, function (cbResponseParams) {
  let value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_INCLUDE_PATTERN);
  getById("default_include_patterns").value = getProcessedValue(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN);
  getById("default_exclude_patterns").value = getProcessedValue(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_MASK_PATTERN);
  getById("default_mask_patterns").value = getProcessedValue(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB);
  if (value === undefined) {
    setPropertyToStorage(httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB, false);
  }

  getById("tab").checked = !!value;
  getById("popup").checked = !value;

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_DARK_MODE_ENABLED);
  if (value === undefined) {
    setPropertyToStorage(httpTracker.STORAGE_KEY_DARK_MODE_ENABLED, false);
  }
  getById("dark_mode_enabled").checked = !!value;
  getById("dark_mode_disabled").checked = !value;
});

function getProcessedValue(value) {
  if (value && value.length) {
    return value.join(", ");
  }
  return "";
}
