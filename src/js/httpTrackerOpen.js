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
  let addOnWindowId;
  if (details.length > 1) {
    details.some(eachWindow => {
      if (eachWindow.tabs && eachWindow.tabs.length == 1 && eachWindow.tabs[0].url.includes(httpTracker.PAGE_PATH)) {
        addOnWindowId = eachWindow;
      }
    })
  }
  if (addOnWindowId) {
    httpTracker.browser.windows.get(addOnWindowId.id, focusExistingWindow);
  } else {
    createNewAddonWindow();
  }
}

function focusExistingWindow(addOnWindowDetails) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
  } else if (addOnWindowDetails) {
    httpTracker.browser.windows.update(addOnWindowDetails.id, bringToFront);
  } else {
    createNewAddonWindow();
  }
}

function createNewAddonWindow() {
  httpTracker.browser.windows.create(createWindowProperties);
}

httpTracker.browser.browserAction.setTitle({ "title": getManifestDetails().title });

httpTracker.browser.browserAction.onClicked.addListener(openAddon);