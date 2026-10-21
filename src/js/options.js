const openAddonStyle = getById('persist_options');

const STORAGE_KEY_BY_ID = {
  default_exclude_patterns: httpTracker.STORAGE_KEY_EXCLUDE_PATTERN,
  default_include_patterns: httpTracker.STORAGE_KEY_INCLUDE_PATTERN,
  default_mask_patterns: httpTracker.STORAGE_KEY_MASK_PATTERN,
  tab: httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB,
  popup: httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB,
};

function showSavedIndicator(elementId) {
  const targetId = (elementId === 'tab' || elementId === 'popup') ? 'uipage' : elementId;
  const badge = getById(`status_${targetId}`);
  if (!badge) {
    return;
  }
  if (badge._savedTimeout) {
    clearTimeout(badge._savedTimeout);
  }
  badge.textContent = '✓ Saved';
  badge.classList.add('show');
  badge._savedTimeout = setTimeout(() => {
    badge.classList.remove('show');
    delete badge._savedTimeout;
  }, 1500);
}

function saveElementValue(target) {
  const id = target?.id;
  const key = STORAGE_KEY_BY_ID[id];
  if (!key) {
    return;
  }
  let value = uniqueArray(stringToArray(target.value, /[\n\t ,]/));
  if (id === 'tab' || id === 'popup') {
    value = (value[0] === 'true');
  }
  setPropertyToStorage(key, value);
  showSavedIndicator(id);
}

// Whenever the contents of the text area is changed and then loses focus, save the new values
// Synchronous by design: async is unnecessary without await and would turn runtime errors into unhandled rejections
function saveSettings(event) {
  saveElementValue(event.target);
}

if (openAddonStyle) {
  openAddonStyle.addEventListener('change', saveSettings);

  // Debounced auto-save: 300ms after user pauses typing in a textarea
  const debounceFn = (typeof debounce === 'function') ? debounce : (fn) => fn;
  const debouncedSave = debounceFn((event) => {
    const target = event?.target;
    if (target?.tagName?.toLowerCase() === 'textarea' && STORAGE_KEY_BY_ID[target.id]) {
      saveElementValue(target);
    }
  }, 300);

  openAddonStyle.addEventListener('input', debouncedSave);
}

// Flush active textarea on page hide or tab close so no edits are lost even if closed mid-typing
function flushActiveTextarea() {
  const activeEl = (typeof document !== 'undefined') ? document.activeElement : null;
  if (activeEl?.tagName?.toLowerCase() === 'textarea' && STORAGE_KEY_BY_ID[activeEl.id]) {
    saveElementValue(activeEl);
  }
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeunload', flushActiveTextarea);
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushActiveTextarea();
    }
  });
}

async function loadOptions() {
  const cbResponseParams = await new Promise((resolve) => {
    const res = httpTracker.browser.storage.sync.get([
      httpTracker.STORAGE_KEY_INCLUDE_PATTERN,
      httpTracker.STORAGE_KEY_EXCLUDE_PATTERN,
      httpTracker.STORAGE_KEY_MASK_PATTERN,
      httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB,
    ], (data) => resolve(data));
    if (res && typeof res.then === 'function') {
      res.then(resolve);
    }
  });

  ['default_include_patterns', 'default_exclude_patterns', 'default_mask_patterns'].forEach((id) => {
    const val = getPropertyFromStorage(cbResponseParams, STORAGE_KEY_BY_ID[id]);
    const input = getById(id);
    if (input) {
      input.value = arrayToString(val);
    }
  });

  const value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB);
  if (value === undefined) {
    setPropertyToStorage(httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB, false);
  } else {
    const tabEl = getById('tab');
    const popupEl = getById('popup');
    if (tabEl) tabEl.checked = value;
    if (popupEl) popupEl.checked = !value;
  }
}

loadOptions();

function bindClickAction(buttonId, actionFn) {
  const btn = getById(buttonId);
  if (btn) {
    btn.addEventListener('click', function(event) {
      event.preventDefault();
      actionFn(event);
    });
  }
}

bindClickAction('whats_new_link', () => {
  if (typeof openWhatsNewPage === 'function') {
    openWhatsNewPage(true);
  }
});
bindClickAction('open_tracker', () => {
  if (typeof openAddon === 'function') {
    openAddon();
  }
});
bindClickAction('open_tracker_bottom', () => {
  if (typeof openAddon === 'function') {
    openAddon();
  }
});



