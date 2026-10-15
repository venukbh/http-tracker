const eventTracker = (function() {
  let isCaptureFormDataEnabled = false;
  let filterWithKey = '0';
  let filterWithValue = '';
  let globalExcludeURLsList;
  let globalIncludeURLsList;
  let globalMaskPatternsList;
  let isMaskingEnabled = false;
  let maskedAttributesList;
  let optimizeResponseCookies;
  let selectedWebEventRequestId = '';
  let isCapturingEvents = true;
  let findPatterns = '';
  let compiledFindPattern = null;
  let multipleSearchPatterns = [];
  let isANDFilter = false;
  let excludeURLsList;
  let includeURLsList;
  let blockURLsList;

  function processWebEvent(webEvent) {
    const inserted = captureAndRecordEvent(webEvent);
    if (inserted) {
      addOrUpdateUrlListToPage(webEvent);
      renderSelectedEventDetailsIfActive(webEvent);
    }
  }

  function captureAndRecordEvent(webEvent) {
    if (isCapturingEvents && isEventToCapture(webEvent)) {
      httpTrackerEventCache.recordEvent(webEvent, isCaptureFormDataEnabled);
      return true;
    }
    return false;
  }

  function isEventToCapture(webEvent) {
    if (webEvent.requestIdEnhanced?.includes('fakeRequest')) {
      return false;
    }
    return matchesIncludePattern(webEvent.url, includeURLsList, globalIncludeURLsList) &&
      !matchesExcludePattern(webEvent.url, excludeURLsList, globalExcludeURLsList);
  }

  function addOrUpdateUrlListToPage(webEvent) {
    if (!httpTrackerEventCache.hasEvent(webEvent.requestIdEnhanced)) {
      addEventRow(webEvent);
    } else {
      updateEventRow(webEvent);
    }
    filterEventRow(webEvent);
    if (multipleSearchPatterns.length > 0) {
      updateDeleteFilteredButton();
    }
  }

  function addEventRow(webEvent) {
    httpTrackerEventCache.markEventAdded(webEvent.requestIdEnhanced);
    const tmpl = getById('template_url_row');
    if (tmpl?.content) {
      const fragment = tmpl.content.cloneNode(true);
      const row = fragment.firstElementChild;
      populateUrlRow(row, webEvent);
      getById('urls_list')?.appendChild(fragment);
      return;
    }
    const row = document.createElement('div');
    row.title = 'Click to view details';
    row.className = 'web_event_list_blank web_event_list_style';
    for (let i = 0; i < 5; i++) {
      row.appendChild(document.createElement('div'));
    }
    populateUrlRow(row, webEvent);
    getById('urls_list')?.appendChild(row);
  }

  function populateUrlRow(row, webEvent) {
    row.id = `web_events_list_${webEvent.requestIdEnhanced}`;
    row.dataset.requestId = webEvent.requestIdEnhanced;
    row.dataset.rawRequestId = webEvent.requestId;

    const [urlDiv, methodDiv, statusDiv, timeDiv, cacheDiv] = row.children;
    urlDiv.id = `web_event_url_${webEvent.requestIdEnhanced}`;
    urlDiv.className = 'web_event_list_url';
    urlDiv.textContent = webEvent.url;

    methodDiv.id = `web_event_method_${webEvent.requestIdEnhanced}`;
    methodDiv.className = 'web_event_list_method';
    methodDiv.textContent = webEvent.method;

    statusDiv.id = `web_event_status_${webEvent.requestIdEnhanced}`;
    statusDiv.className = 'web_event_list_status';
    statusDiv.textContent = webEvent.statusCode || (webEvent.error ? STRING_ERROR : 'N/A');

    timeDiv.id = `web_event_time_${webEvent.requestIdEnhanced}`;
    timeDiv.className = 'web_event_list_date_time';
    timeDiv.textContent = webEvent.timeStamp ? getReadableDate(webEvent.timeStamp) : 'N/A';

    cacheDiv.id = `web_event_cache_${webEvent.requestIdEnhanced}`;
    cacheDiv.className = 'web_event_list_cache';
    cacheDiv.textContent = webEvent.fromCache ?? 'N/A';
  }

  function updateEventRow(webEvent) {
    const listEl = getById(`web_events_list_${webEvent.requestIdEnhanced}`);
    const statusEl = getById(`web_event_status_${webEvent.requestIdEnhanced}`);
    const cacheEl = getById(`web_event_cache_${webEvent.requestIdEnhanced}`);
    if (webEvent.callerName === 'onErrorOccurred') {
      listEl?.classList.add('web_event_style_error');
      if (statusEl) {
        statusEl.textContent = STRING_ERROR;
      }
    } else if (webEvent.statusCode) {
      listEl?.classList.remove('web_event_style_error');
      if (statusEl) {
        statusEl.textContent = webEvent.statusCode;
      }
    }
    if (cacheEl) {
      cacheEl.textContent = webEvent.fromCache ?? 'N/A';
    }
  }

  function applyFilterToElement(element) {
    const text = element.children[filterWithKey]?.textContent || '';
    if (matchesFilter(text, multipleSearchPatterns, isANDFilter)) {
      element.classList.remove('web_event_list_hide');
    } else {
      element.classList.add('web_event_list_hide');
    }
  }

  function filterEventRow(webEvent) {
    if (multipleSearchPatterns.length === 0) {
      return;
    }
    const element = getById(`web_events_list_${webEvent.requestIdEnhanced}`);
    if (element) {
      applyFilterToElement(element);
    }
  }

  function renderSelectedEventDetailsIfActive(webEvent) {
    if (selectedWebEventRequestId && webEvent.requestIdEnhanced === selectedWebEventRequestId) {
      renderSelectedEventDetails();
    }
  }

  function renderSelectedEventDetails() {
    if (!selectedWebEventRequestId) {
      return;
    }
    const webEventIdRequest = httpTrackerEventCache.getRequest(selectedWebEventRequestId);
    const webEventIdResponse = httpTrackerEventCache.getResponse(selectedWebEventRequestId);
    const webEventIdRequestForm = httpTrackerEventCache.getRequestBody(selectedWebEventRequestId);
    const allMaskPatterns = (maskedAttributesList || []).concat(globalMaskPatternsList || []);

    httpTrackerDetailsView.renderSelectedEventDetails({
      requestEvent: webEventIdRequest,
      responseEvent: webEventIdResponse,
      requestBody: webEventIdRequestForm,
      maskPatterns: allMaskPatterns,
      isMaskEnabled: isMaskingEnabled,
      optimizeResponseCookies,
      compiledFindPattern,
    });
  }

  function showAllUrlRows() {
    const urlsList = getHiddenUrlRows();
    while (urlsList.length) {
      urlsList[0].classList.remove('web_event_list_hide');
    }
  }

  function filterAllUrlRows() {
    if (multipleSearchPatterns.length === 0) {
      showAllUrlRows();
    } else {
      for (const element of getAllUrlRows()) {
        applyFilterToElement(element);
      }
    }
  }

  function removeEntry(node) {
    const requestIdToRemove = node.dataset.requestId;
    const rawRequestId = node.dataset.rawRequestId || requestIdToRemove.replace(/_\d+$/, '');
    httpTrackerEventCache.removeEntry(requestIdToRemove, rawRequestId);
    node.remove();
    if (requestIdToRemove === selectedWebEventRequestId) {
      getById('delete_selected_web_event').disabled = true;
      httpTrackerDetailsView.clearDetailsView();
      selectedWebEventRequestId = '';
    }
    updateDeleteFilteredButton();
  }

  function getHiddenUrlRows() {
    return getById('urls_list').getElementsByClassName('web_event_list_blank web_event_list_hide');
  }

  function getVisibleUrlRows() {
    return Array.from(getAllUrlRows()).filter((eachUrl) => !eachUrl.classList.contains('web_event_list_hide'));
  }

  function getAllUrlRows() {
    return getById('urls_list').getElementsByClassName('web_event_list_blank');
  }

  function bindDefaultEvents() {
    getById('track_urls_pattern').oninput = setPatternsToInclude;
    getById('exclude_urls_pattern').oninput = setPatternsToExclude;
    getById('block_urls_pattern').oninput = setPatternsToBlock;
    getById('mask_patterns_list').oninput = setPatternsToMask;
    getById('enable_mask_patterns').onchange = onMaskFieldsChange;
    getById('include_form_data').onchange = onCaptureFormDataChange;
    getById('optimize_response_cookies').onchange = onOptimizeCookiesChange;
    getById('filter_web_events').oninput = filterEvents;
    getById('web_event_filter_key').oninput = filterEvents;
    getById('clear_filter_web_events').onclick = resetFilter;
    getById('delete_all_filtered_web_events').onclick = deleteFilteredEvents;
    getById('delete_selected_web_event').onclick = removeSelectedEvent;
    getById('delete_all_web_events').onclick = clearAllEvents;
    getById('urls_list').onclick = handleUrlRowClick;
    getById('urls_list').onkeydown = handleListKeyNavigation;
    getById('toggle_track_web_events').onclick = toggleCapture;
    getById('find_in_details_pattern').oninput = setFindPatterns;
    getById('delete_cookies_button').onclick = httpTrackerDetailsView.deleteCookiesForSelectedDomain;
    getById('delete_cookies').oninput = function(event) {
      getById('delete_cookies_button').disabled = !event.target.value.trim();
    };
    getById('preferences').addEventListener('click', function() {
      openAddonOptions();
    });
    httpTrackerHeaderRules.init();
  }

  const setFindPatterns = debounce(function(event) {
    findPatterns = event.target.value.trim();
    try {
      compiledFindPattern = findPatterns ? new RegExp(findPatterns, 'gi') : null;
    } catch {
      compiledFindPattern = null;
    }
    renderSelectedEventDetails();
  }, INPUT_BOX_DELAY);

  function toggleCapture() {
    isCapturingEvents = !isCapturingEvents;
    getById('toggle_track_web_events').textContent = isCapturingEvents ? 'Pause tracker' : 'Resume tracker';
  }

  function onCaptureFormDataChange() {
    isCaptureFormDataEnabled = getById('include_form_data').checked;
  }

  function onOptimizeCookiesChange() {
    optimizeResponseCookies = getById('optimize_response_cookies').checked;
    renderSelectedEventDetails();
  }

  function onMaskFieldsChange() {
    isMaskingEnabled = getById('enable_mask_patterns').checked;
    renderSelectedEventDetails();
  }

  const setPatternsToMask = debounce(function(event) {
    maskedAttributesList = stringToArray(event.target.value);
    renderSelectedEventDetails();
  }, INPUT_BOX_DELAY);

  function clearAllEvents() {
    httpTrackerEventCache.clearAll();
    selectedWebEventRequestId = '';
    httpTrackerDetailsView.clearDetailsView();
    const heading = getById('urls_list_heading');
    if (heading) {
      getById('urls_list')?.replaceChildren(heading);
    } else {
      getById('urls_list')?.replaceChildren();
    }
    updateAllButtons();
  }

  function deleteFilteredEvents() {
    for (const node of getVisibleUrlRows()) {
      removeEntry(node);
    }
    resetFilter();
  }

  function resetFilter() {
    clearFilterInput();
    filterAllUrlRows();
    updateAllButtons();
  }

  function clearFilterInput() {
    filterWithValue = getById('filter_web_events').value = '';
    multipleSearchPatterns = [];
  }

  function handleListKeyNavigation(event) {
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

  function handleUrlRowClick(event) {
    const row = event.target?.closest?.('.web_event_list_blank');
    if (row) {
      markSelectedRequest(row.id);
    }
  }

  const filterEvents = debounce(function() {
    updateFilterOptions();
    filterAllUrlRows();
    updateAllButtons();
  }, INPUT_BOX_DELAY);

  function updateFilterOptions() {
    filterWithKey = getById('web_event_filter_key').selectedOptions[0].value;
    filterWithValue = getById('filter_web_events').value.toLowerCase().trim();
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
    excludeURLsList = normalizePatterns(stringToArray(event.target.value)).map((s) => s.toLowerCase());
  }, INPUT_BOX_DELAY);

  const setPatternsToBlock = debounce(function(event) {
    blockURLsList = stringToArray(event.target.value);
    updateBlockSessionRules(blockURLsList ?? []);
  }, INPUT_BOX_DELAY);

  const setPatternsToInclude = debounce(function(event) {
    includeURLsList = normalizePatterns(stringToArray(event.target.value)).map((s) => s.toLowerCase());
  }, INPUT_BOX_DELAY);

  function setInitialStateOfPage() {
    filterWithKey = getById('web_event_filter_key')?.value ?? '0';
    filterWithValue = getById('filter_web_events').value;
    isCaptureFormDataEnabled = getById('include_form_data').checked;
    optimizeResponseCookies = getById('optimize_response_cookies').checked;
    includeURLsList = normalizePatterns(stringToArray(getById('track_urls_pattern').value)).map((s) => s.toLowerCase());
    excludeURLsList = normalizePatterns(stringToArray(getById('exclude_urls_pattern').value)).map((s) => s.toLowerCase());
    maskedAttributesList = stringToArray(getById('mask_patterns_list').value);
    isMaskingEnabled = getById('enable_mask_patterns').checked;
    blockURLsList = stringToArray(getById('block_urls_pattern').value);
    updateAllButtons();
    filterAllUrlRows();
    hideOrShowInfoIcons();
    clearAllSessionRules().then(() => {
      if (blockURLsList?.length) {
        updateBlockSessionRules(blockURLsList);
      }
      httpTrackerHeaderRules.syncHeaderRulesFromUI();
    }).catch(onError);
  }

  function updateInfoIcon(elementId, list) {
    const element = getById(elementId);
    if (list?.length) {
      element.textContent = '\u24D8';
      element.title = `Patterns extended from preferences: ${arrayToString(list)}`;
      element.style.color = 'red';
    } else {
      element.textContent = '';
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
    updateClearFilterButton();
    updateDeleteSelectedButton();
    updateDeleteFilteredButton();
  }

  function updateClearFilterButton() {
    getById('clear_filter_web_events').disabled = !filterWithValue;
  }

  function updateDeleteFilteredButton() {
    const isEnabled = multipleSearchPatterns.length > 0 &&
      Boolean(getById('urls_list')?.querySelector('.web_event_list_blank:not(.web_event_list_hide)'));
    getById('delete_all_filtered_web_events').disabled = !isEnabled;
  }

  function updateDeleteSelectedButton() {
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
    renderSelectedEventDetails();
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

  const STORAGE_KEY_MAP = [
    { key: httpTracker.STORAGE_KEY_EXCLUDE_PATTERN, set: (val) => { globalExcludeURLsList = val.map((s) => s.toLowerCase()); } },
    { key: httpTracker.STORAGE_KEY_INCLUDE_PATTERN, set: (val) => { globalIncludeURLsList = val.map((s) => s.toLowerCase()); } },
    { key: httpTracker.STORAGE_KEY_MASK_PATTERN,    set: (val) => { globalMaskPatternsList = val; } },
  ];

  function initGlobalOptions(details) {
    for (const item of STORAGE_KEY_MAP) {
      item.set(normalizePatterns(getPropertyFromStorage(details, item.key)));
    }
    hideOrShowInfoIcons();
  }

  function handleStorageChange(changes) {
    for (const item of STORAGE_KEY_MAP) {
      if (changes?.[item.key]) {
        item.set(normalizePatterns(changes[item.key].newValue));
      }
    }
    hideOrShowInfoIcons();
    renderSelectedEventDetails();
  }

  httpTracker.browser.storage.onChanged.addListener(handleStorageChange);
  httpTracker.browser.storage.sync.get([httpTracker.STORAGE_KEY_INCLUDE_PATTERN, httpTracker.STORAGE_KEY_EXCLUDE_PATTERN, httpTracker.STORAGE_KEY_MASK_PATTERN], initGlobalOptions);

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
    processWebEvent,
    logRequestDetails: processWebEvent,
  };
})();
