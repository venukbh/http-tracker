//  this cannot be referred in browser.js
// But when ever this below code is changed, make sure the same copy is updated in detectBrowser.js and vice-versa
if (window.browser) {
  httpTracker = {
    webEventConsumer: window.browser,
    browserName: "firefox",
    isFirefoxBrowser: true
  }
} else {
  httpTracker = {
    webEventConsumer: window.chrome,
    browserName: "chrome"
  }
}

addOnWindowId = null;

// // open in a new tab functionality
// function tabOpeningSuccess(result) {
//     console.debug("Addon tab loaded");
// }

// function tabOpeningFailure(result) {
//     console.debug("Addon tab failed to load");
// }

// function openInNewTab() {
//     let extensionUUIDManifestURL = httpTracker.webEventConsumer.extension.getURL("manifest.json");
//     let extensionUUID = extensionUUIDManifestURL.split("/manifest.json")[0];
//     console.debug(extensionUUID.split("manifest.json")[0]);
//     httpTracker.webEventConsumer.tabs.query({
//         "url": extensionUUID + "/my-page.html"
//     }, function(tabs) {
//         if (tabs && tabs.length > 0) {
//             var tabIndex = tabs[0].index;
//             httpTracker.webEventConsumer.tabs.query({}, function(tabs) {
//                 chrome.tabs.update(tabs[tabIndex].id, {
//                     active: true
//                 });
//             });
//         } else {
//             httpTracker.webEventConsumer.tabs.create({
//                 "url": httpTracker.webEventConsumer.extension.getURL("/my-page.html")
//             });
//         }
//     });
// }

// httpTracker.webEventConsumer.browserAction.onClicked.addListener(openInNewTab);

// open the addon window, or if already opened, bring to front
// this will not open multiple windows when the addon icon is clicked
function OpenAddonWindow() {
  // console.debug("addOnWindowId" + addOnWindowId);
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
  let createWindowDimensions = {}
  if (httpTracker.browserName == "chrome") { // state maximized is not working for chrome
    createWindowDimensions = {
      height: (window.screen.height) * 3 / 4,
      width: (window.screen.width) * 3 / 4,
      left: (window.screen.width) * 3 / 4,
      top: (window.screen.height) * 3 / 4,
      type: "popup",
      url: httpTracker.webEventConsumer.extension.getURL("my-page.html")
    };
  } else {
    createWindowDimensions = {
      state: "maximized",
      type: "popup",
      url: httpTracker.webEventConsumer.extension.getURL("my-page.html")
    };
  }
  httpTracker.webEventConsumer.windows.create(createWindowDimensions, captureAddonWindowId);
}

function captureAddonWindowId(windowDetails) {
  // console.debug(windowDetails);
  addOnWindowId = windowDetails.id;
}

httpTracker.webEventConsumer.browserAction.onClicked.addListener(OpenAddonWindow);