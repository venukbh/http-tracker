var eventTracker = (function() {
    var requestIdURL = new Map();
    var redirectRequestIdCount = new Map();
    var requestHeaders = new Map();
    var responseHeaders = new Map();
    var requestFormData = new Map();
    var addedRequestId = [];
    var containerContent = "";
    var selectedWebEventRequestId = "";
    var ignoreHeaders = ["frameAncestors", "frameId", "parentFrameId", "requestId", "tabId", "timeStamp", "type", "callerName", "requestIdEnhanced"];
    var hideFormDataAttributes = []; // "password", "username", "userid"
    var filterWithKey = "";
    var filterWithValue = "";
    var includeURLList;
    var excludeURLList;
    var captureFormDataCheckboxValue = false;
    var decoder = new TextDecoder("UTF-8");
    var date = new Date(0);
    var redirectCounter = 1;
    var delimOR = "|";
    var delimAND = "&";
    var stringUnderScore = "_";
    var filterInputBoxDelay = 500;
    var filterWithValueTimeout = null;
    var filterPatternsToIncludeTimeout = null;
    var filterPatternsToExcludeTimeout = null;

    // comment-1
    function logRequestDetails(webEvent) {
        // if(webEvent.callerName === "onSendHeaders") {
        // console.log(JSON.stringify(webEvent));
        // }
        var inserted = insertEventUrls(webEvent);
        if (inserted) {
            addUpdateUrlListToPage(webEvent);
            insertEventDetails(webEvent);
            displaySelectedEventDetails(webEvent);
        }
    }

    function insertEventUrls(webEvent) {
        var captureEvent = isEventToCapture(webEvent);
        if (captureEvent) {
            //  comment-2
            if (webEvent.callerName === "onBeforeRedirect" || webEvent.callerName === "onAuthRequired") {
                //comment-3
                let redirectCount = redirectRequestIdCount.get(webEvent.requestId);
                if (redirectCount) {
                    webEvent.requestIdEnhanced = webEvent.requestId + stringUnderScore + redirectCount;
                } else {
                    redirectCount = 0;
                }
                // insertEventDetails(webEvent); // this should technically insert response only.
                // -p- check if we can directly call insertResponse
                insertResponseHeaders(webEvent);
                displaySelectedEventDetails(webEvent);
                redirectCount = redirectCount + 1;
                redirectRequestIdCount.set(webEvent.requestId, redirectCount);
                webEvent.requestIdEnhanced = webEvent.requestId + stringUnderScore + redirectCount;
                return false;
            } else {
                // comment-4
                let redirectCount = redirectRequestIdCount.get(webEvent.requestId);
                if (redirectCount) {
                    webEvent.requestIdEnhanced = webEvent.requestId + stringUnderScore + redirectCount;
                }
                requestIdURL.set(webEvent.requestIdEnhanced, webEvent.url);
            }
            return true;
        }
        return false;
    }

    function isEventToCapture(webEvent) {
        var captureEventInclude = urlMatchIncludePattern(webEvent);
        var captureEventExclude = captureEventInclude ? urlMatchExcludePattern(webEvent) : true;
        return (captureEventInclude && !captureEventExclude);
    }

    function urlMatchIncludePattern(webEvent) {
        if (includeURLList) {
            for (pattern of includeURLList) {
                if (webEvent.url.toLowerCase().includes(pattern.trim().toLowerCase())) {
                    return true;
                }
            }
            return false;
        } else if (webEvent.requestIdEnhanced.includes("fakeRequest-")) {
            return false;
        } else {
            return true;
        }
    }

    function urlMatchExcludePattern(webEvent) {
        if (excludeURLList) {
            for (pattern of excludeURLList) {
                if (webEvent.url.toLowerCase().includes(pattern.trim().toLowerCase())) {
                    return true;
                }
            }
            return false;
        } else {
            return false;
        }
    }

    // Just to generate the url div containers : based on to show or not show and add to the parent div
    function addUpdateUrlListToPage(webEvent) {
        // console.log(JSON.stringify(webEvent));
        let classListToAdd = "web_event_list_blank web_event_list_style";
        if (addedRequestId.indexOf(webEvent.requestIdEnhanced) === -1) {
            addedRequestId.push(webEvent.requestIdEnhanced);
            if (filterWithValue && filterWithValue.length > 2 && !webEvent.url.toLowerCase().includes(filterWithValue)) {
                classListToAdd += " web_event_list_hide";
            }
            let containerContent = "<div class='" + classListToAdd + "' id='web_events_list_" + webEvent.requestIdEnhanced + "'>" +
                "<div class='web_event_list_url' id='web_event_url_" + webEvent.requestIdEnhanced + "'>" + webEvent.url + "</div>" +
                "<div class='web_event_list_method' id='web_event_method_" + webEvent.requestIdEnhanced + "'>" + webEvent.method + "</div>" +
                "<div class='web_event_list_status' id='web_event_status_" + webEvent.requestIdEnhanced + "'>" + (webEvent.statusCode ? webEvent.statusCode : webEvent.error ? "ERROR" : "&nbsp;") + "</div>" +
                "<div class='web_event_list_date_time' id='web_event_time_" + webEvent.requestIdEnhanced + "'>" + (webEvent.timeStamp ? getReadableDate(webEvent.timeStamp) : "&nbsp;") + "</div>" +
                "<div class='web_event_list_cache' id='web_event_cache_" + webEvent.requestIdEnhanced + "'>" + "NA" + "</div>" +
                "</div>";
            document.getElementById("urls_list").insertAdjacentHTML("beforeend", containerContent);
        } else {
            // coming from response. So update the already url with response code
            // if (webEvent.error) {
            if (webEvent.callerName === "onErrorOccurred") {
                document.getElementById("web_events_list_" + webEvent.requestIdEnhanced).style.color = "red";
                document.getElementById("web_event_status_" + webEvent.requestIdEnhanced).innerHTML = "ERROR";
            } else {
                document.getElementById("web_event_status_" + webEvent.requestIdEnhanced).innerHTML = (webEvent.statusCode ? webEvent.statusCode : "&nbsp;");
            }
            // document.getElementById("web_event_status_" + webEvent.requestIdEnhanced).innerHTML = (webEvent.statusCode ? webEvent.statusCode : webEvent.error ? "ERROR" : "&nbsp;");
            document.getElementById("web_event_cache_" + webEvent.requestIdEnhanced).innerHTML = (webEvent.fromCache ? webEvent.fromCache : "false");
        }
    }

    function getReadableDate(timestamp) {
        let date = new Date(timestamp);
        return date.toLocaleDateString() + " " + date.toLocaleTimeString();
    }

    function insertEventDetails(webEvent) {
        insertRequestBody(webEvent);
        insertRequestHeaders(webEvent);
        insertResponseHeaders(webEvent);
    }

    // update this method to not store sensitive form data attributes pending
    function insertRequestBody(webEvent) {
        if (webEvent.method === "POST" && webEvent.requestBody && captureFormDataCheckboxValue) {
            requestFormData.set(webEvent.requestIdEnhanced, webEvent.requestBody);
        }
    }

    function insertRequestHeaders(webEvent) {
        if (webEvent.requestHeaders) {
            requestHeaders.set(webEvent.requestIdEnhanced, webEvent);
        }
    }

    // update this method to check if it has response headers pending
    function insertResponseHeaders(webEvent) {
        if (!webEvent.requestHeaders) {
            responseHeaders.set(webEvent.requestIdEnhanced, webEvent);
        }
    }

    function identifyRequestOrResponse(webEvent) {
        // Every request will contain default headers, when ever a browser sends.
        console.log(webEvent.requestHeaders ? "request" : "response");
    }

    function displaySelectedEventDetails(webEvent) {
        if (selectedWebEventRequestId && webEvent.requestIdEnhanced === selectedWebEventRequestId) {
            // call the update container methods for the already selected url, otherwise not needed to update the display containers
            displayEventProperties(webEvent.requestIdEnhanced);
        }
    }

    function displayEventProperties(webEventId) {
        selectedWebEventRequestId = webEventId;
        let webEventIdRequest = requestHeaders.get(webEventId);
        let webEventIdResponse = responseHeaders.get(webEventId);
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
                        tableContent += "<tr><td class='web_event_detail_header_key'>" + key + "</td><td class='web_event_detail_header_value'>" + webEventIdRequest[key] + "</td></tr>";
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
                        tableContent += "<tr><td class='web_event_detail_header_key'>" + key + "</td><td class='web_event_detail_header_value'>" + webEventIdResponse[key] + "</td></tr>";
                    }
                } else {
                    let sortedHeaderKeys = sortObjectByName(webEventIdResponse[key]);
                    headersContent = generateHeaderDetails(sortedHeaderKeys);
                }
            }
        } else {
            console.debug("response is null");
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
                        formData += "<tr><td class='web_event_detail_header_key'>" + key + "</td><td class='web_event_detail_header_value'>" + "***HIDDEN BY ADDON***" + "</td></tr>";
                    } else {
                        formData += "<tr><td class='web_event_detail_header_key'>" + key + "</td><td class='web_event_detail_header_value'>" + formKeyValue + "</td></tr>";
                    }
                }
            } else if (webEventIdRequestForm.raw) {
                formData = "<tr><td colspan=2 class='web_event_detail_cookie'>Body (Form data)</td></tr>";
                for (let eachByte of webEventIdRequestForm.raw) {
                    let dataView = new DataView(eachByte.bytes);
                    let decodedString = decoder.decode(dataView);
                    formData += "<tr style='white-space: pre-wrap; word-break: break-all;''><td colspan=2>" + decodedString + "</td></tr>";
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
        let requestCookieDelim = "; ";
        let requestCookieKeyName = "Cookie";

        let responseCookieDelim = "\n";
        let responseCookieKeyName = "set-cookie";

        let generalHeadersContent = "";
        let cookieContent = "";

        for (let key of sortedHeaderKeys) {
            if (key.name === requestCookieKeyName) {
                cookieContent = generateCookieDetails(key.value, requestCookieDelim);
            } else if (key.name.toLowerCase() === responseCookieKeyName) {
                // cookieContent = generateCookieDetails(key.value, responseCookieDelim);
                cookieContent = generateResponseCookieDetails(key.value, responseCookieDelim);
            } else {
                generalHeadersContent += "<tr><td class='web_event_detail_header_key'>" + key.name + "</td><td class='web_event_detail_header_value'>" + key.value + "</td></tr>";
            }
        }
        return generalHeadersContent + cookieContent;
    }



    function generateCookieDetails(cookieValue, cookieDelim) {
        let cookieList = cookieValue.split(cookieDelim).sort();
        let cookieContent = "";
        if (cookieList.length > 0) {
            cookieContent = "<tr><td colspan=2 class='web_event_detail_cookie'>Cookies</td></tr>";
            for (let eachCookie of cookieList) {
                let firstOccurance = eachCookie.indexOf("=");
                if (firstOccurance > -1) {
                    cookieContent += "<tr><td class='web_event_detail_header_key'>" + eachCookie.substring(0, firstOccurance) + "</td><td class='web_event_detail_header_value'>" + eachCookie.substring(firstOccurance + 1) + "</td></tr>";
                } else {
                    console.error("Invalid cookie format, cookie = " + eachCookie);
                }
            }
        }
        return cookieContent;
    }

    function generateResponseCookieDetails(cookieValue, cookieDelim) {
        let cookieList = cookieValue.split(cookieDelim);
        let cookieVal = "";
        let cookieContent = "<tr><td colspan=2 class='web_event_detail_cookie'>Cookies</td></tr>";
        let cookieListMap = new Map();
        for (let eachCookie of cookieList) {
            let firstOccurance = eachCookie.indexOf("=");
            if (firstOccurance > -1) {
                cookieVal = eachCookie.substring(firstOccurance + 1);
            }
            cookieListMap.set(eachCookie.substring(0, firstOccurance), cookieVal);
        }
        for (let [key, value] of cookieListMap) {
            cookieContent += "<tr><td class='web_event_detail_header_key'>" + key + "</td><td class='web_event_detail_header_value'>" + value + "</td></tr>";
        }
        return cookieContent;
    }

    function hideUnHideUrlList() {
        let allUrlList = document.querySelectorAll(".web_event_list_blank");
        let multipleSearchPatterns = "";
        if (!filterWithValue || filterWithValue.length <= 2 || (filterWithValue.includes(delimOR) && filterWithValue.includes(delimAND))) {
            // dont hide any thing as the search string has issues
            for (element of allUrlList) {
                if (element.classList.contains("web_event_list_hide")) {
                    element.classList.remove("web_event_list_hide");
                }
            }
        } else {
            let isOrSplit = true;
            multipleSearchPatterns = filterWithValue.split(delimOR).filter(Boolean);
            // remove all empty values
            if (multipleSearchPatterns.length === 1) {
                multipleSearchPatterns = multipleSearchPatterns[0].split(delimAND).filter(Boolean);
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
            document.getElementById("clear_web_events_filtered_list_selected").classList.remove("web_event_list_filtered");
            document.getElementById("clear_web_events_filtered_list_all").classList.remove("web_event_list_filtered");
        } else {
            document.getElementById("clear_web_events_filtered_list_selected").classList.add("web_event_list_filtered");
            document.getElementById("clear_web_events_filtered_list_all").classList.add("web_event_list_filtered");
        }
    }

    function removeEntry(node) {
        let requestIdToRemove = node.id.substring(16, node.id.length);
        requestIdURL.delete(requestIdToRemove);
        redirectRequestIdCount.delete(requestIdToRemove);
        requestHeaders.delete(requestIdToRemove);
        responseHeaders.delete(requestIdToRemove);
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
        document.getElementById("web_events_filter_box").addEventListener("input", filterEvents);
        document.getElementById("urls_list").addEventListener("click", setEventRowAsSelected);
        document.getElementById("clear_web_events_filtered_list_selected").addEventListener("click", removeSelectedEvent);
        document.getElementById("urls_list").addEventListener("keydown", updateSelectedEventToContainer);
        document.getElementById("clear_web_events_filter_box").addEventListener("click", clearFilterBox);
        document.getElementById("clear_web_events_filtered_list_all").addEventListener("click", clearFilteredEvents);
        document.getElementById("clear_web_events_complete_list").addEventListener("click", clearAllEvents);
        document.getElementById("include_form_data").addEventListener("change", captureFormDataCheckbox);
    }

    function captureFormDataCheckbox() {
        captureFormDataCheckboxValue = document.getElementById("include_form_data").checked;
    }

    function clearAllEvents() {
        requestFormData.clear();
        requestIdURL.clear();
        requestHeaders.clear();
        responseHeaders.clear();
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
        clearFilterBox();
    }

    function clearFilterBox() {
        document.getElementById("web_events_filter_box").value = "";
        filterWithValue = document.getElementById("web_events_filter_box").value;
        hideUnHideUrlList();
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
        }
        // write code to auto select next element if available, else previous element, else disable the button
        document.getElementById("web_event_cache_" + selectedEvent.id.substring(16, selectedEvent.id.length)).nextSibling;
    }

    function setEventRowAsSelected(event) {
        if (event.target && event.target.parentElement.classList.contains("web_event_list_blank")) {
            markSelectedRequest(event.target.parentElement.id);
            document.getElementById("clear_web_events_filtered_list_selected").classList.remove("web_event_list_filtered");
        }
    }

    function filterEvents(event) {
        if (filterWithValueTimeout) {
            clearTimeout(filterWithValueTimeout);
        }
        filterWithValueTimeout = setTimeout(function() {
            filterWithkey = document.getElementById("web_event_filter_key").selectedOptions[0].value;
            if (filterWithkey) {
                filterWithValue = event.target.value.toLowerCase();
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
            excludeURLList = convertToArray(event.target.value);
        }, filterInputBoxDelay);
    }

    function setPatternsToInclude(event) {
        if (filterPatternsToIncludeTimeout) {
            clearTimeout(filterPatternsToIncludeTimeout);
        }
        filterPatternsToIncludeTimeout = setTimeout(function() {
            includeURLList = convertToArray(event.target.value);
        }, filterInputBoxDelay);
    }

    function captureInitialFilters() {
        filterWithValue = document.getElementById("web_events_filter_box").value;
        captureFormDataCheckboxValue = document.getElementById("include_form_data").checked;
        includeURLList = convertToArray(document.getElementById("include_urls_pattern").value);
        excludeURLList = convertToArray(document.getElementById("exclude_urls_pattern").value);
        hideUnHideUrlList();
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