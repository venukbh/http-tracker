let addOnWindowId = null;

const bringToFront = {
  focused: true
};

const createWindowProperties =
  (!httpTracker.isFF) ? {
    // height: (window.screen.height) * 3 / 4,
    // width: (window.screen.width) * 3 / 4,
    // left: (window.screen.width) * 3 / 4,
    // top: (window.screen.height) * 3 / 4,
    state: "normal",
    type: "popup",
    url: httpTracker.browser.extension.getURL("/src/html/http-tracker.html")
  } : {
    state: "maximized",
    type: "popup",
    url: httpTracker.browser.extension.getURL("/src/html/http-tracker.html")
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

// open the addon window, or if already opened, bring to front
// this will not open multiple windows when the addon icon is clicked
async function OpenAddonWindow() {
  if (addOnWindowId) {
    httpTracker.browser.windows.get(addOnWindowId, focusExistingWindow);
  } else {
    createNewAddonPopupWindow();
  }
}

async function focusExistingWindow(addOnWindow) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
  } else if (addOnWindow) {
    httpTracker.browser.windows.update(addOnWindow.id, bringToFront);
  } else {
    createNewAddonPopupWindow();
  }
}

function createNewAddonPopupWindow() {
  httpTracker.browser.windows.create(createWindowProperties, captureAddonWindowId);
}

async function captureAddonWindowId(windowDetails) {
  addOnWindowId = windowDetails.id;
}

// httpTracker.browser.browserAction.onClicked.addListener(openInNewTab);
httpTracker.browser.browserAction.onClicked.addListener(OpenAddonWindow);