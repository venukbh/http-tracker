if (window.browser) {
    webEventConsumer = window.browser; // firefox
} else {
    webEventConsumer = window.chrome; // chrome
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
//     let extensionUUIDManifestURL = webEventConsumer.extension.getURL("manifest.json");
//     let extensionUUID = extensionUUIDManifestURL.split("/manifest.json")[0];
//     console.debug(extensionUUID.split("manifest.json")[0]);
//     webEventConsumer.tabs.query({
//         "url": extensionUUID + "/my-page.html"
//     }, function(tabs) {
//         if (tabs && tabs.length > 0) {
//             var tabIndex = tabs[0].index;
//             webEventConsumer.tabs.query({}, function(tabs) {
//                 chrome.tabs.update(tabs[tabIndex].id, {
//                     active: true
//                 });
//             });
//         } else {
//             webEventConsumer.tabs.create({
//                 "url": webEventConsumer.extension.getURL("/my-page.html")
//             });
//         }
//     });
// }

// webEventConsumer.browserAction.onClicked.addListener(openInNewTab);

// open the addon window, or if already opened, bring to front
// this will not open multiple windows when the addon icon is clicked
function OpenAddonWindow() {
    // console.debug("addOnWindowId" + addOnWindowId);
    if (addOnWindowId) {
        webEventConsumer.windows.get(addOnWindowId, focusExistingWindow);
    } else {
        createNewAddonPopupWindow();
    }
}

function focusExistingWindow(addOnWindow) {
    if (webEventConsumer.runtime.lastError) {
        console.debug("Could not bring back the existing addOnWindow as it might be closed");
    }
    if (addOnWindow) {
        let updateInfo = {
            focused: true
        };
        // console.debug("addOnWindow.id" + addOnWindow.id);
        webEventConsumer.windows.update(addOnWindow.id, updateInfo);
    } else {
        createNewAddonPopupWindow();
    }
}

function createNewAddonPopupWindow() {
    let createData = {
        height: (window.screen.height) / 2,
        width: (window.screen.width) / 2,
        left: (window.screen.width) / 4,
        top: (window.screen.height) / 4,
        type: "popup",
        url: webEventConsumer.extension.getURL("my-page.html")
    };
    webEventConsumer.windows.create(createData, captureAddonWindowId);
}

function captureAddonWindowId(windowDetails) {
    // console.debug(windowDetails);
    addOnWindowId = windowDetails.id;
}

webEventConsumer.browserAction.onClicked.addListener(OpenAddonWindow);