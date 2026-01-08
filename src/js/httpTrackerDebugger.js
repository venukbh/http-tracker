const debuggerTracker = (function () {
    const attachedTabs = new Set();
    const attachingTabs = new Set(); // Prevent concurrent attach attempts
    const requestUrlMap = new Map(); // DevTools requestId -> URL
    const b = httpTracker.browser;

    function attachToTab(tabId) {
        if (tabId === -1 || attachedTabs.has(tabId) || attachingTabs.has(tabId)) return;

        attachingTabs.add(tabId);

        b.debugger.attach({ tabId: tabId }, '1.2', () => {
            attachingTabs.delete(tabId);

            if (b.runtime.lastError) {
                const msg = b.runtime.lastError.message;
                // Ignore expected errors for restricted pages or conflicting debuggers
                if (msg.includes("Cannot access") || msg.includes("Another debugger")) {
                    return;
                }
                console.error('Debugger attach failed:', msg);
                return;
            }

            attachedTabs.add(tabId);
            b.debugger.sendCommand({ tabId: tabId }, 'Network.enable', {}, () => {
                if (b.runtime.lastError) {
                    console.error('Network.enable failed:', b.runtime.lastError.message);
                }
            });
        });
    }

    function detachFromTab(tabId) {
        if (attachedTabs.has(tabId)) {
            b.debugger.detach({ tabId: tabId }, () => {
                attachedTabs.delete(tabId);
            });
        }
    }

    const onEvent = (source, method, params) => {
        const tabId = source.tabId;

        if (method === 'Network.responseReceived') {
            // Store the URL for this DevTools requestId
            const url = params.response?.url;
            if (url) {
                requestUrlMap.set(params.requestId, url);
                console.log('Debugger: responseReceived -', params.requestId, '-> URL:', url);
            }
        }

        if (method === 'Network.loadingFinished') {
            const devToolsRequestId = params.requestId;
            const url = requestUrlMap.get(devToolsRequestId);

            console.log('Debugger: loadingFinished for', devToolsRequestId, 'URL:', url);

            if (url) {
                b.debugger.sendCommand({ tabId: tabId }, 'Network.getResponseBody', { requestId: devToolsRequestId }, (response) => {
                    if (b.runtime.lastError) {
                        console.warn('Debugger: getResponseBody failed:', b.runtime.lastError.message);
                        requestUrlMap.delete(devToolsRequestId);
                        return;
                    }

                    if (response && response.body) {
                        console.log('Debugger: Body captured for URL:', url, 'length:', response.body.length);
                        // Pass the URL instead of requestId - we'll match by URL
                        eventTracker.insertResponseBodyByUrl(url, response.body, response.base64Encoded);
                    } else {
                        console.log('Debugger: No body for', devToolsRequestId);
                    }
                    requestUrlMap.delete(devToolsRequestId);
                });
            }
        }
    };

    const onDetach = (source) => {
        attachedTabs.delete(source.tabId);
    };

    function init() {
        b.debugger.onEvent.addListener(onEvent);
        b.debugger.onDetach.addListener(onDetach);
    }

    function detachAll() {
        attachedTabs.forEach(tabId => {
            b.debugger.detach({ tabId: tabId }, () => {
                attachedTabs.delete(tabId);
            });
        });
    }

    return {
        init: init,
        attachToTab: attachToTab,
        detachFromTab: detachFromTab,
        detachAll: detachAll
    };
})();
