const bringToFront = {
  focused: true
};

const createWindowProperties = {
  type: "popup",
  url: httpTracker.browser.extension.getURL(httpTracker.PAGE_PATH),
  state: httpTracker.isFF ? "maximized" : "normal"
};

// open the addon window, or if already opened, bring to front preventing multiple windows
function openAddon() {
  httpTracker.browser.windows.getAll({ "populate": true }, getAddonWindow);
}

function getAddonWindow(details) {
  httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB], function(cbResponseParams) {
    let value = getPropertyFromStorage(cbResponseParams, httpTracker.STORAGE_KEY_OPEN_ADDON_IN_TAB);
    if (value) {
      openInTab(details);
    } else {
      openInPopWindow(details);
    }
  });
}

function openInTab(details) {
  let existingWindow = getExistingAddonWindow(details);
  if (existingWindow) {
    httpTracker.browser.tabs.query({
      "windowId": existingWindow.id,
      "url": httpTracker.browser.runtime.getURL(httpTracker.PAGE_PATH)
    }, function(tabs) {
      if (tabs && tabs.length == 1) {
        httpTracker.browser.windows.update(
          existingWindow.id, {
            focused: true
          }
        );
        httpTracker.browser.tabs.update(tabs[0].id, {
          active: true
        });
      }
    })
  } else {
    httpTracker.browser.tabs.create({
      "url": httpTracker.browser.runtime.getURL(httpTracker.PAGE_PATH)
    });
  }
}

function getExistingAddonWindow(details) {
  let existingWindow;
  if (details.length > 0) {
    details.some(eachWindow => {
      if (eachWindow.tabs && eachWindow.tabs.some(tab => tab.url.includes(httpTracker.PAGE_PATH))) {
        existingWindow = eachWindow;
      }
    })
  }
  return existingWindow;
}

function openInPopWindow(details) {
  let existingWindow = getExistingAddonWindow(details);
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
    createNewAddonPopup();
  }
}

httpTracker.browser.browserAction.setTitle({ "title": getManifestDetails().title });

httpTracker.browser.browserAction.onClicked.addListener(openAddon);