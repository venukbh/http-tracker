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

  function getRedirectCount(requestId) {
    return requestIdRedirectCount.get(requestId) || 0;
  }

  function createRequestMetadata(requestId, enhancedId, url, webEvent) {
    return {
      requestId,
      requestIdEnhanced: enhancedId,
      url,
      method: webEvent.method || 'GET',
      type: webEvent.type,
      tabId: webEvent.tabId,
      frameId: webEvent.frameId,
      parentFrameId: webEvent.parentFrameId,
      timeStamp: webEvent.timeStamp,
      initiator: webEvent.initiator || webEvent.url,
    };
  }

  function handleRedirect(webEvent) {
    if (!webEvent?.requestId) {
      return;
    }
    // Firefox legacy defect (tested on 79.0): Firefox emitted a premature
    // onBeforeRedirect without statusCode, statusLine, or responseHeaders.
    // In Chrome and modern Firefox, internal redirects (e.g. HSTS 307) or
    // cached 301/302 omit IP address, but have statusCode and redirectUrl.
    const isSpuriousFirefoxEvent = httpTracker.isFF && !webEvent.statusCode &&
      !webEvent.responseHeaders && !webEvent.ip && !webEvent.redirectUrl;
    if (!isSpuriousFirefoxEvent) {
      let redirectCount = requestIdRedirectCount.get(webEvent.requestId) || 0;
      requestIdRedirectCount.set(webEvent.requestId, ++redirectCount);
      insertResponseHeaders(webEvent);

      if (!allRequestHeaders.has(webEvent.requestIdEnhanced)) {
        allRequestHeaders.set(webEvent.requestIdEnhanced,
            createRequestMetadata(webEvent.requestId, webEvent.requestIdEnhanced, webEvent.url, webEvent));
      }

      if (webEvent.redirectUrl) {
        const nextEnhancedId = `${webEvent.requestId}_${redirectCount}`;
        if (!allRequestHeaders.has(nextEnhancedId)) {
          allRequestHeaders.set(nextEnhancedId,
              createRequestMetadata(webEvent.requestId, nextEnhancedId, webEvent.redirectUrl, webEvent));
        }
      }
    }
  }

  function insertRequestBody(webEvent) {
    if (webEvent.requestBody) {
      requestFormData.set(webEvent.requestIdEnhanced, webEvent.requestBody);
    }
  }

  function insertInitialRequest(webEvent) {
    const existing = allRequestHeaders.get(webEvent.requestIdEnhanced);
    if (!existing) {
      allRequestHeaders.set(webEvent.requestIdEnhanced, webEvent);
    } else {
      allRequestHeaders.set(webEvent.requestIdEnhanced, {...existing, ...webEvent});
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
    const existing = allResponseHeaders.get(webEvent.requestIdEnhanced);
    const hasValidResponse = existing?.statusCode && Number(existing.statusCode) < 400;
    if (webEvent.error?.includes('ERR_ABORTED') && hasValidResponse) {
      return;
    }
    insertResponseHeaders(webEvent);
    if (!allRequestHeaders.has(webEvent.requestIdEnhanced)) {
      allRequestHeaders.set(webEvent.requestIdEnhanced,
          createRequestMetadata(webEvent.requestId, webEvent.requestIdEnhanced, webEvent.url, webEvent));
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

  function removeEntry(requestIdToRemove) {
    if (!requestIdToRemove) {
      return;
    }
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
    getRedirectCount,
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
