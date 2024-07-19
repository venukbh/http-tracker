const trackUrls = {
  urls: ['<all_urls>'],
};

const reqBodyHeaders = httpTracker.isFF ? ['requestBody'] : ['requestBody', 'extraHeaders'];
const reqHeaders = httpTracker.isFF ? ['requestHeaders'] : ['requestHeaders', 'extraHeaders'];
const reqHeadersBlocking = httpTracker.isFF ? ['blocking', 'requestHeaders'] : ['blocking', 'requestHeaders', 'extraHeaders'];
const resHeaders = httpTracker.isFF ? ['responseHeaders'] : ['responseHeaders', 'extraHeaders'];
const errorHeaders = ['extraHeaders'];
const r = httpTracker.browser.webRequest;

function listener(details) {
  const filter = r.filterResponseData(details.requestId);
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();

  filter.ondata = (event) => {
    const str = decoder.decode(event.data, {
      stream: true,
    });
    // Just change any instance of Example in the HTTP response
    // to WebExtension Example.
    // str = str.replace(/Example/g, "WebExtension Example");
    // console.log('debugging filter ondata str', str);
    // TODO: log response content in detail
    filter.write(encoder.encode(str));
    filter.disconnect();
  };

  return {};
}

r.onBeforeRequest.addListener(
    function(details) {
      details.callerName = 'onBeforeRequest';
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
      // TODO: this makes network slow(find a way to make it work and fast)
      /*
       * if (r.filterResponseData) {
       *  listener(details);
       *}
       */
    }, trackUrls, reqBodyHeaders,
);

r.onBeforeSendHeaders.addListener(
    function(details) {
      details.callerName = 'onBeforeSendHeaders';
      details.requestIdEnhanced = details.requestId;
      addModifyRequestHeaders(details);
      eventTracker.logRequestDetails(details);
      if (blockRequests(details)) {
        return {
          cancel: true,
        };
      }
      return {
        requestHeaders: details.requestHeaders,
      };
    }, trackUrls, reqHeadersBlocking,
);

r.onSendHeaders.addListener(
    function(details) {
      details.callerName = 'onSendHeaders';
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls, reqHeaders,
);

r.onHeadersReceived.addListener(
    function(details) {
      details.callerName = 'onHeadersReceived';
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls, resHeaders,
);

r.onAuthRequired.addListener(
    function(details) {
      details.callerName = 'onAuthRequired';
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls, resHeaders,
);

r.onBeforeRedirect.addListener(
    function(details) {
      details.callerName = 'onBeforeRedirect';
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls, resHeaders,
);

r.onResponseStarted.addListener(
    function(details) {
      details.callerName = 'onResponseStarted';
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls, resHeaders,
);

r.onCompleted.addListener(
    function(details) {
      details.callerName = 'onCompleted';
      details.requestIdEnhanced = details.requestId;
      eventTracker.logRequestDetails(details);
    }, trackUrls, resHeaders,
);

if (httpTracker.isFF) {
  r.onErrorOccurred.addListener(
      function(details) {
        details.callerName = 'onErrorOccurred';
        details.requestIdEnhanced = details.requestId;
        eventTracker.logRequestDetails(details);
      }, trackUrls,
  );
} else {
  r.onErrorOccurred.addListener(
      function(details) {
        details.callerName = 'onErrorOccurred';
        details.requestIdEnhanced = details.requestId;
        eventTracker.logRequestDetails(details);
      }, trackUrls, errorHeaders,
  );
}
