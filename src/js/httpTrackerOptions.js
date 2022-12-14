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
  "reverse_list_enabled": httpTracker.STORAGE_KEY_REVERSE_LIST,
  "reverse_list_disabled": httpTracker.STORAGE_KEY_REVERSE_LIST
};

const toggles = new Set([
  "tab",
  "popup",
  "dark_mode_enabled",
  "dark_mode_disabled",
  "reverse_list_disabled",
  "reverse_list_enabled"
]);

// Whenever the contents of the text area is changed and then loses focus, save the new values
async function storeSettings(event) {
  let id = event.target.id;
  let value = uniqueArray(stringToArray(event.target.value, /\n|\t|\ |\,/));
  console.log({
    id,
    value,
    toggles: Array.from(toggles),
    idToKeyLookup
  });
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

  if (!!value) {
    document.documentElement.classList.add("dark-mode");
  }

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_REVERSE_LIST);
  if (value === undefined) {
    setPropertyToStorage(httpTracker.STORAGE_KEY_REVERSE_LIST, false);
  }
  getById("reverse_list_enabled").checked = !!value;
  getById("reverse_list_disabled").checked = !value;
});

document.querySelector("#dark_mode_disabled").addEventListener("change", () => {
  document.documentElement.classList.remove("dark-mode");
})
document.querySelector("#dark_mode_enabled").addEventListener("change", () => {
  document.documentElement.classList.add("dark-mode");
})

function getProcessedValue(value) {
  if (value && value.length) {
    return value.join(", ");
  }
  return "";
}
