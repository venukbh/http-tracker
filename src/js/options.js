const openAddonStyle = getById('persist_options');
openAddonStyle.addEventListener('change', saveSettings);

const STORAGE_KEY_BY_ID = {
  default_exclude_patterns: httpTracker.STORAGE_KEY_EXCLUDE_PATTERN,
  default_include_patterns: httpTracker.STORAGE_KEY_INCLUDE_PATTERN,
  default_mask_patterns: httpTracker.STORAGE_KEY_MASK_PATTERN,
  tab: httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB,
  popup: httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB,
};

// Whenever the contents of the text area is changed and then loses focus, save the new values
// Synchronous by design: async is unnecessary without await and would turn runtime errors into unhandled rejections
function saveSettings(event) {
  const id = event.target?.id;
  const key = STORAGE_KEY_BY_ID[id];
  if (!key) {
    return;
  }
  let value = uniqueArray(stringToArray(event.target?.value, /[\n\t ,]/));
  if (id === 'tab' || id === 'popup') {
    value = (value[0] === 'true');
  }
  setPropertyToStorage(key, value);
}

httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_INCLUDE_PATTERN, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN, httpTracker.STORAGE_KEY_MASK_PATTERN, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB], function(cbResponseParams) {
  let value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_INCLUDE_PATTERN);
  getById('default_include_patterns').value = arrayToString(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN);
  getById('default_exclude_patterns').value = arrayToString(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_MASK_PATTERN);
  getById('default_mask_patterns').value = arrayToString(value);

  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB);
  if (value === undefined) {
    setPropertyToStorage(httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB, false);
  } else {
    getById('tab').checked = value;
    getById('popup').checked = !value;
  }
});
