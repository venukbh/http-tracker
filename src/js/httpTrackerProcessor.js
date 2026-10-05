const eventTracker = (function() {
  const addedRequestId = new Set();
  const allRequestHeaders = new Map();
  const allResponseHeaders = new Map();
  let captureFormDataCheckboxValue = false;
  const decoder = new TextDecoder('UTF-8');
  const inputBoxDelay = 500;
  let filterWithKey = '';
  let filterWithValue = '';
  let globalExcludeURLsList;
  let globalIncludeURLsList;
  let globalMaskPatternsList;
  let maskAttributesCheckboxValue = false;
  let maskedAttributesList;
  let optimizeResponseCookies;
  const requestFormData = new Map();
  const requestIdRedirectCount = new Map();
  let selectedWebEventRequestId = '';
  let toggleCaptureEvents = true;
  let findPatterns = '';
  let compiledFindPattern = null;
  let multipleSearchPatterns = '';
  let isANDFilter = false;
  let excludeURLsList;
  let includeURLsList;
  let blockURLSList;

  const CLASS_LIST_TO_ADD = `web_event_list_blank web_event_list_style`;
  const HEADER_CONTENT_BANNER = `<tr><td colspan=2 class='web_event_detail_cookie'>Headers</td></tr>`;
  const COOKIE_CONTENT_BANNER = `<tr><td colspan=2 class='web_event_detail_cookie'>Cookies (sorted: symbols, 0-9, Aa-Zz)</td></tr>`;
  const COOKIE_CONTENT_BANNER_OPTIMIZED = '<tr><td colspan=2 class=\'web_event_detail_cookie\'>Cookies (optimized)</td></tr>';
  const COOKIE_CONTENT_BANNER_UNOPTIMIZED = '<tr><td colspan=2 class=\'web_event_detail_cookie\'>Cookies (unoptimized)</td></tr>';
  const ignoreHeaders = new Set(['frameAncestors', 'frameId', 'parentFrameId', 'tabId', 'timeStamp', 'type', 'callerName', 'requestIdEnhanced', 'requestId']);
  const REQUEST_NOT_AVAILABLE = `<tr><td class='web_event_style_error' style='text-align: center;'>Request not available</td></tr>`;
  const RESPONSE_NOT_AVAILABLE = `<tr><td class='web_event_style_error' style='text-align: center;'>Response not available</td></tr>`;
  const HEADER_CONTENT_KEY = `<tr><td class='web_event_detail_header_key'>`;
  const HEADER_CONTENT_VALUE = `</td><td class='web_event_detail_header_value'>`;

  async function logRequestDetails(webEvent) {
    const inserted = insertEventUrls(webEvent);
    if (inserted) {
      addOrUpdateUrlListToPage(webEvent);
      displaySelectedEventDetails(webEvent);
    }
  }

  function insertEventUrls(webEvent) {
    const captureEvent = toggleCaptureEvents && isEventToCapture(webEvent);
    if (captureEvent) {
      setRedirectCount(webEvent);
      if (webEvent.callerName === 'onBeforeRedirect') {
        actionOnBeforeRedirect(webEvent);
      } else {
        CALLER_ACTION_MAP[webEvent.callerName]?.(webEvent);
      }
      return true;
    }
    return false;
  }

  function setRedirectCount(webEvent) {
    let redirectCount = requestIdRedirectCount.get(webEvent.requestId); // this value can be undefined here
    if (redirectCount === undefined) {
      redirectCount = 0;
      requestIdRedirectCount.set(webEvent.requestId, redirectCount);
    } else if (redirectCount) {
      webEvent.requestIdEnhanced = `${webEvent.requestId}_${redirectCount}`;
    }
  }

  const CALLER_ACTION_MAP = {
    onBeforeRequest:     (e) => insertRequestBody(e),
    onBeforeSendHeaders: (e) => insertRequestHeaders(e),
    onSendHeaders:       (e) => insertRequestHeaders(e),
    onAuthRequired:      (e) => insertResponseHeaders(e),
    onHeadersReceived:   (e) => insertResponseHeaders(e),
    onResponseStarted:   (e) => insertResponseHeaders(e),
    onCompleted:         (e) => insertResponseHeaders(e),
    onErrorOccurred:     (e) => insertResponseHeaders(e),
  };

  function actionOnBeforeRedirect(webEvent) {
    // A defect in latest FF versions (tested on 79.0): Firefox starts onBeforeRedirect
    // without actual headers — wait for webEvent.ip to confirm headers are available.
    // This issue does not exist in Chrome.
    if (webEvent.ip) {
      let redirectCount = requestIdRedirectCount.get(webEvent.requestId);
      requestIdRedirectCount.set(webEvent.requestId, ++redirectCount);
      insertResponseHeaders(webEvent);
    }
  }

  /**
   * find out whether the event to be captured or not
   * excludeURLsList always takes precedence
   */
  function isEventToCapture(webEvent) {
    const captureEventInclude = urlMatchIncludePattern(webEvent);
    const captureEventExclude = captureEventInclude ? urlMatchExcludePattern(webEvent) : true;
    return (captureEventInclude && !captureEventExclude);
  }

  function urlMatchIncludePattern(webEvent) {
    if (webEvent.requestIdEnhanced.includes('fakeRequest')) {
      return false;
    }
    if (!includeURLsList && !globalIncludeURLsList) {
      return true;
    }
    let found = false;
    if (includeURLsList?.length) {
      found = includeURLsList.some((v) => webEvent.url.toLowerCase().includes(v));
    }
    if (!found && globalIncludeURLsList?.length) {
      found = globalIncludeURLsList.some((v) => webEvent.url.toLowerCase().includes(v));
    }
    return found;
  }

  function urlMatchExcludePattern(webEvent) {
    let toExclude = false;
    if (excludeURLsList) {
      toExclude = excludeURLsList.some((v) => webEvent.url.toLowerCase().includes(v.toLowerCase()));
    } else if (!toExclude && globalExcludeURLsList) {
      toExclude = globalExcludeURLsList.some((v) => webEvent.url.toLowerCase().includes(v.toLowerCase()));
    }
    return toExclude;
  }

  function maskFieldsPattern(value) {
    let masking = false;
    if (maskAttributesCheckboxValue) {
      if (maskedAttributesList) {
        masking = maskedAttributesList.some((v) => value.toLowerCase().includes(v));
      }
      if (!masking && globalMaskPatternsList) {
        masking = globalMaskPatternsList.some((v) => value.toLowerCase().includes(v));
      }
    }
    return masking;
  }

  /**
   * populate the events list by adding or updating existing one
   */
  function addOrUpdateUrlListToPage(webEvent) {
    if (!addedRequestId.has(webEvent.requestIdEnhanced)) {
      addEventList(webEvent);
    } else {
      updateEventList(webEvent);
    }
    filterEventList(webEvent);
  }

  function addEventList(webEvent) {
    addedRequestId.add(webEvent.requestIdEnhanced);
    const containerContent = '<div title=\'Click to view details\' class=\'' + CLASS_LIST_TO_ADD + '\' id=\'web_events_list_' + webEvent.requestIdEnhanced + '\'>' +
      generateURLContent(webEvent) +
      generateMETHODContent(webEvent) +
      generateSTATUSContent(webEvent) +
      generateDATETIMEContent(webEvent) +
      generateCACHEContent(webEvent) +
      '</div>';
    getById('urls_list').insertAdjacentHTML('beforeend', containerContent);
  }

  function updateEventList(webEvent) {
    if (webEvent.callerName === 'onErrorOccurred') { // onErrorOccurred contains webEvent.error not webEvent.statusCode
      getById(`web_events_list_${webEvent.requestIdEnhanced}`).classList.add('web_event_style_error');
      getById(`web_event_status_${webEvent.requestIdEnhanced}`).innerHTML = STRING_ERROR;
    }
    // do not update if statusCode is not available (ex: service workers, fetch events in FF are missing response events)
    else if (webEvent.statusCode) {
      getById(`web_events_list_${webEvent.requestIdEnhanced}`).classList.remove('web_event_style_error');
      getById(`web_event_status_${webEvent.requestIdEnhanced}`).innerHTML = webEvent.statusCode;
    }
    getById(`web_event_cache_${webEvent.requestIdEnhanced}`).innerHTML = webEvent.fromCache !== undefined ? webEvent.fromCache : 'N/A';
  }

  function filterEventList(webEvent) { // NOSONAR javascript:S3776
    if (multipleSearchPatterns.length) {
      const type = getById('web_event_filter_key').selectedOptions[0].innerText;
      let value = '';
      if (type === 'CACHE') {
        value = webEvent.fromCache !== undefined ? String(webEvent.fromCache) : 'N/A';
      }
      if (type === 'METHOD') {
        value = webEvent.method;
      }
      if (type === 'STATUS') {
        value = `${webEvent.statusCode || (webEvent.error ? STRING_ERROR : 'N/A')}`;
      }
      if (type === 'URL') {
        value = webEvent.url;
      }
      if (type === 'DATE') {
        value = `${(webEvent.timeStamp ? getReadableDate(webEvent.timeStamp) : 'N/A')}`;
      }
      const string = value.toString().toLowerCase();
      let hide;
      if (!isANDFilter) {
        hide = !multipleSearchPatterns.some((v) => string.includes(v));
      } else {
        let index = 0;
        multipleSearchPatterns.forEach((e) => {
          if (index !== -1) {
            index = string.indexOf(e, index);
            if (index !== -1) {
              index += e.length;
            }
          }
        });
        hide = index === -1;
      }
      if (hide) {
        getById(`web_events_list_${webEvent.requestIdEnhanced}`).classList.add('web_event_list_hide');
      } else {
        getById(`web_events_list_${webEvent.requestIdEnhanced}`).classList.remove('web_event_list_hide');
      }
    }
  }

  function generateURLContent(webEvent) {
    return `<div class='web_event_list_url' id='web_event_url_${webEvent.requestIdEnhanced}'>${escapeHtml(webEvent.url)}</div>`;
  }

  function generateMETHODContent(webEvent) {
    return `<div class='web_event_list_method' id='web_event_method_${webEvent.requestIdEnhanced}'>${escapeHtml(webEvent.method)}</div>`;
  }

  function generateSTATUSContent(webEvent) {
    const status = webEvent.statusCode || (webEvent.error ? STRING_ERROR : 'N/A');
    return `<div class='web_event_list_status' id='web_event_status_${webEvent.requestIdEnhanced}'>${status}</div>`;
  }

  function generateDATETIMEContent(webEvent) {
    return `<div class='web_event_list_date_time' id='web_event_time_${webEvent.requestIdEnhanced}'>${(webEvent.timeStamp ? getReadableDate(webEvent.timeStamp) : 'N/A')}</div>`;
  }

  function generateCACHEContent(webEvent) {
    return `<div class='web_event_list_cache' id='web_event_cache_${webEvent.requestIdEnhanced}'>${webEvent.fromCache !== undefined ? webEvent.fromCache : 'N/A'}</div>`;
  }

  function getReadableDate(timestamp) {
    const d = new Date(timestamp);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${min}:${ss}`;
  }

  function insertRequestBody(webEvent) {
    if (webEvent.requestBody && captureFormDataCheckboxValue) {
      requestFormData.set(webEvent.requestIdEnhanced, webEvent.requestBody);
    }
  }

  function insertRequestHeaders(webEvent) {
    if (webEvent.requestHeaders) {
      allRequestHeaders.set(webEvent.requestIdEnhanced, webEvent);
    }
  }

  function insertResponseHeaders(webEvent) {
    allResponseHeaders.set(webEvent.requestIdEnhanced, webEvent);
  }

  function displaySelectedEventDetails(webEvent) {
    // Performance note: this triggers a full re-render of the header panel on every network event
    // for the selected request (up to 6 renders per request: onBeforeRequest → onCompleted).
    // Optimization opportunity: skip re-render if neither allRequestHeaders nor allResponseHeaders
    // changed since the last render — track a render counter and compare before calling displayEventProperties.
    if (selectedWebEventRequestId && webEvent.requestIdEnhanced === selectedWebEventRequestId) {
      displayEventProperties();
    }
  }

  /**
   *  display selected event details, or update the already selected event details
   *  get the request details, response details, request form data
   *  build the request container, response container
   */
  function displayEventProperties() {
    if (!selectedWebEventRequestId) return;
    const webEventIdRequest = allRequestHeaders.get(selectedWebEventRequestId);
    const webEventIdResponse = allResponseHeaders.get(selectedWebEventRequestId);
    const webEventIdRequestForm = requestFormData.get(selectedWebEventRequestId);

    const requestContainer = buildURLDetailsContainer(webEventIdRequest, 'requestDetails');
    const responseContainer = buildURLDetailsContainer(webEventIdResponse, 'responseDetails');
    const requestFormContainer = buildRequestFormContainer(webEventIdRequestForm);
    const reqEl = getById('web_event_details_selected_request');
    const resEl = getById('web_event_details_selected_response');
    reqEl.style.border = '1px solid';
    resEl.style.border = '1px solid';
    getById('request_headers_details').innerHTML = requestContainer + requestFormContainer;
    getById('response_headers_details').innerHTML = responseContainer;
    getById('web_details_selected_container').style = 'visibility: visible;';
  }

  function deleteCookiesForSelectedDomain() {
    httpTracker.browser.cookies.getAll({
      domain: getById('delete_cookies').value,
    }).then(removeCookies).catch(onError);
  }

  function buildURLDetailsContainer(webEventIdDetails, detailsType) {
    let tableContent = '';
    let headersContent = '';
    if (webEventIdDetails) {
      tableContent = HEADER_CONTENT_BANNER;
      Object.entries(webEventIdDetails).forEach(([key, value]) => {
        if (key !== 'responseHeaders' && key !== 'requestHeaders') { // headers added by browser
          if (!ignoreHeaders.has(key) && value !== undefined && value !== null) {
            if (typeof value !== 'object') {
              tableContent += generateHeaderKeyValueContent(key, value);
            } else {
              const content = Object.entries(value)
                  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                  .join(', ');
              tableContent += generateHeaderKeyValueContent(key, content);
            }
          }
        } else { // application headers
          const headers = sortJsonByProperty(value, 'name');
          headersContent = generateHeaderDetails(headers);
        }
      });
    } else if (detailsType === 'responseDetails') {
      tableContent = RESPONSE_NOT_AVAILABLE;
    } else {
      tableContent = REQUEST_NOT_AVAILABLE;
    }
    return tableContent + headersContent;
  }

  function generateHeaderKeyValueContent(key, value) {
    if (maskFieldsPattern(key)) {
      value = value.toString().trim();
      if (value.length) {
        value = value.charAt(0) + '*****' + value.charAt(value.length - 1);
      }
    }
    return `${HEADER_CONTENT_KEY}${addMarkTag(key)}${HEADER_CONTENT_VALUE}${addMarkTag(value)}</td></tr>`;
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function addMarkTag(text) {
    const escaped = escapeHtml(text);
    if (compiledFindPattern) {
      compiledFindPattern.lastIndex = 0;
      return escaped.replace(compiledFindPattern, (match) => `<mark>${match}</mark>`);
    }
    return escaped;
  }

  function isBinaryData(str) {
    const sampleSize = Math.min(str.length, 500);
    let nonPrintable = 0;
    for (let i = 0; i < sampleSize; i++) {
      const code = str.codePointAt(i);
      if (code === 0xFFFD || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
        nonPrintable++;
      }
    }
    return nonPrintable / sampleSize > 0.15;
  }

  function detectCompressionType(dataView) {
    if (dataView.byteLength < 2) return 'binary';
    const b0 = dataView.getUint8(0);
    const b1 = dataView.getUint8(1);
    if (b0 === 0x1f && b1 === 0x8b) return 'gzip';
    if (b0 === 0x78 && (b1 === 0x9c || b1 === 0xda || b1 === 0x01 || b1 === 0x5e)) return 'deflate';
    if (dataView.byteLength >= 4) {
      const b2 = dataView.getUint8(2);
      const b3 = dataView.getUint8(3);
      if (b0 === 0xfd && b1 === 0x2f && b2 === 0xb5 && b3 === 0x2f) return 'zstd';
      if (b0 === 0x04 && b1 === 0x22 && b2 === 0x4d && b3 === 0x18) return 'lz4';
    }
    return 'compressed or binary';
  }

  function buildRequestFormContainer(webEventIdRequestForm) {
    let formData = '';
    if (webEventIdRequestForm) {
      if (webEventIdRequestForm.formData) {
        formData = '<tr><td colspan=2 class=\'web_event_detail_cookie\'>Body (form fields data)</td></tr>';
        Object.entries(webEventIdRequestForm.formData).forEach(([key, value]) => {
          formData += generateHeaderKeyValueContent(key, value);
        });
      } else if (webEventIdRequestForm.raw) {
        formData = '<tr><td colspan=2 class=\'web_event_detail_cookie\'>Body (raw form data)</td></tr>';
        for (const eachByte of webEventIdRequestForm.raw) {
          const dataView = new DataView(eachByte.bytes);
          const decodedString = decoder.decode(dataView);
          let displayContent;
          if (isBinaryData(decodedString)) {
            const type = detectCompressionType(dataView);
            displayContent = `<span style='color:#888;font-style:italic;'>[Binary data — ${dataView.byteLength} bytes, likely ${type}. Cannot display compressed content.]</span>`;
          } else {
            displayContent = addMarkTag(decodedString);
          }
          formData += `<tr style='white-space: pre-wrap; word-break: break-all;'><td colspan=2>${displayContent}</td></tr>`;
        }
      }
    }
    return formData;
  }

  function generateHeaderDetails(headers) {
    let generalHeadersContent = '';
    let banner = COOKIE_CONTENT_BANNER; // request cookies
    let cookieContent = '';
    const optimizedCookiesMap = new Map();
    headers.forEach((header) => {
      // request cookies
      if (header.name === DELIMITER_REQUEST_COOKIE_KEY_NAME) {
        cookieContent += generateRequestCookieDetails(header.value, DELIMITER_REQUEST_COOKIE);
      }
      // response cookies
      else if (header.name.toLowerCase() === DELIMITER_RESPONSE_COOKIE_KEY_NAME) {
        if (!optimizeResponseCookies) {
          banner = COOKIE_CONTENT_BANNER_UNOPTIMIZED;
          cookieContent += generateResponseCookieDetails(header.value, DELIMITER_RESPONSE_COOKIE);
        } else {
          banner = COOKIE_CONTENT_BANNER_OPTIMIZED;
          setOptimizedCookiesMap(header.value, DELIMITER_RESPONSE_COOKIE, optimizedCookiesMap);
        }
      }
      // other headers
      else {
        generalHeadersContent += generateHeaderKeyValueContent(header.name, header.value);
      }
    });
    if (optimizeResponseCookies) {
      sortMapByKey(optimizedCookiesMap).forEach((value, key) => {
        cookieContent += `${HEADER_CONTENT_KEY}${addMarkTag(key.split(':', 1)[0])}${HEADER_CONTENT_VALUE}${addMarkTag(value.cookieValue)}</td></tr>`;
      });
    }
    if (cookieContent) {
      cookieContent = banner + cookieContent;
    }
    return generalHeadersContent + cookieContent;
  }

  function generateRequestCookieDetails(cookieValue, cookieDelim) {
    // generally request cookies will not be duplicates
    const cookieList = cookieValue.split(cookieDelim).sort(sortArray);
    let cookieContent = '';
    // convert into map to avoid duplicate cookies though request cookies will not be duplicates
    // the order of cookies will be the order in which they were added to map
    const cookieMap = new Map();
    cookieList.forEach((cookie) => {
      if (cookie) {
        const firstOccurance = cookie.indexOf('=');
        if (firstOccurance > -1) {
          cookieMap.set(cookie.substring(0, firstOccurance), cookie.substring(firstOccurance + 1));
        } else {
          cookieMap.set(cookie, '');
        }
      }
    });
    cookieMap.forEach((value, key) => {
      cookieContent += `${HEADER_CONTENT_KEY}${addMarkTag(key)}${HEADER_CONTENT_VALUE}${addMarkTag(value)}</td></tr>`;
    });
    return cookieContent;
  }

  function generateResponseCookieDetails(cookieValue, cookieDelim) {
    const cookieList = cookieValue.split(cookieDelim);
    let cookieContent = '';
    cookieList.forEach((cookie) => {
      if (cookie) {
        const cookieDetails = getCookieNameValue(cookie);
        cookieContent += `${HEADER_CONTENT_KEY}${addMarkTag(cookieDetails.cookieName)}${HEADER_CONTENT_VALUE}${addMarkTag(cookieDetails.cookieValue)}</td></tr>`;
      }
    });
    return cookieContent;
  }

  function setOptimizedCookiesMap(cookieValue, cookieDelim, optimizedCookiesMap) {
    const cookieList = cookieValue.split(cookieDelim); // for FF
    cookieList.forEach((cookie) => {
      if (cookie) {
        let key = '';
        const cookieDetails = getCookieNameValue(cookie);
        if (cookieDetails.cookieName && cookieDetails.domain && cookieDetails.path) {
          key = `${cookieDetails.cookieName}:${cookieDetails.domain}:${cookieDetails.path}`;
        } else if (cookieDetails.cookieName && cookieDetails.domain) {
          key = `${cookieDetails.cookieName}:${cookieDetails.domain}`;
        } else {
          key = `${cookieDetails.cookieName}`;
        }
        optimizedCookiesMap.set(key, cookieDetails);
      }
    });
  }

  function removeCookies(cookies) {
    const removedCookies = [];
    for (const cookie of cookies) {
      const protocol = cookie.secure ? 'https:' : 'http:';
      const cookieUrl = `${protocol}//${cookie.domain}${cookie.path}`;
      const removed = httpTracker.browser.cookies.remove({
        url: cookieUrl,
        name: cookie.name,
        storeId: cookie.storeId,
      });
      removedCookies.push(removed);
    }
    Promise.all(removedCookies).catch(onError);
  }

  function getCookieNameValue(cookie) {
    const firstOccurance = cookie.indexOf('=');
    const cookieObj = {};
    if (firstOccurance > -1) {
      cookieObj.cookieName = cookie.substring(0, firstOccurance);
      cookieObj.cookieValue = cookie.substring(firstOccurance + 1);
      // https://tools.ietf.org/html/rfc6265#page-10
      // https://tools.ietf.org/html/rfc6265#section-4.1.1
      if (cookieObj.cookieValue) {
        (stringToArray(cookieObj.cookieValue, ';') || []).forEach((attribute) => {
          if (attribute) {
            const attributeKeyValue = attribute.trim().split('=');
            // toLowerCase : chrome sends as domain, FF sends as Domain
            if (attributeKeyValue[0].toLowerCase() === 'domain' || attributeKeyValue[0].toLowerCase() === 'path') {
              cookieObj[attributeKeyValue[0].toLowerCase()] = attributeKeyValue[1];
            }
          }
        });
      }
    }
    return cookieObj;
  }

  function displayHiddenURLList() {
    const urlsList = getHiddenUrlsList();
    while (urlsList.length) {
      urlsList[0].classList.remove('web_event_list_hide');
    }
  }

  /**
   * This will be called when
   *  a. On page load - to display only the matched URLs from filter box if not empty
   *  b. For each key entry in the filter box
   *  c. on clear filter button click
   */
  function hideOrShowURLList() { // NOSONAR javascript:S3776
    if (multipleSearchPatterns.length == 0) {
      displayHiddenURLList();
    } else {
      const allUrlsList = Array.prototype.slice.call(getAllUrlsList());
      for (const element of allUrlsList) {
        const string = element.childNodes[filterWithKey].innerHTML.toLowerCase();
        if (!isANDFilter) {
          if (multipleSearchPatterns.some((v) => string.includes(v))) {
            element.classList.remove('web_event_list_hide');
          } else {
            element.classList.add('web_event_list_hide');
          }
        } else {
          let index = 0;
          multipleSearchPatterns.forEach((e) => {
            if (index !== -1) {
              index = string.indexOf(e, index);
              if (index !== -1) {
                index += e.length;
              }
            }
          });
          if (index === -1) {
            element.classList.add('web_event_list_hide');
          } else {
            element.classList.remove('web_event_list_hide');
          }
        }
      }
    }
  }

  function removeEntry(node) {
    const requestIdToRemove = node.id.substring(16, node.id.length);
    requestIdRedirectCount.delete(requestIdToRemove);
    allRequestHeaders.delete(requestIdToRemove);
    allResponseHeaders.delete(requestIdToRemove);
    requestFormData.delete(requestIdToRemove);
    addedRequestId.delete(requestIdToRemove);
    node.remove();
    if (requestIdToRemove === selectedWebEventRequestId) {
      getById('delete_selected_web_event').disabled = true;
      getById('response_headers_details').innerHTML = '';
      getById('request_headers_details').innerHTML = '';
      getById('web_details_selected_container').style = 'visibility: hidden;';
      selectedWebEventRequestId = '';
    }
  }

  /**
   *  This method always returns a live collection of hidden URLs list
   */
  function getHiddenUrlsList() {
    return getById('urls_list').getElementsByClassName('web_event_list_blank web_event_list_hide'); // this returns a live collection
  }

  function getVisibleUrlsList() {
    const allUrls = getAllUrlsList(); // this gives live list
    const visibleUrls = Array.prototype.filter.call(allUrls, function(eachUrl) {
      return !eachUrl.classList.contains('web_event_list_hide');
    });
    return visibleUrls;
  }

  /**
   *  This method always returns a live collection of all URLs list (hidden and not hidden)
   */
  function getAllUrlsList() {
    return getById('urls_list').getElementsByClassName('web_event_list_blank'); // this returns a live collection
  }

  function bindDefaultEvents() {
    getById('track_urls_pattern').oninput = setPatternsToInclude;
    getById('exclude_urls_pattern').oninput = setPatternsToExclude;
    getById('block_urls_pattern').oninput = setPatternsToBlock;
    getById('mask_patterns_list').oninput = setPatternsToMask;
    getById('enable_mask_patterns').onchange = maskFieldsCheckbox;
    getById('include_form_data').onchange = captureFormDataCheckbox;
    getById('optimize_response_cookies').onchange = optimizeResponseCookiesCheckbox;
    getById('filter_web_events').oninput = filterEvents;
    getById('web_event_filter_key').oninput = filterEvents;
    getById('clear_filter_web_events').onclick = clearFilterBoxDisplayAllURLsAndUpdateButtons;
    getById('delete_all_filtered_web_events').onclick = deleteFilteredEvents;
    getById('delete_selected_web_event').onclick = removeSelectedEvent;
    getById('delete_all_web_events').onclick = clearAllEvents;
    getById('urls_list').onclick = setEventRowAsSelected;
    getById('urls_list').onkeydown = updateSelectedEventToContainer;
    getById('toggle_track_web_events').onclick = updateToggleCaptureEvents;
    getById('header_button_remove_0').onclick = clearAndRemoveHeaderContents;
    getById('header_button_add_0').onclick = addNewHeaderContainer;
    getById('add_modify_headers').oninput = generateHeadersToAddOrModify; // either on text change
    getById('find_in_details_pattern').oninput = setFindPatterns;
    getById('delete_cookies_button').onclick = deleteCookiesForSelectedDomain;
    getById('delete_cookies').oninput = function() {
      getById('delete_cookies_button').disabled = !this.value.trim();
    };
    getById('preferences').addEventListener('click', function() {
      openAddonOptions();
    });
  }

  const setFindPatterns = debounce(function(event) {
    findPatterns = event.target.value.trim();
    try {
      compiledFindPattern = findPatterns ? new RegExp(findPatterns, 'gi') : null;
    } catch (e) {
      compiledFindPattern = null;
    }
    displayEventProperties();
  }, inputBoxDelay);

  function generateHeadersToAddOrModify() {
    const headersObject = [];
    const conatiners = getByClassNames('single_header_container');
    Array.prototype.forEach.call(conatiners, function(headerContainer) {
      const nameInput = headerContainer.querySelector('.header_input_name');
      const nameLabel = headerContainer.querySelector('.add_header_name');
      const applyChk = headerContainer.querySelector('.header_input_apply');
      const valueInput = headerContainer.querySelector('.header_input_value');
      const urlInput = headerContainer.querySelector('.header_input_url');

      const headerName = nameInput.value.trim();
      if (headerName) {
        if (!FORBIDDEN_HEADERS.some((v) => headerName.toLowerCase() === v.toLowerCase()) &&
          !FORBIDDEN_HEADERS_PATTERN.some((v) => headerName.toLowerCase().startsWith(v.toLowerCase()))) {
          nameLabel.style.color = '';
          if (applyChk.checked) {
            headersObject.push({name: headerName, value: valueInput.value, url: urlInput.value.trim()});
          }
        } else {
          nameLabel.style.color = 'red';
        }
      }
    });
    updateHeaderModifySessionRules(headersObject);
    if (headersObject.length || conatiners.length) {
      getById('add_modify_headers_banner').innerHTML = `Add/Modify request headers: ${headersObject.length}`;
    } else {
      getById('add_modify_headers_banner').innerHTML = `Add/Modify request headers:`;
    }
  }

  function clearAndRemoveHeaderContents(event) {
    if (event.target.id.substring(21) === '0') {
      getById('header_name_0').value = '';
      getById('header_value_0').value = '';
      getById('header_url_0').value = '';
    } else {
      getById('header_details_' + event.target.id.substring(21)).remove();
    }
    generateHeadersToAddOrModify();
  }

  function addNewHeaderContainer() {
    const currentContainers = getByClassNames('single_header_container');
    const nextIndex = currentContainers.length;

    const headerDiv = document.createElement('div');
    headerDiv.id = 'header_details_' + nextIndex;
    headerDiv.classList = 'single_header_container';

    const urlDiv = document.createElement('div');
    urlDiv.classList = 'add_header_url';
    const urlLabel = document.createElement('label');
    urlLabel.htmlFor = 'header_url_' + nextIndex;
    urlLabel.textContent = 'URL';
    const urlInput = document.createElement('input');
    urlInput.setAttribute('type', 'text');
    urlInput.id = 'header_url_' + nextIndex;
    urlInput.classList = 'header_input_url';
    urlInput.placeholder = 'e.g. api.example.com (blank = all URLs)';
    urlDiv.append(urlLabel, ' ', urlInput);

    const valueDiv = document.createElement('div');
    valueDiv.classList = 'add_header_value';
    const valueLabel = document.createElement('label');
    valueLabel.htmlFor = 'header_value_' + nextIndex;
    valueLabel.textContent = 'Value';
    const valueInput = document.createElement('input');
    valueInput.setAttribute('type', 'text');
    valueInput.id = 'header_value_' + nextIndex;
    valueInput.classList = 'header_input_value';
    valueInput.placeholder = 'e.g. my-value';
    valueDiv.append(valueLabel, ' ', valueInput);

    const nameDiv = document.createElement('div');
    nameDiv.classList = 'add_header_name';
    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = 'header_name_' + nextIndex;
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.setAttribute('type', 'text');
    nameInput.id = 'header_name_' + nextIndex;
    nameInput.classList = 'header_input_name';
    nameInput.placeholder = 'e.g. X-Custom-Header';
    nameDiv.append(nameLabel, ' ', nameInput);

    const applyDiv = document.createElement('div');
    applyDiv.classList = 'add_header_apply';
    const applyInput = document.createElement('input');
    applyInput.setAttribute('type', 'checkbox');
    applyInput.id = 'header_apply_' + nextIndex;
    applyInput.classList = 'header_input_apply';
    const applyLabel = document.createElement('label');
    applyLabel.htmlFor = 'header_apply_' + nextIndex;
    applyLabel.innerHTML = 'Apply';
    applyDiv.append(applyInput, applyLabel);

    const headerButtonsDiv = document.createElement('div');
    headerButtonsDiv.style = 'width: 12%;float: left;text-align: right;';

    const simpleDiv = document.createElement('div');
    simpleDiv.style = 'display: flex;';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '-';
    removeButton.id = 'header_button_remove_' + nextIndex;
    removeButton.onclick = clearAndRemoveHeaderContents;

    const removeDiv = document.createElement('div');
    removeDiv.style = 'margin-right: 5px;float: left;flex-grow: 1;';
    removeDiv.append(removeButton);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = '+';
    addButton.style.visibility = 'hidden';

    const addDiv = document.createElement('div');
    addDiv.append(addButton);

    simpleDiv.append(removeDiv, addDiv);
    headerButtonsDiv.append(simpleDiv);
    headerDiv.append(nameDiv, valueDiv, urlDiv, applyDiv, headerButtonsDiv);
    currentContainers[nextIndex - 1].after(headerDiv);
  }

  function updateToggleCaptureEvents() {
    if (toggleCaptureEvents) {
      toggleCaptureEvents = false;
      getById('toggle_track_web_events').innerHTML = 'Resume tracker';
    } else {
      toggleCaptureEvents = true;
      getById('toggle_track_web_events').innerHTML = 'Pause tracker';
    }
  }

  function captureFormDataCheckbox() {
    captureFormDataCheckboxValue = getById('include_form_data').checked;
  }

  function optimizeResponseCookiesCheckbox() {
    optimizeResponseCookies = getById('optimize_response_cookies').checked;
    displayEventProperties();
  }

  function maskFieldsCheckbox() {
    maskAttributesCheckboxValue = getById('enable_mask_patterns').checked;
    displayEventProperties();
  }

  const setPatternsToMask = debounce(function(event) {
    maskedAttributesList = stringToArray(event.target.value);
    displayEventProperties();
  }, inputBoxDelay);

  function clearAllEvents() {
    requestFormData.clear();
    allRequestHeaders.clear();
    allResponseHeaders.clear();
    addedRequestId.clear();
    requestIdRedirectCount.clear();
    selectedWebEventRequestId = '';
    getById('web_event_details_selected_request').style.border = 'none';
    getById('web_event_details_selected_response').style.border = 'none';
    getById('response_headers_details').innerHTML = '';
    getById('request_headers_details').innerHTML = '';
    Array.from(getByClassNames('web_event_list_blank')).forEach((el) => el.remove());
    getById('web_details_selected_container').style = 'visibility: hidden;';
  }

  function deleteFilteredEvents() {
    const visibleUrlList = getVisibleUrlsList();
    if (visibleUrlList) {
      for (const node of visibleUrlList) {
        removeEntry(node);
      }
    }
    clearFilterBoxDisplayAllURLsAndUpdateButtons();
  }

  function clearFilterBoxDisplayAllURLsAndUpdateButtons() {
    clearFilterBox();
    hideOrShowURLList();
    updateAllButtons();
  }

  function clearFilterBox() {
    filterWithValue = getById('filter_web_events').value = '';
    multipleSearchPatterns = '';
  }

  function updateSelectedEventToContainer(event) {
    const selectedEvent = getSelectedEvent();
    selectNextEligibleEvent(selectedEvent, event.key);
  }

  function selectNextEligibleEvent(selectedEvent, key) { // NOSONAR javascript:S3776
    if (key === 'ArrowDown') {
      let nextElement = selectedEvent ? selectedEvent.nextElementSibling : selectedEvent;
      while (nextElement) {
        if (nextElement.classList.contains('web_event_list_hide')) {
          nextElement = nextElement.nextElementSibling;
        } else {
          markSelectedRequest(nextElement.id);
          break;
        }
      }
    } else if (key === 'ArrowUp') {
      let previousElement = selectedEvent ? selectedEvent.previousElementSibling : selectedEvent;
      while (previousElement) {
        if (previousElement.classList.contains('web_event_list_hide')) {
          previousElement = previousElement.previousElementSibling;
        } else {
          markSelectedRequest(previousElement.id);
          break;
        }
      }
    }
  }

  function removeSelectedEvent() {
    let selectedEvent = getSelectedEvent();
    if (selectedEvent) {
      removeEntry(selectedEvent);
      getById('delete_selected_web_event').disabled = true;
      selectedEvent = null;
    }
  }

  function setEventRowAsSelected(event) {
    if (event.target?.parentElement.classList.contains('web_event_list_blank')) {
      markSelectedRequest(event.target.parentElement.id);
      getById('delete_selected_web_event').disabled = false;
      getById('delete_selected_web_event').classList.remove('web_event_list_filtered');
    }
  }

  const filterEvents = debounce(function() {
    updateFilterOptions();
    hideOrShowURLList();
    updateAllButtons();
  }, inputBoxDelay);

  function updateFilterOptions() {
    filterWithKey = getById('web_event_filter_key').selectedOptions[0].value; // get the selected key(index) from drop down
    filterWithValue = getById('filter_web_events').value.toLowerCase().trim(); // get the value from filter text box
    isANDFilter = false;
    multipleSearchPatterns = '';
    if (filterWithValue) {
      if (filterWithValue.length < 3 || (filterWithValue.includes(DELIMITER_OR) && filterWithValue.includes(DELIMITER_AND))) {
        // invalid search filter text, do nothing
      } else {
        if (filterWithValue.includes(DELIMITER_AND)) {
          multipleSearchPatterns = stringToArray(filterWithValue, DELIMITER_AND);
          multipleSearchPatterns = filterWithLength(multipleSearchPatterns, 2);
        } else {
          multipleSearchPatterns = stringToArray(filterWithValue, DELIMITER_OR);
          multipleSearchPatterns = filterWithLength(multipleSearchPatterns, 2);
          isANDFilter = false;
        }
      }
    }
  }

  const setPatternsToExclude = debounce(function(event) {
    excludeURLsList = stringToArray(event.target.value);
  }, inputBoxDelay);

  const setPatternsToBlock = debounce(function(event) {
    blockURLSList = stringToArray(event.target.value);
    updateBlockSessionRules(blockURLSList || []);
  }, inputBoxDelay);

  const setPatternsToInclude = debounce(function(event) {
    includeURLsList = stringToArray(event.target.value);
  }, inputBoxDelay);

  function setInitialStateOfPage() {
    filterWithValue = getById('filter_web_events').value;
    captureFormDataCheckboxValue = getById('include_form_data').checked;
    optimizeResponseCookies = getById('optimize_response_cookies').checked;
    includeURLsList = stringToArray(getById('track_urls_pattern').value);
    excludeURLsList = stringToArray(getById('exclude_urls_pattern').value);
    maskedAttributesList = stringToArray(getById('mask_patterns_list').value);
    maskAttributesCheckboxValue = getById('enable_mask_patterns').checked;
    blockURLSList = stringToArray(getById('block_urls_pattern').value);
    updateAllButtons();
    hideOrShowURLList();
    hideOrShowInfoIcons();
  }

  function updateInfoIcon(elementId, list) {
    const element = getById(elementId);
    if (list?.length) {
      element.innerHTML = '&#9432;';
      element.title = `Patterns extended from preferences: ${list}`;
      element.style.color = 'red';
    } else {
      element.innerHTML = '';
      element.title = '';
      element.style.color = '';
    }
  }

  function hideOrShowInfoIcons() {
    updateInfoIcon('info_include', globalIncludeURLsList);
    updateInfoIcon('info_exclude', globalExcludeURLsList);
    updateInfoIcon('info_mask',    globalMaskPatternsList);
  }

  function updateAllButtons() {
    updateButonClearFilterWebEvents();
    updateButonDeleteSelectedWebEvent();
    updateButonDeleteAllFilteredWebEvents();
  }

  function updateButonClearFilterWebEvents() {
    if (!filterWithValue) {
      getById('clear_filter_web_events').disabled = true;
    } else {
      getById('clear_filter_web_events').disabled = false;
    }
  }

  function updateButonDeleteAllFilteredWebEvents() {
    if (filterWithValue?.length > 2) {
      const visibleUrlList = getVisibleUrlsList();
      if (visibleUrlList?.length > 0) {
        getById('delete_all_filtered_web_events').disabled = false;
      } else {
        getById('delete_all_filtered_web_events').disabled = true;
      }
    } else {
      getById('delete_all_filtered_web_events').disabled = true;
    }
  }

  function updateButonDeleteSelectedWebEvent() {
    const selectedEvent = getSelectedEvent();
    if (!selectedEvent) {
      getById('delete_selected_web_event').disabled = true;
    }
  }

  function markSelectedRequest(requestId) {
    getById('web_event_detail_request_head').style.removeProperty('display');
    getById('web_event_detail_response_head').style.removeProperty('display');
    deselectEvent();
    const element = getById(requestId);
    element.classList.add('web_event_list_selected');
    selectedWebEventRequestId = requestId.substring(16);
    displayEventProperties();
  }

  function deselectEvent() {
    const selectedEvent = getSelectedEvent();
    if (selectedEvent) {
      selectedEvent.classList.remove('web_event_list_selected');
    }
  }

  function getSelectedEvent() {
    return getByClassNames('web_event_list_selected')[0];
  }

  document.addEventListener('DOMContentLoaded', function() {
    document.title = getManifestDetails().title;
    bindDefaultEvents();
    setInitialStateOfPage();
  });

  function getGlobalOptions(details) {
    globalExcludeURLsList = getPropertyFromStorage(details, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN);
    globalMaskPatternsList = getPropertyFromStorage(details, httpTracker.STORAGE_KEY_MASK_PATTERN);
    globalIncludeURLsList = getPropertyFromStorage(details, httpTracker.STORAGE_KEY_INCLUDE_PATTERN);
    hideOrShowInfoIcons();
  }

  function getChangesFromStorage(changes) {
    for (const key in changes) {
      if (key === httpTracker.STORAGE_KEY_EXCLUDE_PATTERN) {
        globalExcludeURLsList = changes[key].newValue;
      } else if (key === httpTracker.STORAGE_KEY_INCLUDE_PATTERN) {
        globalIncludeURLsList = changes[key].newValue;
      } else if (key === httpTracker.STORAGE_KEY_MASK_PATTERN) {
        globalMaskPatternsList = changes[key].newValue;
      }
    }
    hideOrShowInfoIcons();
    displayEventProperties();
  }

  httpTracker.browser.storage.onChanged.addListener(getChangesFromStorage);
  httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_INCLUDE_PATTERN, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN, httpTracker.STORAGE_KEY_MASK_PATTERN], getGlobalOptions);

  window.addEventListener('beforeunload', clearAllSessionRules);

  return {
    logRequestDetails: logRequestDetails,
  };
})();
