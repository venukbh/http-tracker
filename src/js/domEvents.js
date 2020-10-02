const trackUrls = {
  urls: ["<all_urls>"]
};

let reqBodyHeaders = httpTracker.isFF ? ["requestBody"] : ["requestBody"];
let reqHeaders = httpTracker.isFF ? ["requestHeaders"] : ["requestHeaders", "extraHeaders"];
let reqHeadersBlocking = httpTracker.isFF ? ["blocking", "requestHeaders"] : ["blocking", "requestHeaders", "extraHeaders"];
let resHeaders = httpTracker.isFF ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"];
let errorHeaders = ["extraHeaders"];
const r = httpTracker.browser.webRequest;

httpTracker.browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    details.callerName = "onBeforeRequest";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, trackUrls, reqBodyHeaders
);

httpTracker.browser.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    details.callerName = "onBeforeSendHeaders";
    details.requestIdEnhanced = details.requestId;
    addModifyRequestHeaders(details);
    eventTracker.logRequestDetails(details);
    return { requestHeaders: details.requestHeaders };
  }, trackUrls, reqHeadersBlocking
);

httpTracker.browser.webRequest.onSendHeaders.addListener(
  function(details) {
    details.callerName = "onSendHeaders";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, trackUrls, reqHeaders
);

httpTracker.browser.webRequest.onHeadersReceived.addListener(
  function(details) {
    details.callerName = "onHeadersReceived";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, trackUrls, resHeaders
);

httpTracker.browser.webRequest.onAuthRequired.addListener(
  function(details) {
    details.callerName = "onAuthRequired";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, trackUrls, resHeaders
);

httpTracker.browser.webRequest.onBeforeRedirect.addListener(
  function(details) {
    details.callerName = "onBeforeRedirect";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, trackUrls, resHeaders
);

httpTracker.browser.webRequest.onResponseStarted.addListener(
  function(details) {
    details.callerName = "onResponseStarted";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, trackUrls, resHeaders
);

httpTracker.browser.webRequest.onCompleted.addListener(
  function(details) {
    details.callerName = "onCompleted";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, trackUrls, resHeaders
);

if (httpTracker.isFF) {
  httpTracker.browser.webRequest.onErrorOccurred.addListener(
    function(details) {
      details.callerName = "onErrorOccurred";
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls
  );
} else {
  httpTracker.browser.webRequest.onErrorOccurred.addListener(
    function(details) {
      details.callerName = "onErrorOccurred";
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls, errorHeaders
  );
}