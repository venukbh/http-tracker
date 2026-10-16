const eventTracker = (function() {
  let isCaptureFormDataEnabled = false;
  let activeColumnFilters = null;
  const COLUMN_FILTER_KEYS = ['url', 'method', 'status', 'date', 'cache'];
  let parsedSmartFilter = null;
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

    if (webEvent.callerName === 'onErrorOccurred' || webEvent.error || (webEvent.statusCode && Number(webEvent.statusCode) >= 400)) {
      row.classList.add('web_event_style_error');
    }
  }

  function updateEventRow(webEvent) {
    const listEl = getById(`web_events_list_${webEvent.requestIdEnhanced}`);
    const statusEl = getById(`web_event_status_${webEvent.requestIdEnhanced}`);
    const cacheEl = getById(`web_event_cache_${webEvent.requestIdEnhanced}`);
    if (webEvent.callerName === 'onErrorOccurred' || webEvent.error) {
      listEl?.classList.add('web_event_style_error');
      if (statusEl) {
        statusEl.textContent = STRING_ERROR;
      }
    } else if (webEvent.statusCode) {
      if (Number(webEvent.statusCode) >= 400) {
        listEl?.classList.add('web_event_style_error');
      } else {
        listEl?.classList.remove('web_event_style_error');
      }
      if (statusEl) {
        statusEl.textContent = webEvent.statusCode;
      }
    }
    if (cacheEl) {
      cacheEl.textContent = webEvent.fromCache ?? 'N/A';
    }
  }

  function applyFilterToElement(element) {
    if (matchesColumnFilters(element, activeColumnFilters)) {
      element.classList.remove('web_event_list_hide');
    } else {
      element.classList.add('web_event_list_hide');
    }
  }

  function filterEventRow(webEvent) {
    if (!activeColumnFilters) {
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
    const hiddenRows = getById('urls_list')?.querySelectorAll('.web_event_list_hide') ?? [];
    for (const row of hiddenRows) {
      row.classList.remove('web_event_list_hide');
    }
  }

  function filterAllUrlRows() {
    if (!activeColumnFilters) {
      showAllUrlRows();
    } else {
      for (const element of getAllUrlRows()) {
        applyFilterToElement(element);
      }
    }
    updateDeleteFilteredButton();
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

  function getVisibleUrlRows() {
    return getById('urls_list')?.querySelectorAll('.web_event_list_blank:not(.web_event_list_hide)') ?? [];
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
    bindInputClearButtons();
    bindColumnFilterEvents();
    httpTrackerHeaderRules.init();
  }

  function clearTextInput(target) {
    const input = typeof target === 'string' ? getById(target) : target;
    if (!input) {
      return;
    }
    input.value = '';
    if (input.classList?.contains?.('col_filter_input')) {
      const col = input.dataset.col;
      const cell = document.querySelector?.(`.col_header_cell[data-col="${col}"]`);
      if (cell) {
        cell.classList.remove('has_active_filter');
        const titleBar = cell.querySelector?.('.col_header_title_bar');
        const inputWrap = cell.querySelector?.('.col_filter_input_wrapper');
        if (inputWrap) inputWrap.style.display = 'none';
        if (titleBar) titleBar.style.display = '';
      }
      onColumnFilterChanged();
    } else {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      if (input.id === 'delete_cookies') {
        const delBtn = getById('delete_cookies_button');
        if (delBtn) {
          delBtn.disabled = true;
        }
      }
    }
    input.focus();
  }

  function bindInputClearButtons() {
    document.addEventListener('click', function(e) {
      const btn = e.target.closest?.('.input_clear_btn');
      if (btn) {
        e.preventDefault();
        const targetId = btn.dataset?.clearTarget;
        const input = targetId ? getById(targetId) : btn.closest('.tracker_input_wrapper')?.querySelector('input[type="text"]');
        if (input) {
          clearTextInput(input);
        }
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && e.target?.matches?.('.tracker_input_wrapper input[type="text"]') && e.target.value) {
        e.preventDefault();
        clearTextInput(e.target);
      }
    });
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
    const btn = getById('toggle_track_web_events');
    if (btn) {
      btn.textContent = isCapturingEvents ? 'Pause tracker' : 'Resume tracker';
      btn.title = isCapturingEvents
        ? 'Pause the tracker. When paused, nothing will be tracked.'
        : 'Resume the tracker to continue capturing HTTP requests.';
      btn.classList.toggle('is_paused', !isCapturingEvents);
    }
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
      const requestIdToRemove = node.dataset.requestId;
      const rawRequestId = node.dataset.rawRequestId || requestIdToRemove?.replace(/_\d+$/, '');
      if (requestIdToRemove) {
        httpTrackerEventCache.removeEntry(requestIdToRemove, rawRequestId);
      }
      node.remove();
      if (requestIdToRemove === selectedWebEventRequestId) {
        httpTrackerDetailsView.clearDetailsView();
        selectedWebEventRequestId = '';
      }
    }
    resetFilter();
  }

  function resetFilter() {
    clearFilterInput();
    filterAllUrlRows();
    updateAllButtons();
  }

  function clearFilterInput() {
    activeColumnFilters = null;
    for (const col of COLUMN_FILTER_KEYS) {
      const input = getById(`col_filter_${col}`);
      if (input) {
        input.value = '';
      }
      const cell = document.querySelector?.(`.col_header_cell[data-col="${col}"]`);
      if (cell) {
        cell.classList.remove('has_active_filter');
        const titleBar = cell.querySelector?.('.col_header_title_bar');
        const inputWrap = cell.querySelector?.('.col_filter_input_wrapper');
        if (titleBar) titleBar.style.display = '';
        if (inputWrap) inputWrap.style.display = 'none';
      }
    }
  }

  function getActiveColumnFilters() {
    const filters = {};
    let count = 0;
    for (const col of COLUMN_FILTER_KEYS) {
      const input = getById(`col_filter_${col}`);
      const val = input?.value?.trim() || '';
      if (val) {
        filters[col] = val;
        count++;
      }
    }
    return count > 0 ? filters : null;
  }

  function bindColumnFilterEvents() {
    const heading = getById('urls_list_heading');
    if (!heading) {
      return;
    }

    heading.addEventListener('click', function(event) {
      const toggleBtn = event.target.closest?.('.col_filter_toggle_btn');
      if (toggleBtn) {
        const col = toggleBtn.dataset.col;
        const cell = heading.querySelector?.(`.col_header_cell[data-col="${col}"]`);
        if (cell) {
          const titleBar = cell.querySelector?.('.col_header_title_bar');
          const inputWrap = cell.querySelector?.('.col_filter_input_wrapper');
          const input = cell.querySelector?.('.col_filter_input');
          if (titleBar) titleBar.style.display = 'none';
          if (inputWrap) inputWrap.style.display = 'flex';
          if (input) {
            input.focus();
            input.select?.();
          }
        }
        return;
      }

      const closeBtn = event.target.closest?.('.col_filter_close_btn');
      if (closeBtn) {
        const col = closeBtn.dataset.col;
        const cell = heading.querySelector?.(`.col_header_cell[data-col="${col}"]`);
        if (cell) {
          const input = cell.querySelector?.('.col_filter_input');
          if (input) {
            input.value = '';
          }
          cell.classList.remove('has_active_filter');
          const titleBar = cell.querySelector?.('.col_header_title_bar');
          const inputWrap = cell.querySelector?.('.col_filter_input_wrapper');
          if (inputWrap) inputWrap.style.display = 'none';
          if (titleBar) titleBar.style.display = '';
          onColumnFilterChanged();
        }
      }
    });

    heading.addEventListener('input', function(event) {
      if (event.target.classList?.contains?.('col_filter_input')) {
        const col = event.target.dataset.col;
        const cell = heading.querySelector?.(`.col_header_cell[data-col="${col}"]`);
        if (cell) {
          if (event.target.value.trim()) {
            cell.classList.add('has_active_filter');
          } else {
            cell.classList.remove('has_active_filter');
          }
        }
        debouncedColumnFilter();
      }
    });

    heading.addEventListener('keydown', function(event) {
      if (event.target.classList?.contains?.('col_filter_input') && event.key === 'Escape') {
        const col = event.target.dataset.col;
        const cell = heading.querySelector?.(`.col_header_cell[data-col="${col}"]`);
        if (cell) {
          event.target.value = '';
          cell.classList.remove('has_active_filter');
          const titleBar = cell.querySelector?.('.col_header_title_bar');
          const inputWrap = cell.querySelector?.('.col_filter_input_wrapper');
          if (inputWrap) inputWrap.style.display = 'none';
          if (titleBar) titleBar.style.display = '';
          onColumnFilterChanged();
        }
      }
    });

    heading.addEventListener('focusout', function(event) {
      if (event.target.classList?.contains?.('col_filter_input')) {
        if (!event.target.value.trim()) {
          const col = event.target.dataset.col;
          const cell = heading.querySelector?.(`.col_header_cell[data-col="${col}"]`);
          if (cell) {
            const titleBar = cell.querySelector?.('.col_header_title_bar');
            const inputWrap = cell.querySelector?.('.col_filter_input_wrapper');
            if (inputWrap) inputWrap.style.display = 'none';
            if (titleBar) titleBar.style.display = '';
          }
        }
      }
    });
  }

  const debouncedColumnFilter = debounce(function() {
    onColumnFilterChanged();
  }, INPUT_BOX_DELAY);

  const filterEvents = debouncedColumnFilter;

  function onColumnFilterChanged() {
    updateFilterOptions();
    filterAllUrlRows();
    updateAllButtons();
  }

  function updateFilterOptions() {
    activeColumnFilters = getActiveColumnFilters();
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
    }
  }

  function handleUrlRowClick(event) {
    const row = event.target?.closest?.('.web_event_list_blank');
    if (row) {
      markSelectedRequest(row.id);
    }
  }

  const setPatternsToExclude = debounce(function(event) {
    excludeURLsList = normalizePatterns(event.target.value).map((s) => s.toLowerCase());
  }, INPUT_BOX_DELAY);

  const setPatternsToBlock = debounce(function(event) {
    blockURLsList = stringToArray(event.target.value);
    updateBlockSessionRules(blockURLsList ?? []);
  }, INPUT_BOX_DELAY);

  const setPatternsToInclude = debounce(function(event) {
    includeURLsList = normalizePatterns(event.target.value).map((s) => s.toLowerCase());
  }, INPUT_BOX_DELAY);

  function setInitialStateOfPage() {
    updateFilterOptions();
    isCaptureFormDataEnabled = getById('include_form_data').checked;
    optimizeResponseCookies = getById('optimize_response_cookies').checked;
    includeURLsList = normalizePatterns(getById('track_urls_pattern').value).map((s) => s.toLowerCase());
    excludeURLsList = normalizePatterns(getById('exclude_urls_pattern').value).map((s) => s.toLowerCase());
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
    const clearBtn = getById('clear_filter_web_events');
    if (clearBtn) {
      clearBtn.disabled = !activeColumnFilters;
    }
  }

  function updateDeleteFilteredButton() {
    const isEnabled = Boolean(activeColumnFilters) &&
      Boolean(getById('urls_list')?.querySelector('.web_event_list_blank:not(.web_event_list_hide)'));
    getById('delete_all_filtered_web_events').disabled = !isEnabled;
  }

  function updateDeleteSelectedButton() {
    getById('delete_selected_web_event').disabled = !getSelectedEvent();
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
