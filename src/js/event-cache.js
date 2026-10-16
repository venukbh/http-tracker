const httpTrackerEventCache = (function() {
  const addedRequestId = new Set();
  const allRequestHeaders = new Map();
  const allResponseHeaders = new Map();
  const requestFormData = new Map();
  const requestIdRedirectCount = new Map();

  function setRedirectCount(webEvent) {
    let redirectCount = requestIdRedirectCount.get(webEvent.requestId);
    if (redirectCount === undefined) {
      redirectCount = 0;
      requestIdRedirectCount.set(webEvent.requestId, redirectCount);
    } else if (redirectCount) {
      webEvent.requestIdEnhanced = `${webEvent.requestId}_${redirectCount}`;
    }
  }

  function handleRedirect(webEvent) {
    // A defect in older FF versions (tested on 79.0): Firefox starts onBeforeRedirect
    // without actual headers — wait for webEvent.ip to confirm headers are available.
    // This issue does not exist in Chrome.
    if (webEvent.ip) {
      let redirectCount = requestIdRedirectCount.get(webEvent.requestId);
      requestIdRedirectCount.set(webEvent.requestId, ++redirectCount);
      insertResponseHeaders(webEvent);
    }
  }

  function insertRequestBody(webEvent) {
    if (webEvent.requestBody) {
      requestFormData.set(webEvent.requestIdEnhanced, webEvent.requestBody);
    }
  }

  function insertInitialRequest(webEvent) {
    if (!allRequestHeaders.has(webEvent.requestIdEnhanced)) {
      allRequestHeaders.set(webEvent.requestIdEnhanced, webEvent);
    }
  }

  function insertRequestHeaders(webEvent) {
    if (webEvent.requestHeaders) {
      const existing = allRequestHeaders.get(webEvent.requestIdEnhanced);
      const entry = existing ? {...existing, ...webEvent} : webEvent;
      allRequestHeaders.set(webEvent.requestIdEnhanced, entry);
    }
  }

  function insertErrorOccurred(webEvent) {
    insertResponseHeaders(webEvent);
    if (!allRequestHeaders.has(webEvent.requestIdEnhanced)) {
      allRequestHeaders.set(webEvent.requestIdEnhanced, {
        method: webEvent.method,
        url: webEvent.url,
        initiator: webEvent.initiator,
        type: webEvent.type,
        requestId: webEvent.requestId,
        requestIdEnhanced: webEvent.requestIdEnhanced,
      });
    }
  }

  function insertResponseHeaders(webEvent) {
    const existing = allResponseHeaders.get(webEvent.requestIdEnhanced);
    let entry = webEvent;
    if (existing) {
      entry = {...existing, ...webEvent};
      if (!webEvent.responseHeaders && existing.responseHeaders) {
        entry.responseHeaders = existing.responseHeaders;
      }
      if (webEvent.statusCode === undefined && existing.statusCode !== undefined) {
        entry.statusCode = existing.statusCode;
      }
      if (webEvent.statusLine === undefined && existing.statusLine !== undefined) {
        entry.statusLine = existing.statusLine;
      }
    }
    allResponseHeaders.set(webEvent.requestIdEnhanced, entry);
  }

  const CALLER_ACTION_MAP = {
    onBeforeRequest:     (e, captureFormData) => {
      insertInitialRequest(e);
      if (captureFormData) {
        insertRequestBody(e);
      }
    },
    onBeforeSendHeaders: (e) => insertRequestHeaders(e),
    onSendHeaders:       (e) => insertRequestHeaders(e),
    onAuthRequired:      (e) => insertResponseHeaders(e),
    onHeadersReceived:   (e) => insertResponseHeaders(e),
    onResponseStarted:   (e) => insertResponseHeaders(e),
    onCompleted:         (e) => insertResponseHeaders(e),
    onErrorOccurred:     (e) => insertErrorOccurred(e),
  };

  function recordEvent(webEvent, captureFormData) {
    if (!webEvent?.requestId) {
      return;
    }
    setRedirectCount(webEvent);
    if (webEvent.callerName === 'onBeforeRedirect') {
      handleRedirect(webEvent);
    } else {
      CALLER_ACTION_MAP[webEvent.callerName]?.(webEvent, captureFormData);
    }
  }

  function hasEvent(requestIdEnhanced) {
    return addedRequestId.has(requestIdEnhanced);
  }

  function markEventAdded(requestIdEnhanced) {
    addedRequestId.add(requestIdEnhanced);
  }

  function getRequest(requestIdEnhanced) {
    return allRequestHeaders.get(requestIdEnhanced);
  }

  function getResponse(requestIdEnhanced) {
    return allResponseHeaders.get(requestIdEnhanced);
  }

  function getRequestBody(requestIdEnhanced) {
    return requestFormData.get(requestIdEnhanced);
  }

  function removeEntry(requestIdToRemove, rawRequestId) {
    if (!requestIdToRemove) {
      return;
    }
    const rawId = rawRequestId || requestIdToRemove.replace(/_\d+$/, '');
    requestIdRedirectCount.delete(rawId);
    requestIdRedirectCount.delete(requestIdToRemove);
    allRequestHeaders.delete(requestIdToRemove);
    allResponseHeaders.delete(requestIdToRemove);
    requestFormData.delete(requestIdToRemove);
    addedRequestId.delete(requestIdToRemove);
  }

  function clearAll() {
    requestFormData.clear();
    allRequestHeaders.clear();
    allResponseHeaders.clear();
    addedRequestId.clear();
    requestIdRedirectCount.clear();
  }

  return {
    setRedirectCount,
    handleRedirect,
    insertRequestBody,
    insertInitialRequest,
    insertRequestHeaders,
    insertResponseHeaders,
    hasEvent,
    markEventAdded,
    getRequest,
    getResponse,
    getRequestBody,
    removeEntry,
    clearAll,
    recordEvent,
  };
})();
