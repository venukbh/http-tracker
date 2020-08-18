var eventTracker = (function() {
  var requestIdRedirectCount = new Map();
  var allRequestHeaders = new Map();
  var allResponseHeaders = new Map();
  var requestFormData = new Map();
  var addedRequestId = [];
  var selectedWebEventRequestId = "";
  var hideFormDataAttributes = []; // "password", "username", "userid"
  var filterWithKey = "";
  var filterWithValue = "";
  var includeURLsList;
  var excludeURLsList;
  var captureFormDataCheckboxValue = false;
  var decoder = new TextDecoder("UTF-8");
  var filterInputBoxDelay = 500;
  var filterWithValueTimeout = null;
  var filterPatternsToIncludeTimeout = null;
  var filterPatternsToExcludeTimeout = null;

  const ignoreHeaders = ["frameAncestors", "frameId", "parentFrameId", "tabId", "timeStamp", "type", "callerName", "requestIdEnhanced", "requestId"];
  const DELIMITER_OR = "|";
  const DELIMITER_AND = "&";
  const STRING_UNDERSCORE = "_";
  const CLASS_LIST_TO_ADD = "web_event_list_blank web_event_list_style";
  const DELIMITER_REQUEST_COOKIE = "; ";
  const DELIMITER_REQUEST_COOKIE_KEY_NAME = "Cookie";
  const DELIMITER_RESPONSE_COOKIE = "\n";
  const DELIMITER_RESPONSE_COOKIE_KEY_NAME = "set-cookie";
  const COOKIE_CONTENT_BANNER = "<tr><td colspan=2 class='web_event_detail_cookie'>Cookies</td></tr>";

  function logRequestDetails(webEvent) {
    let inserted = insertEventUrls(webEvent);
    if (inserted) {
      addOrUpdateUrlListToPage(webEvent);
      displaySelectedEventDetails(webEvent);
    }
  }

  function insertEventUrls(webEvent) {
    let captureEvent = isEventToCapture(webEvent);
    if (captureEvent) {
      // console.log("Before Event processing: " + JSON.stringify(webEvent));
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
      // A defect in latest firefox versions (tested on 79.0)
      // Firefox is starting onBeforeRedirect event without any actual headers as below, and we do not want to capture anything during this process and so adding this if condition. If the redirect response is as below, it means there are still more response headers coming. So wait till all the response headers are completed
      // {
      //   "method": "GET",
      //   "redirectUrl": "https://secure-www.test.com/profile/sign_in.do?targetURL=/buy/shopping_bag.do",
      //   "url": "https://secure-www.test.com/profile/sign_in.do?targetURL=/buy/shopping_bag.do",
      //   "urlClassification": "firstParty: [], thirdParty: []"
      // }
      if (webEvent.ip) { // for now reducing the conditions as getting the expected result
        // if (webEvent.ip && webEvent.statusCode && webEvent.statusLine && webEvent.redirectUrl) {
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

  // finds out whether the url will be captured or not
  function isEventToCapture(webEvent) {
    // excludeURLsList always takes precedence
    let captureEventInclude = urlMatchIncludePattern(webEvent);
    let captureEventExclude = captureEventInclude ? urlMatchExcludePattern(webEvent) : true; // last false or true has no impact
    return (captureEventInclude && !captureEventExclude);
  }

  function urlMatchIncludePattern(webEvent) {
    if (includeURLsList) {
      for (pattern of includeURLsList) {
        if (webEvent.url.toLowerCase().includes(pattern.trim().toLowerCase())) {
          return true;
        }
      }
      return false;
    } else if (webEvent.requestIdEnhanced.includes("fakeRequest")) {
      return false;
    } else {
      return true;
    }
  }

  function urlMatchExcludePattern(webEvent) {
    if (excludeURLsList) {
      for (pattern of excludeURLsList) {
        if (webEvent.url.toLowerCase().includes(pattern.trim().toLowerCase())) {
          return true;
        }
      }
      return false;
    } else {
      return false;
    }
  }

  // To populate the url list by either adding a new one, or updating the existing one
  function addOrUpdateUrlListToPage(webEvent) {
    // adding a new url to page using the request events
    // check if we can change the condition to callerName "onBeforeRequest"
    if (addedRequestId.indexOf(webEvent.requestIdEnhanced) === -1) {
      addedRequestId.push(webEvent.requestIdEnhanced);
      let hideClass = "";
      if (filterWithValue && filterWithValue.length > 2 && !webEvent.url.toLowerCase().includes(filterWithValue)) {
        hideClass = " web_event_list_hide";
      }
      let containerContent = "<div class='" + CLASS_LIST_TO_ADD + hideClass + "' id='web_events_list_" + webEvent.requestIdEnhanced + "'>" +
        generateURLContent(webEvent) +
        generateMETHODContent(webEvent) +
        generateSTATUSContent(webEvent) +
        generateDATETIMEContent(webEvent) +
        generateCACHEContent(webEvent) +
        "</div>";
      document.getElementById("urls_list").insertAdjacentHTML("beforeend", containerContent);
    } else {
      // update the already captured url with details
      if (webEvent.callerName === "onErrorOccurred") {
        // onErrorOccurred, webEvent will have webEvent.error instead of webEvent.statusCode
        document.getElementById(`web_events_list_${webEvent.requestIdEnhanced}`).classList.add("web_event_style_error");
        document.getElementById(`web_event_status_${webEvent.requestIdEnhanced}`).innerHTML = "ERROR";
      } else if (webEvent.statusCode) {
        // do not update if statusCode is not available (ex: service workers in firefox are missing response events)
        document.getElementById(`web_events_list_${webEvent.requestIdEnhanced}`).classList.remove("web_event_style_error");
        document.getElementById(`web_event_status_${webEvent.requestIdEnhanced}`).innerHTML = webEvent.statusCode;
      }
      if (webEvent.fromCache !== undefined && webEvent.fromCache !== null) {
        document.getElementById(`web_event_cache_${webEvent.requestIdEnhanced}`).innerHTML = webEvent.fromCache;
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
      // call the update container methods for the already selected url, otherwise not needed to update the display containers
      displayEventProperties(webEvent.requestIdEnhanced);
    }
  }

  function displayEventProperties(webEventId) {
    selectedWebEventRequestId = webEventId;
    let webEventIdRequest = allRequestHeaders.get(webEventId);
    let webEventIdResponse = allResponseHeaders.get(webEventId);
    let webEventIdRequestForm = requestFormData.get(webEventId);

    // sort object keys
    // JS Object is stored as name-value pair
    // of inside for loop on an array gives key.
    // in inside for loop on an array gives index.
    let requestContainer = buildRequestContainer(webEventIdRequest);
    let responseContainer = buildResponseContainer(webEventIdResponse);
    let requestFormContainer = buildRequestFormContainer(webEventIdRequestForm);
    document.getElementById("web_event_details_selected_request").style.borderRight = "1px solid";
    document.getElementById("web_event_details_selected_response").style.borderRight = "1px solid";
    document.getElementById("web_event_details_selected_request").style.borderLeft = "1px solid";
    document.getElementById("web_event_details_selected_response").style.borderLeft = "1px solid";
    document.getElementById("web_event_details_selected_request").style.borderBottom = "1px solid";
    document.getElementById("web_event_details_selected_response").style.borderBottom = "1px solid";
    document.getElementById("request_headers_details").innerHTML = requestContainer + requestFormContainer;
    document.getElementById("response_headers_details").innerHTML = responseContainer;
  }

  function buildRequestContainer(webEventIdRequest) {
    let tableContent = "";
    let headersContent = "";
    if (webEventIdRequest) {
      let sortedRequestKeys = Object.keys(webEventIdRequest).sort();
      for (let key of sortedRequestKeys) {
        if (key !== "requestHeaders") {
          if (!ignoreHeaders.includes(key) && webEventIdRequest[key] && webEventIdRequest[key].length > 0) {
            tableContent += `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${webEventIdRequest[key]}</td></tr>`;
          }
        } else {
          let sortedHeaderKeys = sortObjectByName(webEventIdRequest[key]);
          headersContent = generateHeaderDetails(sortedHeaderKeys);
        }
      }
    }
    return tableContent + headersContent;
  }

  function buildResponseContainer(webEventIdResponse) {
    let tableContent = "";
    let headersContent = "";
    if (webEventIdResponse) {
      let sortedResponseKeys = Object.keys(webEventIdResponse).sort();
      for (let key of sortedResponseKeys) {
        if (key !== "responseHeaders") {
          if (!ignoreHeaders.includes(key) && webEventIdResponse[key]) {
            if (typeof webEventIdResponse[key] !== "object") {
              tableContent += `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${webEventIdResponse[key]}</td></tr>`;
            } else { // then its an object
              // this else block was added for firefox to pretty print the urlClassification object, but can be used for any object
              let content = "";
              for (const property in webEventIdResponse[key]) {
                content += `${property}: ${JSON.stringify(webEventIdResponse[key][property])}, `;
              }
              content = content.substring(0, content.length - 2); // removing last ", " from the above loop
              tableContent += `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${content}</td></tr>`;
            }
          }
        } else {
          let sortedHeaderKeys = sortObjectByName(webEventIdResponse[key]);
          headersContent = generateHeaderDetails(sortedHeaderKeys);
        }
      }
    } else {
      tableContent = "<tr><td class='web_event_style_error' style='text-align: center;'>Response not available</td></tr>";
    }
    return tableContent + headersContent;
  }

  function buildRequestFormContainer(webEventIdRequestForm) {
    let formData = "";
    if (webEventIdRequestForm) {
      if (webEventIdRequestForm.formData) {
        let sortedFormData = Object.keys(webEventIdRequestForm.formData).sort();
        formData = "<tr><td colspan=2 class='web_event_detail_cookie'>Body (Form data)</td></tr>";
        for (let key of sortedFormData) {
          let formKeyValue = webEventIdRequestForm.formData[key];
          if (hideFormDataAttributes.includes(key.toLowerCase())) {
            formData += `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>***HIDDEN BY ADDON***</td></tr>`;
          } else {
            formData += `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${formKeyValue}</td></tr>`;
          }
        }
      } else if (webEventIdRequestForm.raw) {
        formData = "<tr><td colspan=2 class='web_event_detail_cookie'>Body (Form data)</td></tr>";
        for (let eachByte of webEventIdRequestForm.raw) {
          let dataView = new DataView(eachByte.bytes);
          let decodedString = decoder.decode(dataView);
          formData += `<tr style='white-space: pre-wrap; word-break: break-all;'><td colspan=2>${decodedString}</td></tr>`;
        }
      }
    }
    return formData;
  }

  function sortObjectByName(objectReference) {
    let sortedObject = objectReference.sort(function(headerObject1, headerObject2) {
      var name1 = headerObject1.name.toUpperCase();
      var name2 = headerObject2.name.toUpperCase();
      if (name1 < name2) {
        return -1;
      }
      if (name1 > name2) {
        return 1;
      }
      // names must be equal
      return 0;
    });
    return sortedObject;
  }

  function generateHeaderDetails(sortedHeaderKeys) {
    let generalHeadersContent = "";
    let cookieContent = "";
    for (let key of sortedHeaderKeys) {
      if (key.name === DELIMITER_REQUEST_COOKIE_KEY_NAME) {
        cookieContent += generateRequestCookieDetails(key.value, DELIMITER_REQUEST_COOKIE);
      } else if (key.name.toLowerCase() === DELIMITER_RESPONSE_COOKIE_KEY_NAME) {
        cookieContent += generateResponseCookieDetails(key.value, DELIMITER_RESPONSE_COOKIE);
      } else {
        generalHeadersContent += `<tr><td class='web_event_detail_header_key'>${key.name}</td><td class='web_event_detail_header_value'>${key.value}</td></tr>`;
      }
    }
    if (cookieContent) {
      cookieContent = COOKIE_CONTENT_BANNER + cookieContent;
    }
    return generalHeadersContent + cookieContent;
  }

  function generateRequestCookieDetails(cookieValue, cookieDelim) {
    let cookieList = cookieValue.split(cookieDelim).sort();
    let cookieContent = "";
    if (cookieList.length > 0) {
      for (let eachCookie of cookieList) {
        let firstOccurance = eachCookie.indexOf("=");
        if (firstOccurance > -1) {
          cookieContent += `<tr><td class='web_event_detail_header_key'>${eachCookie.substring(0, firstOccurance)}</td><td class='web_event_detail_header_value'>${eachCookie.substring(firstOccurance + 1)}</td></tr>`;
        } else {
          console.error(`Invalid cookie format for cookie =  ${eachCookie}`);
        }
      }
    }
    return cookieContent;
  }

  function generateResponseCookieDetails(cookieValue, cookieDelim) {
    let cookieList = cookieValue.split(cookieDelim);
    let cookieVal = "";
    let cookieContent = "";
    let cookieListMap = new Map();
    for (let eachCookie of cookieList) {
      let firstOccurance = eachCookie.indexOf("=");
      if (firstOccurance > -1) {
        cookieVal = eachCookie.substring(firstOccurance + 1);
      }
      cookieListMap.set(eachCookie.substring(0, firstOccurance), cookieVal);
    }
    for (let [key, value] of cookieListMap) {
      cookieContent += `<tr><td class='web_event_detail_header_key'>${key}</td><td class='web_event_detail_header_value'>${value}</td></tr>`;
    }
    return cookieContent;
  }

  function hideUnHideUrlList() {
    let allUrlList = document.querySelectorAll(".web_event_list_blank");
    let multipleSearchPatterns = "";
    if (!filterWithValue || filterWithValue.length <= 2 || (filterWithValue.includes(DELIMITER_OR) && filterWithValue.includes(DELIMITER_AND))) {
      // dont hide any thing as the search string has issues
      for (element of allUrlList) {
        if (element.classList.contains("web_event_list_hide")) {
          element.classList.remove("web_event_list_hide");
        }
      }
    } else {
      let isOrSplit = true;
      multipleSearchPatterns = filterWithValue.split(DELIMITER_OR).filter(Boolean);
      // remove all empty values
      if (multipleSearchPatterns.length === 1) {
        multipleSearchPatterns = multipleSearchPatterns[0].split(DELIMITER_AND).filter(Boolean);
        if (multipleSearchPatterns.length > 1) {
          isOrSplit = false;
        }
      }
      for (element of allUrlList) {
        let urlMatch = false;
        if (multipleSearchPatterns.length > 0) {
          for (let searchString of multipleSearchPatterns) {
            urlMatch = false;
            if (element.childNodes[filterWithkey].innerHTML.toLowerCase().includes(searchString)) {
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

  function hideUnhideDeleteButtons() {
    let visibleUrlList = getVisibleUrlList();
    if (filterWithValue && filterWithValue.length > 2 && visibleUrlList && visibleUrlList.length > 0) {
      document.getElementById("delete_selected_web_event").classList.remove("web_event_list_filtered");
      document.getElementById("delete_all_filtered_web_events").classList.remove("web_event_list_filtered");
    } else {
      document.getElementById("delete_selected_web_event").classList.add("web_event_list_filtered");
      document.getElementById("delete_all_filtered_web_events").classList.add("web_event_list_filtered");
    }
  }

  function removeEntry(node) {
    let requestIdToRemove = node.id.substring(16, node.id.length);
    requestIdRedirectCount.delete(requestIdToRemove);
    allRequestHeaders.delete(requestIdToRemove);
    allResponseHeaders.delete(requestIdToRemove);
    requestFormData.delete(requestIdToRemove);
    node.remove();
  }

  function getVisibleUrlList() {
    // return document.getElementById("urls_list").querySelectorAll('div' + ':not([class="web_event_list_blank web_event_list_style web_event_list_hide"])');
    // return document.getElementById("urls_list").querySelectorAll("div.web_event_list_blank.web_event_list_style:not(.web_event_list_hide)").length;
    if (filterWithValue) {
      return document.getElementById("urls_list").querySelectorAll("div.web_event_list_blank.web_event_list_style:not(.web_event_list_hide)");
    }
  }

  function bindDefaultEvents() {
    document.getElementById("include_urls_pattern").addEventListener("input", setPatternsToInclude);
    document.getElementById("exclude_urls_pattern").addEventListener("input", setPatternsToExclude);
    document.getElementById("include_form_data").addEventListener("change", captureFormDataCheckbox);
    document.getElementById("filter_web_events").addEventListener("input", filterEvents);
    document.getElementById("clear_filter_web_events").addEventListener("click", clearFilterBoxAndDisplayAllURLs);
    document.getElementById("delete_all_filtered_web_events").addEventListener("click", clearFilteredEvents);
    document.getElementById("delete_selected_web_event").addEventListener("click", removeSelectedEvent);
    document.getElementById("delete_all_web_events").addEventListener("click", clearAllEvents);
    document.getElementById("urls_list").addEventListener("click", setEventRowAsSelected);
    document.getElementById("urls_list").addEventListener("keydown", updateSelectedEventToContainer);
  }

  function captureFormDataCheckbox() {
    captureFormDataCheckboxValue = document.getElementById("include_form_data").checked;
  }

  function clearAllEvents() {
    requestFormData.clear();
    allRequestHeaders.clear();
    allResponseHeaders.clear();
    addedRequestId.length = 0;
    document.getElementById("web_event_details_selected_request").style.border = "none";
    document.getElementById("web_event_details_selected_response").style.border = "none";
    document.getElementById("response_headers_details").innerHTML = "";
    document.getElementById("request_headers_details").innerHTML = "";
    document.getElementById("urls_list").innerHTML = "";
  }

  function clearFilteredEvents() {
    let visibleUrlList = getVisibleUrlList();
    if (visibleUrlList) {
      for (node of visibleUrlList) {
        removeEntry(node);
      }
    }
    clearFilterBoxAndDisplayAllURLs();
  }

  function clearFilterBoxAndDisplayAllURLs() {
    clearFilterBox();
    hideUnHideUrlList();
  }

  function clearFilterBox() {
    filterWithValue = document.getElementById("filter_web_events").value = "";
  }

  function updateSelectedEventToContainer(event) {
    if (event.target && event.target.classList.contains("web_event_list_container")) {
      let selectedEvent = getSelectedEvent();
      if (event.keyCode == 40) { // down arrow
        let nextElement = selectedEvent ? selectedEvent.nextElementSibling : selectedEvent;
        while (nextElement) {
          if (nextElement.classList.contains("web_event_list_hide")) {
            nextElement = nextElement.nextElementSibling;
          } else {
            markSelectedRequest(nextElement.id);
            break;
          }
        }
      } else if (event.keyCode == 38) { // up arrow
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
  }

  function removeSelectedEvent() {
    let selectedEvent = getSelectedEvent();
    if (selectedEvent) {
      removeEntry(selectedEvent);
      document.getElementById("delete_selected_web_event").disabled = true;
      document.getElementById("response_headers_details").innerHTML = "";
      document.getElementById("request_headers_details").innerHTML = "";
      selectedEvent = null;
    }
    // document.getElementById(`web_event_cache_${selectedEvent.id.substring(16, selectedEvent.id.length)}`).nextSibling; // console error
  }

  function setEventRowAsSelected(event) {
    if (event.target && event.target.parentElement.classList.contains("web_event_list_blank")) {
      markSelectedRequest(event.target.parentElement.id);
      document.getElementById("delete_selected_web_event").disabled = false;
      document.getElementById("delete_selected_web_event").classList.remove("web_event_list_filtered");
    }
  }

  function filterEvents(event) {
    if (filterWithValueTimeout) {
      clearTimeout(filterWithValueTimeout);
    }
    filterWithValueTimeout = setTimeout(function() {
      filterWithkey = document.getElementById("web_event_filter_key").selectedOptions[0].value; // get the selected key from dropdown
      if (filterWithkey) {
        filterWithValue = event.target.value.toLowerCase(); // get the value from filter text box
        hideUnHideUrlList();
        hideUnhideDeleteButtons();
      }
    }, filterInputBoxDelay);
  }

  function setPatternsToExclude(event) {
    if (filterPatternsToExcludeTimeout) {
      clearTimeout(filterPatternsToExcludeTimeout);
    }
    filterPatternsToExcludeTimeout = setTimeout(function() {
      excludeURLsList = convertToArray(event.target.value);
    }, filterInputBoxDelay);
  }

  function setPatternsToInclude(event) {
    if (filterPatternsToIncludeTimeout) {
      clearTimeout(filterPatternsToIncludeTimeout);
    }
    filterPatternsToIncludeTimeout = setTimeout(function() {
      includeURLsList = convertToArray(event.target.value);
    }, filterInputBoxDelay);
  }

  function captureInitialFilters() {
    filterWithValue = document.getElementById("filter_web_events").value;
    captureFormDataCheckboxValue = document.getElementById("include_form_data").checked;
    includeURLsList = convertToArray(document.getElementById("include_urls_pattern").value);
    excludeURLsList = convertToArray(document.getElementById("exclude_urls_pattern").value);

    updateButonDeleteSelectedWebEvent();
    hideUnHideUrlList();
  }

  function updateButonDeleteSelectedWebEvent() {
    let selectedEvent = getSelectedEvent();
    if (!selectedEvent) {
      document.getElementById("delete_selected_web_event").disabled = true;
    }
  }

  function markSelectedRequest(requestId) {
    document.getElementById("web_event_detail_request_head").style.removeProperty("display");
    document.getElementById("web_event_detail_response_head").style.removeProperty("display");
    clearSelectedEvent();
    document.getElementById(requestId).classList.add("web_event_list_selected");
    displayEventProperties(requestId.substring(16));
  }

  function clearSelectedEvent() {
    let selectedEvent = getSelectedEvent();
    if (selectedEvent) {
      selectedEvent.classList.remove("web_event_list_selected");
    }
  }

  function convertToArray(urlListCommaSeperated) {
    if (urlListCommaSeperated.length > 0) {
      return urlListCommaSeperated.split(",");
    } else {
      return undefined;
    }
  }

  function getSelectedEvent() {
    return document.getElementsByClassName("web_event_list_selected")[0];
  }

  document.addEventListener("DOMContentLoaded", function() {
    let manifest = httpTracker.webEventConsumer.runtime.getManifest();
    document.title = `${manifest.browser_action.default_title} (version : ${manifest.version})`;
    bindDefaultEvents();
    captureInitialFilters();
  });

  // window.addEventListener("beforeunload", function(event) {
  //     console.debug("Unloading the data");
  // });

  // for security reasons, disabling the context menu on right click
  document.addEventListener("contextmenu", function(e) {
    e.preventDefault();
  }, false);

  // for security reasons, disabling the copy option from the form
  document.addEventListener("copy", function(e) {
    e.preventDefault();
  }, false);

  return {
    logRequestDetails: logRequestDetails
  }
})();