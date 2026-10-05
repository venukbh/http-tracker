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

LISTENER_CONFIG.forEach(({event, headers}) => {
  r[event].addListener(
      function(details) {
        details.callerName = event;
        details.requestIdEnhanced = details.requestId;
        eventTracker.logRequestDetails(details);
      }, trackUrls, headers,
  );
});

// Firefox does not support extraHeaders on onErrorOccurred
r.onErrorOccurred.addListener(
    function(details) {
      details.callerName = 'onErrorOccurred';
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls, httpTracker.isFF ? undefined : errorHeaders,
);
