const bringToFront = {
  focused: true,
};

const createWindowProperties = {
  type: 'popup',
  url: httpTracker.browser.runtime.getURL(httpTracker.PAGE_PATH),
  state: httpTracker.isFF ? 'maximized' : 'normal',
};

// open the addon options window, or if already opened, bring to front preventing multiple windows
function openAddonOptions() {
  return new Promise((resolve) => {
    httpTracker.browser.windows.getAll({
      'populate': true,
    }, function(details) {
      getAddonOptions(details);
      resolve();
    });
  });
}

function activateExistingTab(windowId, targetUrl, reload = false, tabId = null) {
  const doActivate = (id) => {
    httpTracker.browser.windows.update(windowId, bringToFront);
    httpTracker.browser.tabs.update(id, {
      active: true,
    });
    if (reload && typeof httpTracker.browser.tabs?.reload === 'function') {
      httpTracker.browser.tabs.reload(id, { bypassCache: true });
    }
  };

  if (tabId) {
    doActivate(tabId);
    return;
  }

  const resolvedUrl = typeof targetUrl === 'string' && targetUrl.startsWith('/')
    ? httpTracker.browser.runtime.getURL(targetUrl)
    : targetUrl;

  httpTracker.browser.tabs.query({
    'windowId': windowId,
    'url': resolvedUrl,
  }, function(tabs) {
    if (tabs && tabs.length >= 1) {
      doActivate(tabs[0].id);
    }
  });
}

function findWindowAndTab(windows, targetPathOrUrl) {
  const targetUrl = typeof targetPathOrUrl === 'string' && targetPathOrUrl.startsWith('/')
    ? httpTracker.browser.runtime.getURL(targetPathOrUrl)
    : targetPathOrUrl;

  for (const win of (windows || [])) {
    const tab = win.tabs?.find((t) => {
      if (!t?.url) return false;
      return t.url === targetUrl || t.url.startsWith(`${targetUrl}?`) || t.url.startsWith(`${targetUrl}#`);
    });
    if (tab) {
      return { window: win, tab };
    }
  }
  return null;
}

function getAddonOptions(details) {
  const optionsPath = httpTracker.PAGE_PATH_OPTIONS || '/src/html/options.html';
  const targetUrl = httpTracker.browser.runtime.getURL(optionsPath);
  const match = findWindowAndTab(details, optionsPath);
  if (match) {
    activateExistingTab(match.window.id, targetUrl, true, match.tab.id);
  } else {
    httpTracker.browser.runtime.openOptionsPage();
  }
}

function openWhatsNewPage(active = true) {
  return new Promise((resolve) => {
    httpTracker.browser.windows.getAll({
      'populate': true,
    }, function(details) {
      getWhatsNewPage(details, active);
      resolve();
    });
  });
}

function getWhatsNewPage(details, active = true) {
  const whatsNewPath = httpTracker.PAGE_PATH_WHATS_NEW || '/src/html/whats-new.html';
  const targetUrl = httpTracker.browser.runtime.getURL(whatsNewPath);
  const match = findWindowAndTab(details, whatsNewPath);
  if (match) {
    if (active) {
      activateExistingTab(match.window.id, targetUrl, true, match.tab.id);
    } else if (typeof httpTracker.browser.tabs?.reload === 'function') {
      httpTracker.browser.tabs.reload(match.tab.id, { bypassCache: true });
    }
  } else {
    httpTracker.browser.tabs.create({
      'url': targetUrl,
      'active': active,
    });
  }
}

// open the addon window, or if already opened, bring to front preventing multiple windows
function openAddon() {
  return new Promise((resolve) => {
    httpTracker.browser.windows.getAll({
      'populate': true,
    }, async function(details) {
      await getAddonWindow(details);
      resolve();
    });
  });
}

async function getAddonWindow(details) {
  const cbResponseParams = await new Promise((resolve) => {
    httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB], (data) => resolve(data));
  });
  const value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB);
  if (value === undefined) {
    setPropertyToStorage(httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB, false);
  }
  if (value) {
    openInTab(details);
  } else {
    await openInPopupWindow(details);
  }
}

function openInTab(details) {
  const trackerUrl = httpTracker.browser.runtime.getURL(httpTracker.PAGE_PATH);
  const match = findWindowAndTab(details, httpTracker.PAGE_PATH);
  if (match) {
    activateExistingTab(match.window.id, trackerUrl, false, match.tab.id);
  } else {
    httpTracker.browser.tabs.create({
      'url': trackerUrl,
    });
  }
}

function getExistingAddonWindow(details) {
  return findWindowAndTab(details, httpTracker.PAGE_PATH)?.window;
}

async function openInPopupWindow(details) {
  const match = findWindowAndTab(details, httpTracker.PAGE_PATH);
  if (match?.window) {
    const addOnWindowDetails = await new Promise((resolve) => {
      httpTracker.browser.windows.get(match.window.id, (w) => resolve(w));
    });
    focusExistingWindow(addOnWindowDetails);
    if (match.tab?.id) {
      httpTracker.browser.tabs.update(match.tab.id, { active: true });
    }
  } else {
    httpTracker.browser.windows.create(createWindowProperties);
  }
}

function focusExistingWindow(addOnWindowDetails) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
  } else if (addOnWindowDetails) {
    httpTracker.browser.windows.update(addOnWindowDetails.id, bringToFront);
  } else {
    httpTracker.browser.windows.create(createWindowProperties);
  }
}

// Only register the browser action listener in the background context,
// not when loaded in extension UI pages (e.g. http-tracker.html).
const isUiPage = globalThis.window?.location?.pathname?.includes('/src/html/');
if (!isUiPage) {
  httpTracker.browser.action.setTitle({
    'title': getManifestDetails().title,
  });

  if (!httpTracker.browser.action.onClicked.hasListener(openAddon)) {
    httpTracker.browser.action.onClicked.addListener(openAddon);
  }
}
