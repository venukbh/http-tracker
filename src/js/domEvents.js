httpTracker.webEventConsumer.webRequest.onBeforeRequest.addListener(
  function(details) {
    details.callerName = "onBeforeRequest";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFirefoxBrowser ? ["requestBody"] : ["requestBody", "extraHeaders"]
);

httpTracker.webEventConsumer.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    details.callerName = "onBeforeSendHeaders";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFirefoxBrowser ? ["requestHeaders"] : ["requestHeaders", "extraHeaders"]
);

httpTracker.webEventConsumer.webRequest.onSendHeaders.addListener(
  function(details) {
    details.callerName = "onSendHeaders";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFirefoxBrowser ? ["requestHeaders"] : ["requestHeaders", "extraHeaders"]
);

httpTracker.webEventConsumer.webRequest.onHeadersReceived.addListener(
  function(details) {
    details.callerName = "onHeadersReceived";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFirefoxBrowser ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.webEventConsumer.webRequest.onAuthRequired.addListener(
  function(details) {
    details.callerName = "onAuthRequired";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFirefoxBrowser ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.webEventConsumer.webRequest.onBeforeRedirect.addListener(
  function(details) {
    details.callerName = "onBeforeRedirect";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFirefoxBrowser ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.webEventConsumer.webRequest.onResponseStarted.addListener(
  function(details) {
    details.callerName = "onResponseStarted";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFirefoxBrowser ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);

httpTracker.webEventConsumer.webRequest.onCompleted.addListener(
  function(details) {
    details.callerName = "onCompleted";
    details.requestIdEnhanced = details.requestId;
    eventTracker.logRequestDetails(details);
  }, {
    urls: ["<all_urls>"]
  }, httpTracker.isFirefoxBrowser ? ["responseHeaders"] : ["responseHeaders", "extraHeaders"]
);


if (httpTracker.isFirefoxBrowser) {
  httpTracker.webEventConsumer.webRequest.onErrorOccurred.addListener(
    function(details) {
      details.callerName = "onErrorOccurred";
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, {
      urls: ["<all_urls>"]
    }
  );
} else {
  httpTracker.webEventConsumer.webRequest.onErrorOccurred.addListener(
    function(details) {
      details.callerName = "onErrorOccurred";
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, {
      urls: ["<all_urls>"]
    }, ["extraHeaders"]
  );
}

// There are 3 ways to display the list of urls.
// 1. Right after the add-on is loaded by start tracking the httpTracker.webEventConsumer requests
// 2. When the search box input changes
// 3. When ever the requestIdURL map changes