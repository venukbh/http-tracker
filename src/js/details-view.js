const httpTrackerDetailsView = (function() {
  const decoder = new TextDecoder('UTF-8');
  const ignoreHeaders = new Set(['frameAncestors', 'frameId', 'parentFrameId', 'tabId', 'timeStamp', 'type', 'callerName', 'requestIdEnhanced', 'requestId']);

  function renderBannerRow(title) {
    return `<tr><td colspan="2" class="web_event_detail_cookie">${escapeHtml(title)}</td></tr>`;
  }

  function renderNoticeRow(message, key = '') {
    return `<tr><td class="web_event_detail_header_key">${escapeHtml(key)}</td><td class="web_event_detail_header_value web_event_style_error">${escapeHtml(message)}</td></tr>`;
  }

  function renderMessageRow(content) {
    return `<tr style="white-space: pre-wrap; word-break: break-all;"><td colspan="2">${content}</td></tr>`;
  }

  function renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern, isError = false) {
    const displayVal = maskValue(key, value, maskPatterns, isMaskEnabled);
    const errorClass = isError ? ' web_event_style_error' : '';
    return `<tr><td class="web_event_detail_header_key">${addMarkTag(key, compiledFindPattern)}</td><td class="web_event_detail_header_value${errorClass}">${addMarkTag(displayVal, compiledFindPattern)}</td></tr>`;
  }

  function renderSelectedEventDetails({
    requestEvent,
    responseEvent,
    requestBody,
    maskPatterns,
    isMaskEnabled,
    optimizeResponseCookies,
    compiledFindPattern,
  }) {
    const requestContainer = buildURLDetailsContainer(requestEvent, 'requestDetails', maskPatterns, isMaskEnabled, compiledFindPattern, false);
    const responseContainer = buildURLDetailsContainer(responseEvent, 'responseDetails', maskPatterns, isMaskEnabled, compiledFindPattern, optimizeResponseCookies);
    const requestFormContainer = buildRequestFormContainer(requestBody, maskPatterns, isMaskEnabled, compiledFindPattern);

    const reqEl = getById('web_event_details_selected_request');
    const resEl = getById('web_event_details_selected_response');
    if (reqEl) {
      reqEl.style.border = '1px solid';
    }
    if (resEl) {
      resEl.style.border = '1px solid';
    }

    const reqBodyEl = getById('request_headers_details_body') || getById('request_headers_details');
    if (reqBodyEl) {
      reqBodyEl.innerHTML = requestContainer + requestFormContainer;
    }

    const resBodyEl = getById('response_headers_details_body') || getById('response_headers_details');
    if (resBodyEl) {
      resBodyEl.innerHTML = responseContainer;
    }

    const detailsContainer = getById('web_details_selected_container');
    if (detailsContainer) {
      detailsContainer.style.visibility = 'visible';
    }
  }

  function clearDetailsView() {
    const reqEl = getById('web_event_details_selected_request');
    const resEl = getById('web_event_details_selected_response');
    if (reqEl) {
      reqEl.style.border = 'none';
    }
    if (resEl) {
      resEl.style.border = 'none';
    }

    const reqHead = getById('web_event_detail_request_head');
    const resHead = getById('web_event_detail_response_head');
    if (reqHead) {
      reqHead.style.display = 'none';
    }
    if (resHead) {
      resHead.style.display = 'none';
    }

    const reqBodyEl = getById('request_headers_details_body') || getById('request_headers_details');
    if (reqBodyEl) {
      reqBodyEl.textContent = '';
    }

    const resBodyEl = getById('response_headers_details_body') || getById('response_headers_details');
    if (resBodyEl) {
      resBodyEl.textContent = '';
    }

    const detailsContainer = getById('web_details_selected_container');
    if (detailsContainer) {
      detailsContainer.style.visibility = 'hidden';
    }
  }

  function buildURLDetailsContainer(webEventIdDetails, detailsType, maskPatterns, isMaskEnabled, compiledFindPattern, optimizeResponseCookies) {
    let tableContent = '';
    let headersContent = '';
    if (webEventIdDetails) {
      tableContent = renderBannerRow('Headers');
      Object.entries(webEventIdDetails).forEach(([key, value]) => {
        if (key !== 'responseHeaders' && key !== 'requestHeaders') { // headers added by browser
          if (!ignoreHeaders.has(key) && value !== undefined && value !== null) {
            const content = typeof value !== 'object' ?
              value :
              Object.entries(value).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
            const isError = key === 'error' ||
              (key === 'statusCode' && Number(value) >= 400) ||
              (key === 'statusLine' && /\b[45]\d{2}\b/.test(String(value)));
            tableContent += renderKeyValueRow(key, content, maskPatterns, isMaskEnabled, compiledFindPattern, isError);
          }
        } else { // application headers
          const headers = sortJsonByProperty(value, 'name');
          headersContent = generateHeaderDetails(headers, optimizeResponseCookies, maskPatterns, isMaskEnabled, compiledFindPattern);
        }
      });
      if (detailsType === 'requestDetails' && !webEventIdDetails.requestHeaders) {
        headersContent = renderNoticeRow('Request blocked');
      }
    } else if (detailsType === 'responseDetails') {
      tableContent = renderNoticeRow('Response not available');
    } else {
      tableContent = renderNoticeRow('Request not available');
    }
    return tableContent + headersContent;
  }

  function buildRequestFormContainer(webEventIdRequestForm, maskPatterns, isMaskEnabled, compiledFindPattern) {
    let formData = '';
    if (webEventIdRequestForm) {
      if (webEventIdRequestForm.formData) {
        formData = renderBannerRow('Body (form fields data)');
        Object.entries(webEventIdRequestForm.formData).forEach(([key, value]) => {
          formData += renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern);
        });
      } else if (webEventIdRequestForm.raw) {
        formData = renderBannerRow('Body (raw form data)');
        for (const eachByte of webEventIdRequestForm.raw) {
          if (!eachByte.bytes) {
            if (eachByte.file) {
              const fileNotice = `<span style="color:#888;font-style:italic;">[File upload: ${escapeHtml(eachByte.file)}]</span>`;
              formData += renderMessageRow(fileNotice);
            }
            continue;
          }
          const dataView = new DataView(eachByte.bytes);
          const decodedString = decoder.decode(dataView);
          let displayContent;
          if (isBinaryData(decodedString)) {
            const type = detectCompressionType(dataView);
            displayContent = `<span style="color:#888;font-style:italic;">[Binary data \u2014 ${dataView.byteLength} bytes, likely ${type}. Cannot display compressed content.]</span>`;
          } else {
            displayContent = addMarkTag(decodedString, compiledFindPattern);
          }
          formData += renderMessageRow(displayContent);
        }
      }
    }
    return formData;
  }

  function generateHeaderDetails(headers, optimizeResponseCookies, maskPatterns, isMaskEnabled, compiledFindPattern) {
    let generalHeadersContent = '';
    let bannerTitle = 'Cookies (sorted: symbols, 0-9, Aa-Zz)'; // request cookies
    let cookieContent = '';
    const optimizedCookiesMap = new Map();
    headers.forEach((header) => {
      // request cookies
      if (header.name === HEADER_NAME_COOKIE) {
        cookieContent += generateRequestCookieDetails(header.value, DELIMITER_REQUEST_COOKIE, maskPatterns, isMaskEnabled, compiledFindPattern);
      }
      // response cookies
      else if (header.name.toLowerCase() === HEADER_NAME_SET_COOKIE) {
        if (!optimizeResponseCookies) {
          bannerTitle = 'Cookies (unoptimized)';
          cookieContent += generateResponseCookieDetails(header.value, DELIMITER_RESPONSE_COOKIE, maskPatterns, isMaskEnabled, compiledFindPattern);
        } else {
          bannerTitle = 'Cookies (optimized)';
          buildOptimizedCookiesMap(header.value, DELIMITER_RESPONSE_COOKIE, optimizedCookiesMap);
        }
      }
      // other headers
      else {
        generalHeadersContent += renderKeyValueRow(header.name, header.value, maskPatterns, isMaskEnabled, compiledFindPattern);
      }
    });
    if (optimizeResponseCookies) {
      sortMapByKey(optimizedCookiesMap).forEach((value, key) => {
        cookieContent += renderKeyValueRow(key.split(':', 1)[0], value.cookieValue, maskPatterns, isMaskEnabled, compiledFindPattern);
      });
    }
    if (cookieContent) {
      cookieContent = renderBannerRow(bannerTitle) + cookieContent;
    }
    return generalHeadersContent + cookieContent;
  }

  function generateRequestCookieDetails(cookieValue, cookieDelim, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const cookieList = cookieValue.split(cookieDelim).sort(sortArray);
    let cookieContent = '';
    const cookieMap = new Map();
    cookieList.forEach((cookie) => {
      if (cookie) {
        const { cookieName, cookieValue: val } = getCookieNameValue(cookie);
        cookieMap.set(cookieName || cookie, val ?? '');
      }
    });
    cookieMap.forEach((value, key) => {
      cookieContent += renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern);
    });
    return cookieContent;
  }

  function generateResponseCookieDetails(cookieValue, cookieDelim, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const cookieList = cookieValue.split(cookieDelim);
    let cookieContent = '';
    cookieList.forEach((cookie) => {
      if (cookie) {
        const cookieDetails = getCookieNameValue(cookie);
        cookieContent += renderKeyValueRow(cookieDetails.cookieName, cookieDetails.cookieValue, maskPatterns, isMaskEnabled, compiledFindPattern);
      }
    });
    return cookieContent;
  }

  function buildOptimizedCookiesMap(cookieValue, cookieDelim, optimizedCookiesMap) {
    const cookieList = cookieValue.split(cookieDelim);
    cookieList.forEach((cookie) => {
      if (cookie) {
        let key = '';
        const cookieDetails = getCookieNameValue(cookie);
        const name = cookieDetails.cookieName?.trim() ?? '';
        const cleanDomain = cookieDetails.domain ? cookieDetails.domain.replace(/^\./, '').toLowerCase() : '';
        const path = cookieDetails.path ?? '';
        if (name && cleanDomain && path) {
          key = `${name}:${cleanDomain}:${path}`;
        } else if (name && cleanDomain) {
          key = `${name}:${cleanDomain}`;
        } else {
          key = `${name}`;
        }
        optimizedCookiesMap.set(key, cookieDetails);
      }
    });
  }

  function deleteCookiesForSelectedDomain() {
    const rawInput = getById('delete_cookies')?.value.trim();
    if (!rawInput) {
      return;
    }
    const domain = rawInput.replace(/^https?:\/\//i, '').split('/')[0];
    httpTracker.browser.cookies.getAll({
      domain,
    }).then(removeCookies).catch(onError);
  }

  return {
    renderSelectedEventDetails,
    clearDetailsView,
    deleteCookiesForSelectedDomain,
  };
})();
