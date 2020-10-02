httpTracker.browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    details.callerName = "onBeforeRequest";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFF ? ["requestBody"] : ["requestBody"]
);

httpTracker.browser.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    details.callerName = "onBeforeSendHeaders";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFF ? ["requestHeaders"] : ["requestHeaders", "extraHeaders"]
);

httpTracker.browser.webRequest.onSendHeaders.addListener(
  function(details) {
    details.callerName = "onSendHeaders";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFF ? ["requestHeaders"] : ["requestHeaders", "extraHeaders"]
);

httpTracker.browser.webRequest.onHeadersReceived.addListener(
  function(details) {
    details.callerName = "onHeadersReceived";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFF ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.browser.webRequest.onAuthRequired.addListener(
  function(details) {
    details.callerName = "onAuthRequired";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFF ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.browser.webRequest.onBeforeRedirect.addListener(
  function(details) {
    details.callerName = "onBeforeRedirect";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFF ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.browser.webRequest.onResponseStarted.addListener(
  function(details) {
    details.callerName = "onResponseStarted";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFF ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.browser.webRequest.onCompleted.addListener(
  function(details) {
    details.callerName = "onCompleted";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFF ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.browser.webRequest.onErrorOccurred.addListener(
  function(details) {
    details.callerName = "onErrorOccurred";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }
);

// if (httpTracker.isFF) {
//   httpTracker.browser.webRequest.onErrorOccurred.addListener(
//     function(details) {
//       details.callerName = "onErrorOccurred";
//       details.requestIdEnhanced = details.requestId;
//       eventTracker.logRequestDetails(details);
//     }, {
//       urls: ["<all_urls>"]
//     }
//   );
// } else {
//   httpTracker.browser.webRequest.onErrorOccurred.addListener(
//     function(details) {
//       details.callerName = "onErrorOccurred";
//       details.requestIdEnhanced = details.requestId;
//       eventTracker.logRequestDetails(details);
//     }, {
//       urls: ["<all_urls>"]
//     }, ["extraHeaders"]
//   );
// }