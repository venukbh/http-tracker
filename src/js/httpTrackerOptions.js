let defaultExcludePatternsTextArea = getById("default_exclude_patterns");
let openAddonStylePopup = getById("popup");
let openAddonStyleTab = getById("tab");
let defaultMaskPatternsTextArea = getById("default_mask_patterns");

openAddonStylePopup.addEventListener('click', storeSettings);
openAddonStyleTab.addEventListener('click', storeSettings);

// Whenever the contents of the text area is changed and then loses focus, save the new values
defaultExcludePatternsTextArea.addEventListener("change", storeSettings);
defaultMaskPatternsTextArea.addEventListener("change", storeSettings);

async function storeSettings(event) {
  let id = event.target.id;
  let value;
  let key;
  if (event.target.id === "default_exclude_patterns") {
    key = httpTracker.STORAGE_KEY_EXCLUDE_PATTERN;
    value = uniqueArray(stringToArray(defaultExcludePatternsTextArea.value, /\n|\t|\ |\,/))
  } else if (event.target.id === "tab" || event.target.id === "popup") {
    key = httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB;
    value = document.querySelector('input[name = "uipage"]:checked').value;
    if (value === "tab") {
      value = true;
    } else {
      value = false;
    }
  } else if (event.target.id === "default_mask_patterns") {
    key = httpTracker.STORAGE_KEY_MASK_PATTERN;
    value = uniqueArray(stringToArray(defaultMaskPatternsTextArea.value, /\n|\t|\ |\,/))
  }
  setPropertyToStorage(key, value);
}

httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_EXCLUDE_PATTERN, httpTracker.STORAGE_KEY_MASK_PATTERN, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB], function(cbResponseParams) {
  let value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN);
  if (value) {
    defaultExcludePatternsTextArea.value = value.join(", ");
  }
  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_MASK_PATTERN);
  if (value) {
    defaultMaskPatternsTextArea.value = value.join(", ");
  }
  value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB);
  openAddonStyleTab.checked = false;
  openAddonStylePopup.checked = false;
  if (value) {
    openAddonStyleTab.checked = value;
  } else {
    openAddonStylePopup.checked = !value;
  }
});