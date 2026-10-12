const trackUrls = {
  urls: ['<all_urls>'],
};

const reqBodyHeaders = httpTracker.isFF ? ['requestBody'] : ['requestBody', 'extraHeaders'];
const reqHeaders = httpTracker.isFF ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'];
const resHeaders = httpTracker.isFF ? ['responseHeaders'] : ['responseHeaders', 'extraHeaders'];
const errorHeaders = ['extraHeaders'];
const r = httpTracker.browser.webRequest;

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

function forwardEvent(eventName) {
  return function(details) {
    details.callerName = eventName;
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  };
}

LISTENER_CONFIG.forEach(({event, headers}) => {
  r[event].addListener(forwardEvent(event), trackUrls, headers);
});

// Firefox does not support extraHeaders on onErrorOccurred
r.onErrorOccurred.addListener(
    forwardEvent('onErrorOccurred'), trackUrls, httpTracker.isFF ? undefined : errorHeaders,
);
