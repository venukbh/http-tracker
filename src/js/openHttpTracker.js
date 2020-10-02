// this cannot be referred in detectBrowser.js
// when ever this below code is changed, make sure the same copy is updated in detectBrowser.js and vice-versa
let httpTracker =
  (window.browser) ? {
    webEventConsumer: window.browser,
    browserName: "firefox",
    isFirefoxBrowser: true
  } : {
    webEventConsumer: window.chrome,
    browserName: "chrome"
  };

addOnWindowId = null;

// // open in a new tab functionality
// function tabOpeningSuccess(result) {
//     console.debug("Addon tab loaded");
// }

// function tabOpeningFailure(result) {
//     console.debug("Addon tab failed to load");
// }

// function openInNewTab() {
//   let extensionUUIDManifestURL = httpTracker.webEventConsumer.extension.getURL("manifest.json");
//   let extensionUUID = extensionUUIDManifestURL.split("/manifest.json")[0];
//   console.debug(extensionUUID.split("manifest.json")[0]);
//   httpTracker.webEventConsumer.tabs.query({
//     "url": extensionUUID + "/src/html/http-tracker.html"
//   }, function(tabs) {
//     if (tabs && tabs.length > 0) {
//       var tabIndex = tabs[0].index;
//       httpTracker.webEventConsumer.tabs.query({}, function(tabs) {
//         httpTracker.webEventConsumer.tabs.update(tabs[tabIndex].id, {
//           active: true
//         });
//       });
//     } else {
//       httpTracker.webEventConsumer.tabs.create({
//         "url": httpTracker.webEventConsumer.extension.getURL("/src/html/http-tracker.html")
//       });
//     }
//   });
// }

// open the addon window, or if already opened, bring to front
// this will not open multiple windows when the addon icon is clicked
async function OpenAddonWindow() {
  // console.debug("addOnWindowId: " + addOnWindowId);
  if (addOnWindowId) {
    httpTracker.webEventConsumer.windows.get(addOnWindowId, focusExistingWindow);
  } else {
    createNewAddonPopupWindow();
  }
  // console.log(httpTracker)
}

function focusExistingWindow(addOnWindow) {
  if (httpTracker.webEventConsumer.runtime.lastError) {
    console.debug("Could not bring back the existing addOnWindow as it might be closed");
  }
  if (addOnWindow) {
    let updateInfo = {
      focused: true
    };
    // console.debug("addOnWindow.id" + addOnWindow.id);
    httpTracker.webEventConsumer.windows.update(addOnWindow.id, updateInfo);
  } else {
    createNewAddonPopupWindow();
  }
}

function createNewAddonPopupWindow() {
  // console.log(httpTracker.webEventConsumer);
  let createWindowProperties = {};
  if (httpTracker.browserName == "chrome") {
    createWindowProperties = {
      height: (window.screen.height) * 3 / 4,
      width: (window.screen.width) * 3 / 4,
      left: (window.screen.width) * 3 / 4,
      top: (window.screen.height) * 3 / 4,
      type: "popup",
      url: httpTracker.webEventConsumer.extension.getURL("/src/html/http-tracker.html")
    };
  } else {
    createWindowProperties = {
      state: "maximized",
      type: "popup",
      url: httpTracker.webEventConsumer.extension.getURL("/src/html/http-tracker.html")
    };
  }
  httpTracker.webEventConsumer.windows.create(createWindowProperties, captureAddonWindowId);
}

function captureAddonWindowId(windowDetails) {
  // console.debug(windowDetails);
  addOnWindowId = windowDetails.id;
}

// httpTracker.webEventConsumer.browserAction.onClicked.addListener(openInNewTab);
httpTracker.webEventConsumer.browserAction.onClicked.addListener(OpenAddonWindow);