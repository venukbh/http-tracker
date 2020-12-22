let eventTracker = (function() {
  let addedRequestId = [];
  let allRequestHeaders = new Map();
  let allResponseHeaders = new Map();
  let captureFormDataCheckboxValue = false;
  let decoder = new TextDecoder("UTF-8");
  let filterInputBoxDelay = 500;
  let filterPatternsToExcludeTimeout = null;
  let setPatternsToBlockTimeout = null;
  let filterPatternsToIncludeTimeout = null;
  let filterPatternsToMaskTimeout = null;
  let filterWithKey = "";
  let filterWithValue = "";
  let filterWithValueTimeout = null;
  let globalExcludeURLsList;
  let globalMaskPatternsList;
  let maskAttributesCheckboxValue = false;
  let maskedAttributesList;
  let optimizeResponseCookies;
  let requestFormData = new Map();
  let requestIdRedirectCount = new Map();
  let selectedWebEventRequestId = "";
  let toggleCaptureEvents = true;

  const CLASS_LIST_TO_ADD = `web_event_list_blank web_event_list_style`;
  const HEADER_CONTENT_BANNER = `<tr><td colspan=2 class='web_event_detail_cookie'>Headers</td></tr>`;
  const COOKIE_CONTENT_BANNER = `<tr><td colspan=2 class='web_event_detail_cookie'>Cookies (sorted by symbols, Aa-Zz)</td></tr>`;
  const COOKIE_CONTENT_BANNER_OPTIMIZED = "<tr><td colspan=2 class='web_event_detail_cookie'>Cookies (optimized)</td></tr>";
  const COOKIE_CONTENT_BANNER_UNOPTIMIZED = "<tr><td colspan=2 class='web_event_detail_cookie'>Cookies (unoptimized)</td></tr>";
  const ignoreHeaders = ["frameAncestors", "frameId", "parentFrameId", "tabId", "timeStamp", "type", "callerName", "requestIdEnhanced", "requestId"];
  const REQUEST_NOT_AVAILABLE = `<tr><td class='web_event_style_error' style='text-align: center;'>Request not available</td></tr>`;
  const RESPONSE_NOT_AVAILABLE = `<tr><td class='web_event_style_error' style='text-align: center;'>Response not available</td></tr>`;

  async function logRequestDetails(webEvent) {
    let inserted = insertEventUrls(webEvent);
    if (inserted) {
      addOrUpdateUrlListToPage(webEvent);
      displaySelectedEventDetails(webEvent);
    }
  }

  function insertEventUrls(webEvent) {
    let captureEvent = toggleCaptureEvents && isEventToCapture(webEvent);
    if (captureEvent) {
      setRedirectCount(webEvent);
      actionOnBeforeRequest(webEvent);
      actionOnBeforeSendHeaders(webEvent);
      actionOnSendHeaders(webEvent);
      actionOnBeforeRedirect(webEvent);
      actionOnAuthRequired(webEvent);
      actionOnHeadersReceived(webEvent);
      actionOnResponseStarted(webEvent);
      actionOnCompleted(webEvent);
      actionOnErrorOccurred(webEvent);
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

  function actionOnBeforeRequest(webEvent) {
    if (webEvent.callerName === "onBeforeRequest") {
      insertRequestBody(webEvent);
    }
  }

  function actionOnBeforeSendHeaders(webEvent) {
    if (webEvent.callerName === "onBeforeSendHeaders") {
      insertRequestHeaders(webEvent);
    }
  }

  function actionOnSendHeaders(webEvent) {
    if (webEvent.callerName === "onSendHeaders") {
      insertRequestHeaders(webEvent);
    }
  }

  function actionOnBeforeRedirect(webEvent) {
    if (webEvent.callerName === "onBeforeRedirect") {
      // A defect in latest FF versions (tested on 79.0)
      // FF is starting onBeforeRedirect event without any actual headers as below, and we do not want to capture anything during this process and so adding this if condition. If the redirect response is as below, it means there are still more response headers coming. So wait till all the response headers are completed
      // this issue does not exist in chrome
      // {
      //   "method": "GET",
      //   "redirectUrl": "blah/blah/blah",
      //   "url": "blah/blah",
      //   "urlClassification": "firstParty: [], thirdParty: []"
      // }
      if (webEvent.ip) { // webEvent.ip && webEvent.statusCode && webEvent.statusLine && webEvent.redirectUrl
        let redirectCount = requestIdRedirectCount.get(webEvent.requestId);
        requestIdRedirectCount.set(webEvent.requestId, ++redirectCount);
        insertResponseHeaders(webEvent);
        displaySelectedEventDetails(webEvent);
      }
    }
  }

  function actionOnAuthRequired(webEvent) {
    if (webEvent.callerName === "onAuthRequired") {
      insertResponseHeaders(webEvent);
    }
  }

  function actionOnHeadersReceived(webEvent) {
    if (webEvent.callerName === "onHeadersReceived") {
      insertResponseHeaders(webEvent);
    }
  }

  function actionOnResponseStarted(webEvent) {
    if (webEvent.callerName === "onResponseStarted") {
      insertResponseHeaders(webEvent);
    }
  }

  function actionOnCompleted(webEvent) {
    if (webEvent.callerName === "onCompleted") {
      insertResponseHeaders(webEvent);
    }
  }

  function actionOnErrorOccurred(webEvent) {
    if (webEvent.callerName === "onErrorOccurred") {
      insertResponseHeaders(webEvent);
    }
  }

  /**
   * finds out whether the url will be captured or not
   * excludeURLsList always takes precedence
   */
  function isEventToCapture(webEvent) {
    let captureEventInclude = urlMatchIncludePattern(webEvent);
    let captureEventExclude = captureEventInclude ? urlMatchExcludePattern(webEvent) : true;
    return (captureEventInclude && !captureEventExclude);
  }

  function urlMatchIncludePattern(webEvent) {
    if (includeURLsList) {
      return includeURLsList.some(v => webEvent.url.toLowerCase().includes(v));
    } else if (webEvent.requestIdEnhanced.includes("fakeRequest")) {
      return false;
    } else {
      return true;
    }
  }

  function urlMatchExcludePattern(webEvent) {
    let toExclude = false;
    if (excludeURLsList) {
      toExclude = excludeURLsList.some(v => webEvent.url.toLowerCase().includes(v.toLowerCase()));
    } else if (!toExclude && globalExcludeURLsList) {
      toExclude = globalExcludeURLsList.some(v => webEvent.url.toLowerCase().includes(v.toLowerCase()));
    }
    return toExclude;
  }

  function maskFieldsPattern(value) {
    let masking = false;
    if (maskAttributesCheckboxValue) {
      if (maskedAttributesList) {
        masking = maskedAttributesList.some(v => value.toLowerCase().includes(v));
      }
      if (!masking && globalMaskPatternsList) {
        masking = globalMaskPatternsList.some(v => value.toLowerCase().includes(v));
      }
    }
    return masking;
  }

  /**
   * To populate the url list by either adding a new one, or updating the existing one
   */
  function addOrUpdateUrlListToPage(webEvent) {
    // adding a new url to page using the request events
    // check if we can change the condition to callerName "onBeforeRequest"
    if (addedRequestId.indexOf(webEvent.requestIdEnhanced) === -1) {
      addedRequestId.push(webEvent.requestIdEnhanced);
      let hideClass = "";
      if (filterWithValue && filterWithValue.length > 2 && !webEvent.url.toLowerCase().includes(filterWithValue)) {
        hideClass = " web_event_list_hide";
      }
      let containerContent = "<div title='Click to view details' class='" + CLASS_LIST_TO_ADD + hideClass + "' id='web_events_list_" + webEvent.requestIdEnhanced + "'>" +
        generateURLContent(webEvent) +
        generateMETHODContent(webEvent) +
        generateSTATUSContent(webEvent) +
        generateDATETIMEContent(webEvent) +
        generateCACHEContent(webEvent) +
        "</div>";
      getById("urls_list").insertAdjacentHTML("beforeend", containerContent);
    }
    // update already captured url with details
    else {
      // onErrorOccurred, webEvent will have webEvent.error instead of webEvent.statusCode
      if (webEvent.callerName === "onErrorOccurred") {
        getById(`web_events_list_${webEvent.requestIdEnhanced}`).classList.add("web_event_style_error");
        getById(`web_event_status_${webEvent.requestIdEnhanced}`).innerHTML = "ERROR";
      }
      // do not update if statusCode is not available (ex: service workers, fetch events in FF are missing response events)
      else if (webEvent.statusCode) {
        getById(`web_events_list_${webEvent.requestIdEnhanced}`).classList.remove("web_event_style_error");
        getById(`web_event_status_${webEvent.requestIdEnhanced}`).innerHTML = webEvent.statusCode;
      }
      if (webEvent.fromCache !== undefined && webEvent.fromCache !== null) {
        getById(`web_event_cache_${webEvent.requestIdEnhanced}`).innerHTML = webEvent.fromCache;
      }
    }
  }

  function generateURLContent(webEvent) {
    return `<div class='web_event_list_url' id='web_event_url_${webEvent.requestIdEnhanced}'>${webEvent.url}</div>`;
  }

  function generateMETHODContent(webEvent) {
    return `<div class='web_event_list_method' id='web_event_method_${webEvent.requestIdEnhanced}'>${webEvent.method}</div>`;
  }

  function generateSTATUSContent(webEvent) {
    return `<div class='web_event_list_status' id='web_event_status_${webEvent.requestIdEnhanced}'>${(webEvent.statusCode ? webEvent.statusCode : webEvent.error ? "ERROR" : "&nbsp;")}</div>`;
  }

  function generateDATETIMEContent(webEvent) {
    return `<div class='web_event_list_date_time' id='web_event_time_${webEvent.requestIdEnhanced}'>${(webEvent.timeStamp ? getReadableDate(webEvent.timeStamp) : "&nbsp;")}</div>`;
  }

  function generateCACHEContent(webEvent) {
    return `<div class='web_event_list_cache' id='web_event_cache_${webEvent.requestIdEnhanced}'>NA</div>`;
  }

  function getReadableDate(timestamp) {
    let date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
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
    if (selectedWebEventRequestId && webEvent.requestIdEnhanced === selectedWebEventRequestId) {
      // call update container methods for already selected url
      displayEventProperties(webEvent.requestIdEnhanced);
    }
  }

  /**
   *  This will display the selected url details, or update the already selcted url details
   *  get the request details, response details, request form data
   *  build the request container, response container
   */
  function displayEventProperties(webEventId) {
    selectedWebEventRequestId = webEventId;
    let webEventIdRequest = allRequestHeaders.get(webEventId);
    let webEventIdResponse = allResponseHeaders.get(webEventId);
    let webEventIdRequestForm = requestFormData.get(webEventId);

    let requestContainer = buildURLDetailsContainer(webEventIdRequest, "requestDetails");
    let responseContainer = buildURLDetailsContainer(webEventIdResponse, "responseDetails");
    let requestFormContainer = buildRequestFormContainer(webEventIdRequestForm);
    getById("web_event_details_selected_request").style.borderRight = "1px solid";
    getById("web_event_details_selected_response").style.borderRight = "1px solid";
    getById("web_event_details_selected_request").style.borderLeft = "1px solid";
    getById("web_event_details_selected_response").style.borderLeft = "1px solid";
    getById("web_event_details_selected_request").style.borderBottom = "1px solid";
    getById("web_event_details_selected_response").style.borderBottom = "1px solid";
    getById("request_headers_details").innerHTML = requestContainer + requestFormContainer;
    getById("response_headers_details").innerHTML = responseContainer;
  }

  function buildURLDetailsContainer(webEventIdDetails, detailsType) {
    let tableContent = "";
    let headersContent = "";
    if (webEventIdDetails) {
      tableContent = HEADER_CONTENT_BANNER;
      Object.entries(webEventIdDetails).forEach(([key, value]) => {
        if (key !== "responseHeaders" && key !== "requestHeaders") { // headers added by browser
          if (!ignoreHeaders.includes(key) && value !== undefined && value !== null) {
            if (typeof value !== "object") {
              if (maskFieldsPattern(key)) {
                tableContent += generateMaskedHeaderKeyValueContent(key, value);
              } else {
                tableContent += generateHeaderKeyValueContent(key, value);
              }
            } else {
              let content = "";
              Object.entries(value).forEach(([k, v]) => {
                // if (Array.isArray(v) && v.length) {
                content += `${k}: ${JSON.stringify(v)}, `;
                // }
              });
              // if (content) {
              content = content.substring(0, content.length - 2); // removing last ", " from the above loop
              tableContent += generateHeaderKeyValueContent(key, content);
              // }
            }
          }
        } else { // application headers
          let headers = sortJsonByProperty(value, "name");
          headersContent = generateHeaderDetails(headers);
        }
      });
    } else if (detailsType === "responseDetails") {
      tableContent = RESPONSE_NOT_AVAILABLE;
    } else {
      tableContent = REQUEST_NOT_AVAILABLE;
    }
    return tableContent + headersContent;
  }

  function generateMaskedHeaderKeyValueContent(key, value) {
    if (value.trim().length > 0) {
      return `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${value.charAt(0)}*****${value.charAt(value.length-1)}</td></tr>`;
    }
    return `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${value}</td></tr>`;
  }

  function generateHeaderKeyValueContent(key, value) {
    return `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${value}</td></tr>`;
  }

  function buildRequestFormContainer(webEventIdRequestForm) {
    let formData = "";
    if (webEventIdRequestForm) {
      if (webEventIdRequestForm.formData) {
        formData = "<tr><td colspan=2 class='web_event_detail_cookie'>Body (form fields data)</td></tr>";
        Object.entries(webEventIdRequestForm.formData).forEach(([key, value]) => {
          if (maskFieldsPattern(key)) {
            value = value.toString();
            formData += generateMaskedHeaderKeyValueContent(key, value);
          } else {
            formData += generateHeaderKeyValueContent(key, value);
          }
        });
      } else if (webEventIdRequestForm.raw) {
        formData = "<tr><td colspan=2 class='web_event_detail_cookie'>Body (raw form data)</td></tr>";
        for (let eachByte of webEventIdRequestForm.raw) { //TODO - change to ES6
          let dataView = new DataView(eachByte.bytes);
          let decodedString = decoder.decode(dataView);
          formData += `<tr style='white-space: pre-wrap; word-break: break-all;'><td colspan=2>${decodedString}</td></tr>`;
        }
      }
    }
    return formData;
  }

  function generateHeaderDetails(headers) {
    let generalHeadersContent = "";
    let banner = COOKIE_CONTENT_BANNER; // used for request cookies
    let cookieContent = "";
    let optimizedCookiesMap = new Map();
    let unoptimizedCookiesList = [];
    headers.forEach(header => {
      // request cookies
      if (header.name === DELIMITER_REQUEST_COOKIE_KEY_NAME) {
        cookieContent += generateRequestCookieDetails(header.value, DELIMITER_REQUEST_COOKIE);
      }
      // response cookies
      else if (header.name.toLowerCase() === DELIMITER_RESPONSE_COOKIE_KEY_NAME) {
        // unoptimized cookie content
        if (!optimizeResponseCookies) {
          banner = COOKIE_CONTENT_BANNER_UNOPTIMIZED;
          cookieContent += generateResponseCookieDetails(header.value, DELIMITER_RESPONSE_COOKIE);
        }
        // optimized cookies
        else {
          banner = COOKIE_CONTENT_BANNER_OPTIMIZED;
          setOptimizedCookiesMap(header.value, DELIMITER_RESPONSE_COOKIE, optimizedCookiesMap);
        }
      }
      // general headers which are not cookies
      else {
        generalHeadersContent += `<tr><td class='web_event_detail_header_key'>${header.name}</td><td class='web_event_detail_header_value'>${header.value}</td></tr>`;
      }
    });
    if (optimizeResponseCookies) {
      sortMapByKey(optimizedCookiesMap).forEach((value, key) => {
        cookieContent += `<tr><td class='web_event_detail_header_key'>${key.split(':', 1)}</td><td class='web_event_detail_header_value'>${value.cookieValue}</td></tr>`;
      });
    }
    if (cookieContent) {
      cookieContent = banner + cookieContent;
    }
    return generalHeadersContent + cookieContent;
  }

  function generateRequestCookieDetails(cookieValue, cookieDelim) {
    // generally request cookies will not be duplicates
    let cookieList = cookieValue.split(cookieDelim).sort(sortArray);
    let cookieContent = "";
    // convert into map to avoid duplicate cookies though request cookies will not be duplicates
    // the order of cookies will be the order in which they were added to map
    let cookieMap = new Map();
    cookieList.forEach(cookie => {
      if (cookie) {
        let firstOccurance = cookie.indexOf("=");
        if (firstOccurance > -1) {
          cookieMap.set(cookie.substring(0, firstOccurance), cookie.substring(firstOccurance + 1));
        }
      }
    });
    cookieMap.forEach((value, key) => {
      cookieContent += `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${value}</td></tr>`;
    })
    return cookieContent;
  }

  function generateResponseCookieDetails(cookieValue, cookieDelim) {
    let cookieList = cookieValue.split(cookieDelim);
    let cookieContent = "";
    cookieList.forEach(cookie => {
      if (cookie) {
        let cookieDetails = getCookieNameValue(cookie);
        cookieContent += `<tr><td class='web_event_detail_header_key'>${cookieDetails.cookieName}</td><td class='web_event_detail_header_value'>${cookieDetails.cookieValue}</td></tr>`;
      }
    });
    return cookieContent;
  }

  function setOptimizedCookiesMap(cookieValue, cookieDelim, optimizedCookiesMap) {
    let cookieList = cookieValue.split(cookieDelim); // for FF
    cookieList.forEach(cookie => {
      if (cookie) {
        let key = "";
        let cookieDetails = getCookieNameValue(cookie);
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

  function getCookieNameValue(cookie) {
    let firstOccurance = cookie.indexOf("=");
    let cookieObj = {};
    if (firstOccurance > -1) {
      cookieObj.cookieName = cookie.substring(0, firstOccurance);
      cookieObj.cookieValue = cookie.substring(firstOccurance + 1);
      // https://tools.ietf.org/html/rfc6265#page-10
      // https://tools.ietf.org/html/rfc6265#section-4.1.1
      if (cookieObj.cookieValue) {
        stringToArray(cookieObj.cookieValue, ";").forEach(attribute => {
          if (attribute) {
            let attributeKeyValue = attribute.trim().split("=");
            // toLowerCase : chrome sends as domain, FF sends as Domain
            if (attributeKeyValue[0].toLowerCase() === "domain" || attributeKeyValue[0].toLowerCase() === "path") {
              cookieObj[attributeKeyValue[0].toLowerCase()] = attributeKeyValue[1];
            }
          }
        });
      }
    }
    return cookieObj;
  }

  /**
   * This will be called when
   *  a. On page load - to display only the matched urls from filter box if not empty
   *  b. For each key entry in the filter box
   *  c. on clear filter button click
   */
  function hideOrShowURLList() {
    if (!filterWithValue || filterWithValue.length <= 2) {
      // dont hide any thing as the search string is less than 3 chars
      let urlsList = getHiddenUrlsList();
      while (urlsList.length) {
        urlsList[0].classList.remove("web_event_list_hide");
      }
    } else {
      let multipleSearchPatterns = "";
      let isOrSplit = true;
      multipleSearchPatterns = filterWithValue.split(DELIMITER_OR).filter(Boolean);
      // remove all empty values
      if (multipleSearchPatterns.length === 1) {
        multipleSearchPatterns = multipleSearchPatterns[0].split(DELIMITER_AND).filter(Boolean);
        if (multipleSearchPatterns.length > 1) {
          isOrSplit = false;
        }
      }
      // get the live collection and convert into an array
      // https://stackoverflow.com/a/40910732/2850801
      // https://stackoverflow.com/a/16777942/2850801 - read comment by user user1106925
      let allUrlsList = Array.prototype.slice.call(getAllUrlsList());
      for (let element of allUrlsList) {
        let urlMatch = false;
        if (multipleSearchPatterns.length > 0) {
          for (let searchString of multipleSearchPatterns) {
            urlMatch = false;
            if (element.childNodes[filterWithKey].innerHTML.toLowerCase().includes(searchString)) {
              urlMatch = true;
              if (isOrSplit) {
                break;
              }
            } else if (!isOrSplit) {
              break;
            }
          }
        }
        if (urlMatch) {
          element.classList.remove("web_event_list_hide");
        } else {
          element.classList.add("web_event_list_hide");
        }
      }
    }
  }

  function removeEntry(node) {
    let requestIdToRemove = node.id.substring(16, node.id.length);

    requestIdRedirectCount.delete(requestIdToRemove);
    allRequestHeaders.delete(requestIdToRemove);
    allResponseHeaders.delete(requestIdToRemove);
    requestFormData.delete(requestIdToRemove);
    node.remove();
    if (requestIdToRemove === selectedWebEventRequestId) {
      getById("delete_selected_web_event").disabled = true;
      getById("response_headers_details").innerHTML = "";
      getById("request_headers_details").innerHTML = "";
      selectedWebEventRequestId = null;
      selectedEvent = null;
    }

  }

  /**
   *  This method always returns a live collection of hidden urls list
   */
  function getHiddenUrlsList() {
    return getById("urls_list").getElementsByClassName("web_event_list_blank web_event_list_hide"); // this returns a live collection
  }

  /** get a static (not live) visible list of urls only
   *  a. on button click of delete all filtered urls
   *
   *  querySelectorAll : returns a static list and not a live list
   *  getElementsByClassName: returns a live list
   *  This method will not return a live list as we are converting the live list into an array
   */
  function getVisibleUrlsList() {
    let allUrls = getAllUrlsList(); // this gives live list
    let visibleUrls = Array.prototype.filter.call(allUrls, function(eachUrl) {
      return !eachUrl.classList.contains("web_event_list_hide");
    });
    return visibleUrls;
  }

  /**
   *  This method always returns a live collection of all urls list (hidden and not hidden)
   */
  function getAllUrlsList() {
    return getById("urls_list").getElementsByClassName("web_event_list_blank"); // this returns a live collection
  }

  function bindDefaultEvents() {
    getById("track_urls_pattern").oninput = setPatternsToInclude;
    getById("exclude_urls_pattern").oninput = setPatternsToExclude;
    getById("block_urls_pattern").oninput = setPatternsToBlock;
    getById("mask_patterns_list").oninput = setPatternsToMask;
    getById("enable_mask_patterns").onchange = maskFieldsCheckbox;
    getById("include_form_data").onchange = captureFormDataCheckbox;
    getById("optimize_response_cookies").onchange = optimizeResponseCookiesCheckbox;
    getById("filter_web_events").oninput = filterEvents;
    getById("web_event_filter_key").oninput = filterEvents;
    getById("clear_filter_web_events").onclick = clearFilterBoxDisplayAllURLsAndUpdateButtons;
    getById("delete_all_filtered_web_events").onclick = deleteFilteredEvents;
    getById("delete_selected_web_event").onclick = removeSelectedEvent;
    getById("delete_all_web_events").onclick = clearAllEvents;
    getById("urls_list").onclick = setEventRowAsSelected;
    getById("urls_list").onkeydown = updateSelectedEventToContainer;
    getById("toggle_track_web_events").onclick = updateToggleCaptureEvents;
    getById("header_button_remove_0").onclick = clearAndRemoveHeaderContents;
    getById("header_button_add_0").onclick = addNewHeaderContainer;
    getById("add_modify_headers").oninput = generateHeadersToAddOrModify; // either on text change
    getById("preferences").addEventListener("click", function() {
      chrome.runtime.openOptionsPage();
    });
  }

  function generateHeadersToAddOrModify() {
    let headersObject = [];
    let conatiners = getByClassNames("single_header_container");
    Array.prototype.filter.call(conatiners, function(headerContainer) {
      index = headerContainer.id.substring(15);
      headerName = headerContainer.querySelector(".header_input_name").value.trim();
      if (headerName) {
        if (!FORBIDDEN_HEADERS.some(v => headerName.toLowerCase() === v.toLowerCase()) &&
          !FORBIDDEN_HEADERS_PATTERN.some(v => headerName.toLowerCase().startsWith(v.toLowerCase()))) {
          headerContainer.querySelector(".add_header_name").style.color = "";
          if (headerContainer.querySelector(".header_input_apply").checked) {
            let x = {};
            x.name = headerName;
            x.value = headerContainer.querySelector(".header_input_value").value;
            x.url = headerContainer.querySelector(".header_input_url").value.trim();
            headersObject.push(x);
          }
        } else {
          headerContainer.querySelector(".add_header_name").style.color = "red";
        }
      }
    });
    setRequestHeadersList(headersObject);
    if (headersObject.length > 0 || conatiners.length > 1) {
      getById("add_modify_headers_banner").innerHTML = `Add/Modify request headers: ${headersObject.length}`;
    } else {
      getById("add_modify_headers_banner").innerHTML = `Add/Modify request headers:`;
    }
  }

  function clearAndRemoveHeaderContents(event) {
    if (event.target.id.substring(21) === "0") {
      getById("header_name_0").value = "";
      getById("header_value_0").value = "";
      getById("header_url_0").value = "";
    } else {
      getById("header_details_" + event.target.id.substring(21)).remove();
    }
    generateHeadersToAddOrModify();
  }

  function addNewHeaderContainer(event) {
    let currentContainers = getByClassNames("single_header_container");
    let nextIndex = currentContainers.length;

    var headerDiv = document.createElement('div');
    headerDiv.id = "header_details_" + nextIndex;
    headerDiv.classList = "single_header_container";

    var urlDiv = document.createElement("div");
    urlDiv.classList = "add_header_url";
    var urlTextNode = document.createTextNode("URL ");
    var urlInput = document.createElement("input");
    urlInput.setAttribute("type", "text");
    urlInput.id = "header_url_" + nextIndex;
    urlInput.classList = "header_input_url";
    urlDiv.append(urlTextNode);
    urlDiv.append(urlInput);

    var valueDiv = document.createElement("div");
    valueDiv.classList = "add_header_value";
    var valueTextNode = document.createTextNode("Value ");
    var valueInput = document.createElement("input");
    valueInput.setAttribute("type", "text");
    valueInput.id = "header_value_" + nextIndex;
    valueInput.classList = "header_input_value";
    valueDiv.append(valueTextNode);
    valueDiv.append(valueInput);

    var nameDiv = document.createElement("div");
    nameDiv.classList = "add_header_name";
    var nameTextNode = document.createTextNode("Name ");
    var nameInput = document.createElement("input");
    nameInput.setAttribute("type", "text");
    nameInput.id = "header_name_" + nextIndex;
    nameInput.classList = "header_input_name";
    nameDiv.append(nameTextNode);
    nameDiv.append(nameInput);

    var applyDiv = document.createElement("div");
    applyDiv.classList = "add_header_apply";
    var applyInput = document.createElement("input");
    applyInput.setAttribute("type", "checkbox");
    applyInput.id = "header_apply_" + nextIndex;
    applyInput.classList = "header_input_apply";
    var applyLabel = document.createElement("label");
    applyLabel.htmlFor = "header_apply_" + nextIndex;
    applyLabel.innerHTML = "Apply";
    applyDiv.append(applyInput, applyLabel);

    var headerButtonsDiv = document.createElement("div");
    headerButtonsDiv.style = "width: 12%;float: left;text-align: right;";

    var simpleDiv = document.createElement("div");
    simpleDiv.style = "display: flex;";

    var removeButton = document.createElement("input");
    removeButton.setAttribute("type", "button");
    removeButton.value = "-";
    removeButton.id = "header_button_remove_" + nextIndex;
    removeButton.onclick = clearAndRemoveHeaderContents;

    var removeDiv = document.createElement("div");
    removeDiv.style = "margin-right: 5px;float: left;flex-grow: 1;";
    removeDiv.append(removeButton);

    var addButton = document.createElement("input");
    addButton.setAttribute("type", "button");
    addButton.value = "+";
    addButton.style = "visibility: hidden;";

    var addDiv = document.createElement("div");
    addDiv.append(addButton);

    simpleDiv.append(removeDiv, addDiv);
    headerButtonsDiv.append(simpleDiv);
    headerDiv.append(nameDiv, valueDiv, urlDiv, applyDiv, headerButtonsDiv);
    currentContainers[nextIndex - 1].after(headerDiv);
  }

  function updateToggleCaptureEvents() {
    if (toggleCaptureEvents) {
      toggleCaptureEvents = false;
      getById("toggle_track_web_events").innerHTML = "Resume tracker";
    } else {
      toggleCaptureEvents = true;
      getById("toggle_track_web_events").innerHTML = "Pause tracker";
    }
  }

  function captureFormDataCheckbox() {
    captureFormDataCheckboxValue = getById("include_form_data").checked;
  }

  function optimizeResponseCookiesCheckbox() {
    optimizeResponseCookies = getById("optimize_response_cookies").checked;
    displayEventProperties(selectedWebEventRequestId);
  }

  function maskFieldsCheckbox() {
    maskAttributesCheckboxValue = getById("enable_mask_patterns").checked;
    if (selectedWebEventRequestId) {
      displayEventProperties(selectedWebEventRequestId);
    }
  }

  function setPatternsToMask(event) {
    if (filterPatternsToMaskTimeout) {
      clearTimeout(filterPatternsToMaskTimeout);
    }
    filterPatternsToMaskTimeout = setTimeout(function() {
      maskedAttributesList = stringToArray(event.target.value);
    }, filterInputBoxDelay);
  }

  function clearAllEvents() {
    requestFormData.clear();
    allRequestHeaders.clear();
    allResponseHeaders.clear();
    addedRequestId.length = 0;
    getById("web_event_details_selected_request").style.border = "none";
    getById("web_event_details_selected_response").style.border = "none";
    getById("response_headers_details").innerHTML = "";
    getById("request_headers_details").innerHTML = "";
    getById("urls_list").innerHTML = "";
  }

  function deleteFilteredEvents() {
    let visibleUrlList = getVisibleUrlsList();
    if (visibleUrlList) {
      for (node of visibleUrlList) {
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
    filterWithValue = getById("filter_web_events").value = "";
  }

  function updateSelectedEventToContainer(event) {
    if (event.target && event.target.classList.contains("web_event_list_container")) {
      let selectedEvent = getSelectedEvent();
      selectNextEligibleEvent(selectedEvent, event.keyCode);
    }
  }

  function selectNextEligibleEvent(selectedEvent, keyCode) {
    if (keyCode == 40) { // down arrow
      let nextElement = selectedEvent ? selectedEvent.nextElementSibling : selectedEvent;
      while (nextElement) {
        if (nextElement.classList.contains("web_event_list_hide")) {
          nextElement = nextElement.nextElementSibling;
        } else {
          markSelectedRequest(nextElement.id);
          break;
        }
      }
    } else if (keyCode == 38) { // up arrow
      let previousElement = selectedEvent ? selectedEvent.previousElementSibling : selectedEvent;
      while (previousElement) {
        if (previousElement.classList.contains("web_event_list_hide")) {
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

    // commenting for now as I don't want to decide on what to select after deleting a record

    // Always select the next element if available, and if not available select the previous element
    // selectNextEligibleEvent(selectedEvent, 40);
    // if (!selectedWebEventRequestId) {
    //   selectNextEligibleEvent(selectedEvent, 38);
    // }

    if (selectedEvent) {
      removeEntry(selectedEvent);
      getById("delete_selected_web_event").disabled = true;
      getById("response_headers_details").innerHTML = "";
      getById("request_headers_details").innerHTML = "";
      selectedEvent = null;
    }
  }

  function setEventRowAsSelected(event) {
    if (event.target && event.target.parentElement.classList.contains("web_event_list_blank")) {
      markSelectedRequest(event.target.parentElement.id);
      getById("delete_selected_web_event").disabled = false;
      getById("delete_selected_web_event").classList.remove("web_event_list_filtered");
    }
  }

  function filterEvents(event) {
    if (filterWithValueTimeout) {
      clearTimeout(filterWithValueTimeout);
    }
    filterWithValueTimeout = setTimeout(function() {
      filterWithKey = getById("web_event_filter_key").selectedOptions[0].value; // get the selected key(index) from dropdown
      if (filterWithKey) {
        filterWithValue = getById("filter_web_events").value.toLowerCase(); // get the value from filter text box
        hideOrShowURLList();
        updateAllButtons();
      }
    }, filterInputBoxDelay);
  }

  function setPatternsToExclude(event) {
    if (filterPatternsToExcludeTimeout) {
      clearTimeout(filterPatternsToExcludeTimeout);
    }
    filterPatternsToExcludeTimeout = setTimeout(function() {
      excludeURLsList = stringToArray(event.target.value);
    }, filterInputBoxDelay);
  }

  function setPatternsToBlock(event) {
    if (setPatternsToBlockTimeout) {
      clearTimeout(setPatternsToBlockTimeout);
    }
    setPatternsToBlockTimeout = setTimeout(function() {
      blockURLSList = stringToArray(event.target.value);
    }, filterInputBoxDelay);
  }

  async function setPatternsToInclude(event) {
    if (filterPatternsToIncludeTimeout) {
      clearTimeout(filterPatternsToIncludeTimeout);
    }
    filterPatternsToIncludeTimeout = setTimeout(function() {
      includeURLsList = stringToArray(event.target.value);
    }, filterInputBoxDelay);
  }

  function setInitialStateOfPage() {
    filterWithValue = getById("filter_web_events").value;
    filterWithKey = getById("filter_web_events").value;
    captureFormDataCheckboxValue = getById("include_form_data").checked;
    optimizeResponseCookies = getById("optimize_response_cookies").checked;
    includeURLsList = stringToArray(getById("track_urls_pattern").value);
    excludeURLsList = stringToArray(getById("exclude_urls_pattern").value);
    maskedAttributesList = stringToArray(getById("mask_patterns_list").value);
    maskAttributesCheckboxValue = getById("enable_mask_patterns").checked;
    blockURLSList = stringToArray(getById("block_urls_pattern").value);
    updateAllButtons();
    hideOrShowURLList();
  }

  function updateAllButtons() {
    updateButonClearFilterWebEvents();
    updateButonDeleteSelectedWebEvent();
    updateButonDeleteAllFilteredWebEvents();
    updateButonDeleteAllWebEvents();
  }

  function updateButonClearFilterWebEvents() {
    if (!filterWithValue) {
      getById("clear_filter_web_events").disabled = true;
    } else {
      getById("clear_filter_web_events").disabled = false;
    }
  }

  function updateButonDeleteAllFilteredWebEvents() {
    if (filterWithValue && filterWithValue.length > 2) {
      let visibleUrlList = getVisibleUrlsList();
      if (visibleUrlList && visibleUrlList.length > 0) {
        getById("delete_all_filtered_web_events").disabled = false;
      } else {
        getById("delete_all_filtered_web_events").disabled = true;
      }
    } else {
      getById("delete_all_filtered_web_events").disabled = true;
    }

  }

  function updateButonDeleteSelectedWebEvent() {
    let selectedEvent = getSelectedEvent();
    if (!selectedEvent) {
      getById("delete_selected_web_event").disabled = true;
    }
  }

  function updateButonDeleteAllWebEvents() {
    // TODO
  }

  function markSelectedRequest(requestId) {
    getById("web_event_detail_request_head").style.removeProperty("display");
    getById("web_event_detail_response_head").style.removeProperty("display");
    deselectEvent();
    let element = getById(requestId);
    element.classList.add("web_event_list_selected");

    // scroll is not working on key up or key down.
    // let topPos = element.offsetTop;
    // element.parentNode.scrollTop = element.offsetTop - element.parentNode.offsetTop;

    displayEventProperties(requestId.substring(16));
  }

  function deselectEvent() {
    let selectedEvent = getSelectedEvent();
    if (selectedEvent) {
      selectedEvent.classList.remove("web_event_list_selected");
    }
  }

  function getSelectedEvent() {
    return getByClassNames("web_event_list_selected")[0];
  }

  document.addEventListener("DOMContentLoaded", function() {
    document.title = getManifestDetails().title;
    // if (httpTracker.isFF) {
    //   getById("http_tracker").style.fontSize = "75%";
    // }
    bindDefaultEvents();
    setInitialStateOfPage();
  });

  function getGlobalOptions(details) {
    // globalExcludeURLsList = getStoredDetails(details);
    globalExcludeURLsList = getPropertyFromStorage(details, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN);
    globalMaskPatternsList = getPropertyFromStorage(details, httpTracker.STORAGE_KEY_MASK_PATTERN);
  }

  function getChangesFromStorge(changes, namespace) {
    for (var key in changes) {
      if (key === httpTracker.STORAGE_KEY_EXCLUDE_PATTERN) {
        globalExcludeURLsList = changes[key].newValue;
        break;
      }
    }
  }

  httpTracker.browser.storage.onChanged.addListener(getChangesFromStorge);
  httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_EXCLUDE_PATTERN, httpTracker.STORAGE_KEY_MASK_PATTERN], getGlobalOptions);

  return {
    logRequestDetails: logRequestDetails
  }
})();