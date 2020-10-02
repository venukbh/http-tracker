let addOnWindowId = null;

const bringToFront = {
  focused: true
};

const createWindowProperties = {
  type: "popup",
  url: httpTracker.browser.extension.getURL("/src/html/http-tracker.html"),
  state: httpTracker.isFF ? "maximized" : "normal"
};

// // open in a new tab functionality
// function tabOpeningSuccess(result) {
//     console.debug("Addon tab loaded");
// }

// function tabOpeningFailure(result) {
//     console.debug("Addon tab failed to load");
// }

// function openInNewTab() {
//   let extensionUUIDManifestURL = httpTracker.browser.extension.getURL("manifest.json");
//   let extensionUUID = extensionUUIDManifestURL.split("/manifest.json")[0];
//   console.debug(extensionUUID.split("manifest.json")[0]);
//   httpTracker.browser.tabs.query({
//     "url": extensionUUID + "/src/html/http-tracker.html"
//   }, function(tabs) {
//     if (tabs && tabs.length > 0) {
//       var tabIndex = tabs[0].index;
//       httpTracker.browser.tabs.query({}, function(tabs) {
//         httpTracker.browser.tabs.update(tabs[tabIndex].id, {
//           active: true
//         });
//       });
//     } else {
//       httpTracker.browser.tabs.create({
//         "url": httpTracker.browser.extension.getURL("/src/html/http-tracker.html")
//       });
//     }
//   });
// }

async function closeAddon(closedaddOnWindowId) {
  addOnWindowId = undefined;
}

// open the addon window, or if already opened, bring to front preventing multiple windows
async function openAddon() {
  if (addOnWindowId) {
    httpTracker.browser.windows.get(addOnWindowId, focusExistingWindow);
  } else {
    createNewAddonWindow();
  }
}

async function focusExistingWindow(addOnWindowDetails) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
  } else if (addOnWindowDetails) {
    httpTracker.browser.windows.update(addOnWindowDetails.id, bringToFront);
  } else {
    createNewAddonWindow();
  }
}
async function captureAddonWindowId(windowDetails) {
  addOnWindowId = windowDetails.id;
}

async function createNewAddonWindow() {
  httpTracker.browser.windows.create(createWindowProperties, captureAddonWindowId);
}

// httpTracker.browser.browserAction.onClicked.addListener(openInNewTab);
httpTracker.browser.browserAction.onClicked.addListener(openAddon);
httpTracker.browser.windows.onRemoved.addListener(closeAddon);