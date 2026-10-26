const trackUrls = {
  urls: ['<all_urls>'],
};

const reqBodyHeaders = httpTracker.isFF ? ['requestBody'] : ['requestBody', 'extraHeaders'];
const reqHeaders = httpTracker.isFF ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'];
const resHeaders = httpTracker.isFF ? ['responseHeaders'] : ['responseHeaders', 'extraHeaders'];
const errorHeaders = ['extraHeaders'];
const webRequest = httpTracker.browser.webRequest;

const MAX_PENDING_NAVIGATIONS = 50;
const PENDING_NAVIGATION_TTL_MS = 10000;
const pendingNavigations = new Map();

function recordPendingNavigation(tabId, url, timeStamp = Date.now()) {
  if (tabId && tabId !== -1 && typeof url === 'string' && url.startsWith('http://')) {
    if (pendingNavigations.size >= MAX_PENDING_NAVIGATIONS) {
      pendingNavigations.delete(pendingNavigations.keys().next().value);
    }
    pendingNavigations.set(tabId, {
      url,
      timeStamp,
      recordedAt: Date.now(),
    });
  }
}

function checkAndSynthesizeHttpsUpgrade(details) {
  if (details.type !== 'main_frame' || !details.url || !details.url.startsWith('https://')) {
    return;
  }
  // Layer 3 Guard: If webRequest already tracked an event or a redirect for this requestId,
  // do not synthesize a duplicate redirect (e.g. HSTS native redirects).
  if (typeof httpTrackerEventCache !== 'undefined' &&
      (httpTrackerEventCache.hasEvent(details.requestId) ||
       httpTrackerEventCache.getRedirectCount(details.requestId) > 0)) {
    pendingNavigations.delete(details.tabId);
    return;
  }
  const pending = pendingNavigations.get(details.tabId);
  if (!pending?.url || !pending.url.startsWith('http://')) {
    return;
  }
  if (details.timeStamp && pending.timeStamp) {
    if (details.timeStamp - pending.timeStamp > PENDING_NAVIGATION_TTL_MS) {
      pendingNavigations.delete(details.tabId);
      return;
    }
  } else if (Date.now() - (pending.recordedAt || 0) > PENDING_NAVIGATION_TTL_MS) {
    pendingNavigations.delete(details.tabId);
    return;
  }
  try {
    const targetUrl = new URL(details.url);
    const initialUrl = new URL(pending.url);
    if (initialUrl.hostname === targetUrl.hostname) {
      pendingNavigations.delete(details.tabId);
      const upgradeRedirectEvent = {
        requestId: details.requestId,
        requestIdEnhanced: details.requestId,
        url: pending.url,
        method: details.method || 'GET',
        statusCode: 307,
        statusLine: 'HTTP/1.1 307 Internal Redirect',
        responseHeaders: [
          { name: 'Location', value: details.url },
          { name: 'Non-Authoritative-Reason', value: 'HttpsUpgrades' },
        ],
        redirectUrl: details.url,
        tabId: details.tabId,
        frameId: details.frameId,
        parentFrameId: details.parentFrameId,
        type: details.type,
        timeStamp: pending.timeStamp || details.timeStamp,
        fromCache: 'Internal',
        callerName: 'onBeforeRedirect',
      };
      eventTracker.processWebEvent(upgradeRedirectEvent);
    }
  } catch (e) {
    // Ignore URL parse errors
  }
}

function forwardEvent(eventName) {
  return function(details) {
    details.callerName = eventName;
    details.requestIdEnhanced = details.requestId;
    if (eventName === 'onBeforeRequest') {
      if (details.type === 'main_frame' && details.url?.startsWith('http://')) {
        // Layer 1 Guard: webRequest is observing this main_frame HTTP request directly.
        // Therefore, the browser network stack is handling it (e.g. HSTS or server redirect).
        // Clear pending navigation so we never synthesize a duplicate HttpsUpgrades redirect!
        pendingNavigations.delete(details.tabId);
      } else if (details.type === 'main_frame' && details.url?.startsWith('https://')) {
        checkAndSynthesizeHttpsUpgrade(details);
      }
    } else if (eventName === 'onBeforeRedirect' && details.type === 'main_frame') {
      // Layer 2 Guard: If a native redirect already fired for this tab, clear pending navigation.
      pendingNavigations.delete(details.tabId);
    }
    eventTracker.processWebEvent(details);
  };
}

const LISTENER_CONFIG = [
  {event: 'onBeforeRequest', headers: reqBodyHeaders},
  {event: 'onBeforeSendHeaders', headers: reqHeaders},
  {event: 'onSendHeaders', headers: reqHeaders},
  {event: 'onHeadersReceived', headers: resHeaders},
  {event: 'onAuthRequired', headers: resHeaders},
  {event: 'onBeforeRedirect', headers: resHeaders},
  {event: 'onResponseStarted', headers: resHeaders},
  {event: 'onCompleted', headers: resHeaders},
];

LISTENER_CONFIG.forEach(({event, headers}) => {
  webRequest[event].addListener(forwardEvent(event), trackUrls, headers);
});

// Firefox does not accept a 3rd argument (extraInfoSpec) for onErrorOccurred
if (httpTracker.isFF) {
  webRequest.onErrorOccurred.addListener(
      forwardEvent('onErrorOccurred'), trackUrls,
  );
} else {
  webRequest.onErrorOccurred.addListener(
      forwardEvent('onErrorOccurred'), trackUrls, errorHeaders,
  );
}

const webNav = httpTracker.browser?.webNavigation;
if (webNav?.onBeforeNavigate) {
  webNav.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0 && details.url?.startsWith('http://')) {
      recordPendingNavigation(details.tabId, details.url, details.timeStamp);
    }
  });
}

const tabsApi = httpTracker.browser?.tabs;
if (tabsApi?.onRemoved) {
  tabsApi.onRemoved.addListener((tabId) => {
    pendingNavigations.delete(tabId);
  });
}

if (typeof globalThis !== 'undefined') {
  globalThis.httpTrackerDomEvents = {
    recordPendingNavigation,
    checkAndSynthesizeHttpsUpgrade,
    forwardEvent,
    pendingNavigations,
  };
}
