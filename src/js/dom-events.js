const trackUrls = {
  urls: ['<all_urls>'],
};

const reqBodyHeaders = httpTracker.isFF ? ['requestBody'] : ['requestBody', 'extraHeaders'];
const reqHeaders = httpTracker.isFF ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'];
const resHeaders = httpTracker.isFF ? ['responseHeaders'] : ['responseHeaders', 'extraHeaders'];
const errorHeaders = ['extraHeaders'];
const webRequest = httpTracker.browser.webRequest;

function forwardEvent(eventName) {
  return function(details) {
    if (details?.url && !details.url.startsWith('http://') && !details.url.startsWith('https://') && !details.url.startsWith('ws://') && !details.url.startsWith('wss://')) {
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
