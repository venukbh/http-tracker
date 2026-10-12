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
  httpTracker.browser.windows.getAll({
    'populate': true,
  }, getAddonOptions);
}

function activateExistingTab(windowId, targetUrl) {
  httpTracker.browser.tabs.query({
    'windowId': windowId,
    'url': targetUrl,
  }, function(tabs) {
    if (tabs?.length === 1) {
      httpTracker.browser.windows.update(windowId, bringToFront);
      httpTracker.browser.tabs.update(tabs[0].id, {
        active: true,
      });
    }
  });
}

function getAddonOptions(details) {
  const existingWindow = details?.find((win) => win.tabs?.some((tab) => tab.url?.includes('/src/html/options.html')));
  if (existingWindow) {
    activateExistingTab(existingWindow.id, httpTracker.browser.runtime.getURL('/src/html/options.html'));
  } else {
    httpTracker.browser.runtime.openOptionsPage();
  }
}

// open the addon window, or if already opened, bring to front preventing multiple windows
function openAddon() {
  httpTracker.browser.windows.getAll({
    'populate': true,
  }, getAddonWindow);
}

function getAddonWindow(details) {
  httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB], function(cbResponseParams) {
    const value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB);
    if (value === undefined) {
      setPropertyToStorage(httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB, false);
    }
    if (value) {
      openInTab(details);
    } else {
      openInPopWindow(details);
    }
  });
}

function openInTab(details) {
  const existingWindow = getExistingAddonWindow(details);
  if (existingWindow) {
    activateExistingTab(existingWindow.id, httpTracker.browser.runtime.getURL(httpTracker.PAGE_PATH));
  } else {
    httpTracker.browser.tabs.create({
      'url': httpTracker.browser.runtime.getURL(httpTracker.PAGE_PATH),
    });
  }
}

function getExistingAddonWindow(details) {
  return details?.find((win) => win.tabs?.some((tab) => tab.url?.includes(httpTracker.PAGE_PATH)));
}

function openInPopWindow(details) {
  const existingWindow = getExistingAddonWindow(details);
  if (existingWindow) {
    httpTracker.browser.windows.get(existingWindow.id, focusExistingWindow);
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
