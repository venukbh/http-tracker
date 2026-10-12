const eventTracker = (function() {
  const addedRequestId = new Set();
  const allRequestHeaders = new Map();
  const allResponseHeaders = new Map();
  let captureFormDataCheckboxValue = false;
  const decoder = new TextDecoder('UTF-8');
  const inputBoxDelay = 500;
  let filterWithKey = '0';
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
  let multipleSearchPatterns = [];
  let isANDFilter = false;
  let excludeURLsList;
  let includeURLsList;
  let blockURLSList;
  let headerRowCounter = 1;

  const CLASS_LIST_TO_ADD = `web_event_list_blank web_event_list_style`;
  const HEADER_CONTENT_BANNER = `<tr><td colspan=2 class='web_event_detail_cookie'>Headers</td></tr>`;
  const COOKIE_CONTENT_BANNER = `<tr><td colspan=2 class='web_event_detail_cookie'>Cookies (sorted: symbols, 0-9, Aa-Zz)</td></tr>`;
  const COOKIE_CONTENT_BANNER_OPTIMIZED = `<tr><td colspan=2 class='web_event_detail_cookie'>Cookies (optimized)</td></tr>`;
  const COOKIE_CONTENT_BANNER_UNOPTIMIZED = `<tr><td colspan=2 class='web_event_detail_cookie'>Cookies (unoptimized)</td></tr>`;
  const ignoreHeaders = new Set(['frameAncestors', 'frameId', 'parentFrameId', 'tabId', 'timeStamp', 'type', 'callerName', 'requestIdEnhanced', 'requestId']);
  const REQUEST_NOT_AVAILABLE = `<tr><td class='web_event_style_error' style='text-align: center;'>Request not available</td></tr>`;
  const RESPONSE_NOT_AVAILABLE = `<tr><td class='web_event_style_error' style='text-align: center;'>Response not available</td></tr>`;
  const HEADER_CONTENT_KEY = `<tr><td class='web_event_detail_header_key'>`;
  const HEADER_CONTENT_VALUE = `</td><td class='web_event_detail_header_value'>`;

  // Synchronous by design: async is unnecessary without await and would turn runtime errors into unhandled rejections
  function logRequestDetails(webEvent) {
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
    return urlMatchIncludePattern(webEvent) && !urlMatchExcludePattern(webEvent);
  }

  function urlMatchIncludePattern(webEvent) {
    if (webEvent.requestIdEnhanced.includes('fakeRequest')) {
      return false;
    }
    const includeList = normalizePatterns(includeURLsList);
    const globalIncludeList = normalizePatterns(globalIncludeURLsList);
    if (!includeList.length && !globalIncludeList.length) {
      return true;
    }
    const url = (webEvent.url || '').toLowerCase();
    return Boolean(includeList.some((v) => url.includes(v.toLowerCase())) ||
      globalIncludeList.some((v) => url.includes(v.toLowerCase())));
  }

  function urlMatchExcludePattern(webEvent) {
    const url = (webEvent.url || '').toLowerCase();
    const excludeList = normalizePatterns(excludeURLsList);
    const globalExcludeList = normalizePatterns(globalExcludeURLsList);
    return Boolean(excludeList.some((v) => url.includes(v.toLowerCase())) ||
      globalExcludeList.some((v) => url.includes(v.toLowerCase())));
  }

  function maskFieldsPattern(value) {
    if (!maskAttributesCheckboxValue || !value) {
      return false;
    }
    const target = value.toString().toLowerCase();
    const maskList = normalizePatterns(maskedAttributesList);
    const globalMaskList = normalizePatterns(globalMaskPatternsList);
    return Boolean(maskList.some((v) => target.includes(v.toLowerCase())) ||
      globalMaskList.some((v) => target.includes(v.toLowerCase())));
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
    if (multipleSearchPatterns.length > 0) {
      updateButtonDeleteAllFilteredWebEvents();
    }
  }

  function addEventList(webEvent) {
    addedRequestId.add(webEvent.requestIdEnhanced);
    const containerContent = `<div title='Click to view details' class='${CLASS_LIST_TO_ADD}' id='web_events_list_${webEvent.requestIdEnhanced}' data-request-id='${webEvent.requestIdEnhanced}' data-raw-request-id='${webEvent.requestId}'>` +
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
    getById(`web_event_cache_${webEvent.requestIdEnhanced}`).innerHTML = webEvent.fromCache ?? 'N/A';
  }

  function matchesFilter(text) {
    if (multipleSearchPatterns.length === 0) {
      return true;
    }
    const str = (text || '').toString().toLowerCase();
    if (!isANDFilter) {
      return multipleSearchPatterns.some((v) => str.includes(v));
    }
    let index = 0;
    for (const pattern of multipleSearchPatterns) {
      index = str.indexOf(pattern, index);
      if (index === -1) {
        return false;
      }
      index += pattern.length;
    }
    return true;
  }

  function applyFilterToElement(element) {
    const text = element.childNodes[filterWithKey]?.textContent || '';
    if (matchesFilter(text)) {
      element.classList.remove('web_event_list_hide');
    } else {
      element.classList.add('web_event_list_hide');
    }
  }

  function filterEventList(webEvent) {
    if (multipleSearchPatterns.length === 0) {
      return;
    }
    const element = getById(`web_events_list_${webEvent.requestIdEnhanced}`);
    if (element) {
      applyFilterToElement(element);
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
    return `<div class='web_event_list_cache' id='web_event_cache_${webEvent.requestIdEnhanced}'>${webEvent.fromCache ?? 'N/A'}</div>`;
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
    if (!selectedWebEventRequestId) {
      return;
    }
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
    const rawInput = getById('delete_cookies').value.trim();
    if (!rawInput) {
      return;
    }
    const domain = rawInput.replace(/^https?:\/\//i, '').split('/')[0];
    httpTracker.browser.cookies.getAll({
      domain,
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
            const content = typeof value !== 'object' ?
              value :
              Object.entries(value).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
            tableContent += generateHeaderKeyValueContent(key, content);
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

  function maskValue(key, value) {
    if (maskFieldsPattern(key)) {
      const str = value?.toString().trim() ?? '';
      if (str.length > 2) {
        return str.charAt(0) + '*****' + str.charAt(str.length - 1);
      }
      if (str.length > 0) {
        return '*****';
      }
    }
    return value;
  }

  function generateHeaderKeyValueContent(key, value) {
    const displayVal = maskValue(key, value);
    return `${HEADER_CONTENT_KEY}${addMarkTag(key)}${HEADER_CONTENT_VALUE}${addMarkTag(displayVal)}</td></tr>`;
  }

  function addMarkTag(text) {
    if (text === null || text === undefined) {
      return '';
    }
    const str = String(text);
    if (!compiledFindPattern) {
      return escapeHtml(str);
    }
    compiledFindPattern.lastIndex = 0;
    let result = '';
    let lastIndex = 0;
    let match = compiledFindPattern.exec(str);
    while (match !== null) {
      if (match[0].length === 0) {
        compiledFindPattern.lastIndex++;
        if (match.index >= str.length) {
          break;
        }
        match = compiledFindPattern.exec(str);
        continue;
      }
      result += escapeHtml(str.slice(lastIndex, match.index));
      result += `<mark>${escapeHtml(match[0])}</mark>`;
      lastIndex = match.index + match[0].length;
      match = compiledFindPattern.exec(str);
    }
    result += escapeHtml(str.slice(lastIndex));
    return result;
  }

  function buildRequestFormContainer(webEventIdRequestForm) {
    let formData = '';
    if (webEventIdRequestForm) {
      if (webEventIdRequestForm.formData) {
        formData = `<tr><td colspan=2 class='web_event_detail_cookie'>Body (form fields data)</td></tr>`;
        Object.entries(webEventIdRequestForm.formData).forEach(([key, value]) => {
          formData += generateHeaderKeyValueContent(key, value);
        });
      } else if (webEventIdRequestForm.raw) {
        formData = `<tr><td colspan=2 class='web_event_detail_cookie'>Body (raw form data)</td></tr>`;
        for (const eachByte of webEventIdRequestForm.raw) {
          if (!eachByte.bytes) {
            if (eachByte.file) {
              formData += `<tr style='white-space: pre-wrap; word-break: break-all;'><td colspan=2><span style='color:#888;font-style:italic;'>[File upload: ${escapeHtml(eachByte.file)}]</span></td></tr>`;
            }
            continue;
          }
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
        cookieContent += generateHeaderKeyValueContent(key.split(':', 1)[0], value.cookieValue);
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
        const firstOccurrence = cookie.indexOf('=');
        if (firstOccurrence > -1) {
          cookieMap.set(cookie.substring(0, firstOccurrence), cookie.substring(firstOccurrence + 1));
        } else {
          cookieMap.set(cookie, '');
        }
      }
    });
    cookieMap.forEach((value, key) => {
      cookieContent += generateHeaderKeyValueContent(key, value);
    });
    return cookieContent;
  }

  function generateResponseCookieDetails(cookieValue, cookieDelim) {
    const cookieList = cookieValue.split(cookieDelim);
    let cookieContent = '';
    cookieList.forEach((cookie) => {
      if (cookie) {
        const cookieDetails = getCookieNameValue(cookie);
        cookieContent += generateHeaderKeyValueContent(cookieDetails.cookieName, cookieDetails.cookieValue);
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
  function hideOrShowURLList() {
    if (multipleSearchPatterns.length === 0) {
      displayHiddenURLList();
    } else {
      for (const element of getAllUrlsList()) {
        applyFilterToElement(element);
      }
    }
  }

  function removeEntry(node) {
    const requestIdToRemove = node.dataset.requestId;
    const rawRequestId = node.dataset.rawRequestId || requestIdToRemove.replace(/_\d+$/, '');
    requestIdRedirectCount.delete(rawRequestId);
    requestIdRedirectCount.delete(requestIdToRemove);
    allRequestHeaders.delete(requestIdToRemove);
    allResponseHeaders.delete(requestIdToRemove);
    requestFormData.delete(requestIdToRemove);
    addedRequestId.delete(requestIdToRemove);
    node.remove();
    if (requestIdToRemove === selectedWebEventRequestId) {
      getById('delete_selected_web_event').disabled = true;
      getById('web_event_detail_request_head').style.display = 'none';
      getById('web_event_detail_response_head').style.display = 'none';
      getById('response_headers_details').innerHTML = '';
      getById('request_headers_details').innerHTML = '';
      getById('web_details_selected_container').style = 'visibility: hidden;';
      selectedWebEventRequestId = '';
    }
    updateButtonDeleteAllFilteredWebEvents();
  }

  /**
   *  This method always returns a live collection of hidden URLs list
   */
  function getHiddenUrlsList() {
    return getById('urls_list').getElementsByClassName('web_event_list_blank web_event_list_hide'); // this returns a live collection
  }

  function getVisibleUrlsList() {
    return Array.from(getAllUrlsList()).filter((eachUrl) => !eachUrl.classList.contains('web_event_list_hide'));
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
    getById('add_modify_headers').oninput = debouncedGenerateHeadersToAddOrModify; // either on text change
    getById('find_in_details_pattern').oninput = setFindPatterns;
    getById('delete_cookies_button').onclick = deleteCookiesForSelectedDomain;
    getById('delete_cookies').oninput = function(event) {
      getById('delete_cookies_button').disabled = !event.target.value.trim();
    };
    getById('preferences').addEventListener('click', function() {
      openAddonOptions();
    });
  }

  const debouncedGenerateHeadersToAddOrModify = debounce(generateHeadersToAddOrModify, inputBoxDelay);

  const setFindPatterns = debounce(function(event) {
    findPatterns = event.target.value.trim();
    try {
      compiledFindPattern = findPatterns ? new RegExp(findPatterns, 'gi') : null;
    } catch {
      compiledFindPattern = null;
    }
    displayEventProperties();
  }, inputBoxDelay);

  function generateHeadersToAddOrModify() {
    const headersObject = [];
    const containers = getByClassNames('single_header_container');
    for (const headerContainer of containers) {
      const nameInput = headerContainer.querySelector('.header_input_name');
      const nameLabel = headerContainer.querySelector('.add_header_name');
      const applyChk = headerContainer.querySelector('.header_input_apply');
      const valueInput = headerContainer.querySelector('.header_input_value');
      const urlInput = headerContainer.querySelector('.header_input_url');

      const headerName = nameInput.value.trim();
      const isValidHeaderName = RFC_HEADER_NAME_REGEX.test(headerName);
      if (headerName) {
        if (isValidHeaderName &&
          !FORBIDDEN_HEADERS.some((v) => headerName.toLowerCase() === v.toLowerCase()) &&
          !FORBIDDEN_HEADERS_PATTERN.some((v) => headerName.toLowerCase().startsWith(v.toLowerCase()))) {
          nameLabel.style.color = '';
          if (applyChk.checked) {
            headersObject.push({name: headerName, value: valueInput.value, url: urlInput.value.trim()});
          }
        } else {
          nameLabel.style.color = 'red';
        }
      } else {
        nameLabel.style.color = '';
      }
    }
    updateHeaderModifySessionRules(headersObject);
    const count = (headersObject.length || containers.length) ? ` ${headersObject.length}` : '';
    getById('add_modify_headers_banner').innerHTML = `Add/Modify request headers:${count}`;
  }

  function clearAndRemoveHeaderContents(event) {
    const index = event.target.dataset.headerIndex;
    if (index === '0') {
      getById('header_name_0').value = '';
      getById('header_value_0').value = '';
      getById('header_url_0').value = '';
      getById('header_apply_0').checked = false;
      const nameLabel = getById('header_details_0')?.querySelector('.add_header_name');
      if (nameLabel) {
        nameLabel.style.color = '';
      }
    } else {
      const container = event.target.closest('.single_header_container');
      if (container) {
        container.remove();
      }
    }
    generateHeadersToAddOrModify();
  }

  function addNewHeaderContainer() {
    const nextIndex = headerRowCounter++;

    const headerDiv = document.createElement('div');
    headerDiv.id = `header_details_${nextIndex}`;
    headerDiv.className = 'single_header_container';

    const urlDiv = document.createElement('div');
    urlDiv.className = 'add_header_url';
    const urlLabel = document.createElement('label');
    urlLabel.htmlFor = `header_url_${nextIndex}`;
    urlLabel.textContent = 'URL';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.id = `header_url_${nextIndex}`;
    urlInput.className = 'header_input_url';
    urlInput.placeholder = 'e.g. api.example.com (blank = all URLs)';
    urlDiv.append(urlLabel, ' ', urlInput);

    const valueDiv = document.createElement('div');
    valueDiv.className = 'add_header_value';
    const valueLabel = document.createElement('label');
    valueLabel.htmlFor = `header_value_${nextIndex}`;
    valueLabel.textContent = 'Value';
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.id = `header_value_${nextIndex}`;
    valueInput.className = 'header_input_value';
    valueInput.placeholder = 'e.g. my-value';
    valueDiv.append(valueLabel, ' ', valueInput);

    const nameDiv = document.createElement('div');
    nameDiv.className = 'add_header_name';
    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = `header_name_${nextIndex}`;
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = `header_name_${nextIndex}`;
    nameInput.className = 'header_input_name';
    nameInput.placeholder = 'e.g. X-Custom-Header';
    nameDiv.append(nameLabel, ' ', nameInput);

    const applyDiv = document.createElement('div');
    applyDiv.className = 'add_header_apply';
    const applyInput = document.createElement('input');
    applyInput.type = 'checkbox';
    applyInput.id = `header_apply_${nextIndex}`;
    applyInput.className = 'header_input_apply';
    const applyLabel = document.createElement('label');
    applyLabel.htmlFor = `header_apply_${nextIndex}`;
    applyLabel.textContent = 'Apply';
    applyDiv.append(applyInput, applyLabel);

    const headerButtonsDiv = document.createElement('div');
    headerButtonsDiv.style = 'width: 12%;float: left;text-align: right;';

    const simpleDiv = document.createElement('div');
    simpleDiv.style = 'display: flex;';

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '-';
    removeButton.id = `header_button_remove_${nextIndex}`;
    removeButton.dataset.headerIndex = nextIndex;
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
    getById('add_modify_headers').appendChild(headerDiv);
  }

  function updateToggleCaptureEvents() {
    toggleCaptureEvents = !toggleCaptureEvents;
    getById('toggle_track_web_events').innerHTML = toggleCaptureEvents ? 'Pause tracker' : 'Resume tracker';
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
    getById('web_event_detail_request_head').style.display = 'none';
    getById('web_event_detail_response_head').style.display = 'none';
    getById('response_headers_details').innerHTML = '';
    getById('request_headers_details').innerHTML = '';
    Array.from(getByClassNames('web_event_list_blank')).forEach((el) => el.remove());
    getById('web_details_selected_container').style = 'visibility: hidden;';
    updateAllButtons();
  }

  function deleteFilteredEvents() {
    for (const node of getVisibleUrlsList()) {
      removeEntry(node);
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
    multipleSearchPatterns = [];
  }

  function updateSelectedEventToContainer(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const selectedEvent = getSelectedEvent();
      selectNextEligibleEvent(selectedEvent, event.key);
    }
  }

  function selectNextEligibleEvent(selectedEvent, key) { // NOSONAR javascript:S3776
    const isDown = key === 'ArrowDown';
    let current = isDown
      ? (selectedEvent?.nextElementSibling ?? getById('urls_list')?.firstElementChild)
      : selectedEvent?.previousElementSibling;
    while (current) {
      if (current.classList.contains('web_event_list_blank') && !current.classList.contains('web_event_list_hide')) {
        markSelectedRequest(current.id);
        current.scrollIntoView({block: 'nearest'});
        break;
      }
      current = isDown ? current.nextElementSibling : current.previousElementSibling;
    }
  }

  function removeSelectedEvent() {
    const selectedEvent = getSelectedEvent();
    if (selectedEvent) {
      removeEntry(selectedEvent);
      getById('delete_selected_web_event').disabled = true;
    }
  }

  function setEventRowAsSelected(event) {
    if (event.target?.parentElement?.classList.contains('web_event_list_blank')) {
      markSelectedRequest(event.target.parentElement.id);
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
    multipleSearchPatterns = [];
    if (filterWithValue) {
      if (filterWithValue.length < 3 || (filterWithValue.includes(DELIMITER_OR) && filterWithValue.includes(DELIMITER_AND))) {
        // invalid search filter text, do nothing
      } else if (filterWithValue.includes(DELIMITER_AND)) {
        multipleSearchPatterns = filterWithLength(stringToArray(filterWithValue, DELIMITER_AND), 2);
        isANDFilter = true;
      } else {
        multipleSearchPatterns = filterWithLength(stringToArray(filterWithValue, DELIMITER_OR), 2);
        isANDFilter = false;
      }
    }
  }

  const setPatternsToExclude = debounce(function(event) {
    excludeURLsList = stringToArray(event.target.value);
  }, inputBoxDelay);

  const setPatternsToBlock = debounce(function(event) {
    blockURLSList = stringToArray(event.target.value);
    updateBlockSessionRules(blockURLSList ?? []);
  }, inputBoxDelay);

  const setPatternsToInclude = debounce(function(event) {
    includeURLsList = stringToArray(event.target.value);
  }, inputBoxDelay);

  function setInitialStateOfPage() {
    filterWithKey = getById('web_event_filter_key')?.value ?? '0';
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
    clearAllSessionRules().then(() => {
      if (blockURLSList?.length) {
        updateBlockSessionRules(blockURLSList);
      }
      generateHeadersToAddOrModify();
    }).catch(onError);
  }

  function updateInfoIcon(elementId, list) {
    const element = getById(elementId);
    const normalized = normalizePatterns(list);
    if (normalized.length) {
      element.innerHTML = '&#9432;';
      element.title = `Patterns extended from preferences: ${arrayToString(normalized)}`;
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
    updateButtonClearFilterWebEvents();
    updateButtonDeleteSelectedWebEvent();
    updateButtonDeleteAllFilteredWebEvents();
  }

  function updateButtonClearFilterWebEvents() {
    getById('clear_filter_web_events').disabled = !filterWithValue;
  }

  function updateButtonDeleteAllFilteredWebEvents() {
    const isEnabled = multipleSearchPatterns.length > 0 && (getVisibleUrlsList()?.length > 0);
    getById('delete_all_filtered_web_events').disabled = !isEnabled;
  }

  function updateButtonDeleteSelectedWebEvent() {
    const selectedEvent = getSelectedEvent();
    if (!selectedEvent) {
      getById('delete_selected_web_event').disabled = true;
    }
  }

  function markSelectedRequest(requestId) {
    const element = getById(requestId);
    if (!element?.classList.contains('web_event_list_blank')) {
      return;
    }
    getById('web_event_detail_request_head').style.removeProperty('display');
    getById('web_event_detail_response_head').style.removeProperty('display');
    deselectEvent();
    element.classList.add('web_event_list_selected');
    selectedWebEventRequestId = element.dataset.requestId;
    getById('delete_selected_web_event').disabled = false;
    getById('delete_selected_web_event').classList.remove('web_event_list_filtered');
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
    globalExcludeURLsList = normalizePatterns(getPropertyFromStorage(details, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN));
    globalMaskPatternsList = normalizePatterns(getPropertyFromStorage(details, httpTracker.STORAGE_KEY_MASK_PATTERN));
    globalIncludeURLsList = normalizePatterns(getPropertyFromStorage(details, httpTracker.STORAGE_KEY_INCLUDE_PATTERN));
    hideOrShowInfoIcons();
  }

  function getChangesFromStorage(changes) {
    if (changes?.[httpTracker.STORAGE_KEY_EXCLUDE_PATTERN]) {
      globalExcludeURLsList = normalizePatterns(changes[httpTracker.STORAGE_KEY_EXCLUDE_PATTERN].newValue);
    }
    if (changes?.[httpTracker.STORAGE_KEY_INCLUDE_PATTERN]) {
      globalIncludeURLsList = normalizePatterns(changes[httpTracker.STORAGE_KEY_INCLUDE_PATTERN].newValue);
    }
    if (changes?.[httpTracker.STORAGE_KEY_MASK_PATTERN]) {
      globalMaskPatternsList = normalizePatterns(changes[httpTracker.STORAGE_KEY_MASK_PATTERN].newValue);
    }
    hideOrShowInfoIcons();
    displayEventProperties();
  }

  httpTracker.browser.storage.onChanged.addListener(getChangesFromStorage);
  httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_INCLUDE_PATTERN, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN, httpTracker.STORAGE_KEY_MASK_PATTERN], getGlobalOptions);

  let trackerSessionPort = null;
  function connectSessionPort() {
    try {
      trackerSessionPort = httpTracker.browser.runtime.connect({ name: 'http-tracker-session' });
      trackerSessionPort.onDisconnect.addListener(() => {
        trackerSessionPort = null;
      });
    } catch (e) {
      onError(e);
    }
  }
  connectSessionPort();

  window.addEventListener('beforeunload', clearAllSessionRules);

  return {
    logRequestDetails: logRequestDetails,
  };
})();
