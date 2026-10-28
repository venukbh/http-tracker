const trackUrls = {
  urls: ['<all_urls>'],
};

function checkWireProtocol(url) {
  if (typeof isWireProtocol === 'function') {
    return isWireProtocol(url);
  }
  if (!url || typeof url !== 'string') {
    return false;
  }
  const colonIndex = url.indexOf(':');
  if (colonIndex === -1) {
    return false;
  }
  const protocol = url.slice(0, colonIndex + 1).toLowerCase();
  const set = typeof WIRE_PROTOCOLS !== 'undefined' ? WIRE_PROTOCOLS : new Set(['http:', 'https:', 'ws:', 'wss:']);
  return set.has(protocol);
}

const reqBodyHeaders = httpTracker.isFF ? ['requestBody'] : ['requestBody', 'extraHeaders'];
const reqHeaders = httpTracker.isFF ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'];
const resHeaders = httpTracker.isFF ? ['responseHeaders'] : ['responseHeaders', 'extraHeaders'];
const errorHeaders = ['extraHeaders'];
const webRequest = httpTracker.browser.webRequest;

function forwardEvent(eventName) {
  return function(details) {
    if (details?.url && !checkWireProtocol(details.url)) {
      return;
    }
    details.callerName = eventName;
    details.requestIdEnhanced = details.requestId;
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

if (typeof globalThis !== 'undefined') {
  globalThis.httpTrackerDomEvents = {
    forwardEvent,
  };
}
