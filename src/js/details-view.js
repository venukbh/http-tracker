const httpTrackerDetailsView = (function() {
  const decoder = new TextDecoder('UTF-8');
  const ignoreHeaders = new Set(['frameAncestors', 'frameId', 'parentFrameId', 'tabId', 'timeStamp', 'type', 'callerName', 'requestIdEnhanced', 'requestId', 'requestBody']);

  function appendMarkedText(parent, text, compiledFindPattern) {
    if (text === null || text === undefined) {
      return;
    }
    const str = String(text);
    if (!compiledFindPattern) {
      parent.appendChild(document.createTextNode(str));
      return;
    }
    compiledFindPattern.lastIndex = 0;
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
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(str.slice(lastIndex, match.index)));
      }
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      parent.appendChild(mark);
      lastIndex = match.index + match[0].length;
      match = compiledFindPattern.exec(str);
    }
    if (lastIndex < str.length) {
      parent.appendChild(document.createTextNode(str.slice(lastIndex)));
    }
  }

  function renderBannerRow(title) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'web_event_detail_cookie';
    td.textContent = title;
    tr.appendChild(td);
    return tr;
  }

  function renderNoticeRow(message, key = '') {
    const tr = document.createElement('tr');
    const tdKey = document.createElement('td');
    tdKey.className = 'web_event_detail_header_key';
    tdKey.textContent = key;
    const tdVal = document.createElement('td');
    tdVal.className = 'web_event_detail_header_value web_event_style_error';
    tdVal.textContent = message;
    tr.appendChild(tdKey);
    tr.appendChild(tdVal);
    return tr;
  }

  function renderMessageRow(contentNodeOrText, textAlign = 'left') {
    const tr = document.createElement('tr');
    tr.style.whiteSpace = 'pre-wrap';
    tr.style.wordBreak = 'break-all';
    if (textAlign === 'center') {
      tr.style.textAlign = 'center';
    }

    const td = document.createElement('td');
    td.colSpan = 2;
    if (textAlign === 'center') {
      td.style.textAlign = 'center';
    }

    if (contentNodeOrText && typeof contentNodeOrText === 'object') {
      if (Array.isArray(contentNodeOrText)) {
        contentNodeOrText.forEach((child) => td.appendChild(child));
      } else {
        td.appendChild(contentNodeOrText);
      }
    } else if (contentNodeOrText !== undefined && contentNodeOrText !== null) {
      td.appendChild(document.createTextNode(String(contentNodeOrText)));
    }

    tr.appendChild(td);
    return tr;
  }

  function renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern, isError = false) {
    const displayVal = maskValue(key, value, maskPatterns, isMaskEnabled);
    const tr = document.createElement('tr');

    const tdKey = document.createElement('td');
    tdKey.className = 'web_event_detail_header_key';
    appendMarkedText(tdKey, key, compiledFindPattern);
    tr.appendChild(tdKey);

    const tdVal = document.createElement('td');
    tdVal.className = 'web_event_detail_header_value' + (isError ? ' web_event_style_error' : '');
    appendMarkedText(tdVal, displayVal, compiledFindPattern);
    tr.appendChild(tdVal);

    return tr;
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
    const requestRows = buildURLDetailsRows(requestEvent, 'requestDetails', maskPatterns, isMaskEnabled, compiledFindPattern, false);
    const responseRows = buildURLDetailsRows(responseEvent, 'responseDetails', maskPatterns, isMaskEnabled, compiledFindPattern, optimizeResponseCookies);
    const requestFormRows = buildRequestFormRows(requestBody, maskPatterns, isMaskEnabled, compiledFindPattern);

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
      if (typeof reqBodyEl.replaceChildren === 'function') {
        reqBodyEl.replaceChildren(...requestRows, ...requestFormRows);
      } else {
        reqBodyEl.textContent = '';
        [...requestRows, ...requestFormRows].forEach((r) => reqBodyEl.appendChild(r));
      }
    }

    const resBodyEl = getById('response_headers_details_body') || getById('response_headers_details');
    if (resBodyEl) {
      if (typeof resBodyEl.replaceChildren === 'function') {
        resBodyEl.replaceChildren(...responseRows);
      } else {
        resBodyEl.textContent = '';
        responseRows.forEach((r) => resBodyEl.appendChild(r));
      }
    }

    const detailsContainer = getById('web_details_selected_container');
    if (detailsContainer) {
      detailsContainer.style.display = 'block';
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

    const copyCurlBtn = getById('copy_curl_button');
    if (copyCurlBtn) {
      copyCurlBtn.disabled = true;
      if (copyCurlBtn._copyTimeout) {
        clearTimeout(copyCurlBtn._copyTimeout);
        delete copyCurlBtn._copyTimeout;
      }
      copyCurlBtn.textContent = 'Copy as cURL';
      copyCurlBtn.classList.remove('copy_success');
    }

    const reqBodyEl = getById('request_headers_details_body') || getById('request_headers_details');
    if (reqBodyEl) {
      if (typeof reqBodyEl.replaceChildren === 'function') {
        reqBodyEl.replaceChildren();
      } else {
        reqBodyEl.textContent = '';
      }
    }

    const resBodyEl = getById('response_headers_details_body') || getById('response_headers_details');
    if (resBodyEl) {
      if (typeof resBodyEl.replaceChildren === 'function') {
        resBodyEl.replaceChildren();
      } else {
        resBodyEl.textContent = '';
      }
    }

    const detailsContainer = getById('web_details_selected_container');
    if (detailsContainer) {
      detailsContainer.style.display = 'none';
      detailsContainer.style.visibility = 'hidden';
    }
  }

  function buildURLDetailsRows(webEventIdDetails, detailsType, maskPatterns, isMaskEnabled, compiledFindPattern, optimizeResponseCookies) {
    const rows = [];
    if (webEventIdDetails) {
      rows.push(renderBannerRow('Headers'));

      const metadataRows = [];
      const headerRows = [];

      Object.entries(webEventIdDetails).forEach(([key, value]) => {
        if (key !== 'responseHeaders' && key !== 'requestHeaders') { // headers added by browser
          if (!ignoreHeaders.has(key) && value !== undefined && value !== null) {
            const content = typeof value !== 'object' ?
              value :
              Object.entries(value).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
            const isError = key === 'error' ||
              (key === 'statusCode' && Number(value) >= 400) ||
              (key === 'statusLine' && /\b[45]\d{2}\b/.test(String(value)));
            metadataRows.push(renderKeyValueRow(key, content, maskPatterns, isMaskEnabled, compiledFindPattern, isError));
          }
        } else if (Array.isArray(value)) { // application headers
          const headers = sortJsonByProperty(value, 'name');
          headerRows.push(...generateHeaderDetails(headers, optimizeResponseCookies, maskPatterns, isMaskEnabled, compiledFindPattern));
        }
      });

      rows.push(...metadataRows);
      rows.push(...headerRows);

      if (detailsType === 'requestDetails' && !webEventIdDetails.requestHeaders) {
        rows.push(renderNoticeRow('Request blocked'));
      }
    } else if (detailsType === 'responseDetails') {
      rows.push(renderNoticeRow('Response not available'));
    } else {
      rows.push(renderNoticeRow('Request not available'));
    }
    return rows;
  }

  function buildRequestFormRows(webEventIdRequestForm, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const rows = [];
    if (webEventIdRequestForm) {
      if (webEventIdRequestForm.formData) {
        rows.push(renderBannerRow('Body (form fields data)'));
        Object.entries(webEventIdRequestForm.formData).forEach(([key, value]) => {
          rows.push(renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern));
        });
      } else if (webEventIdRequestForm.raw) {
        rows.push(renderBannerRow('Body (raw form data)'));
        for (const eachByte of webEventIdRequestForm.raw) {
          if (!eachByte.bytes) {
            if (eachByte.file) {
              const fileSpan = document.createElement('span');
              fileSpan.style.color = '#888';
              fileSpan.style.fontStyle = 'italic';
              fileSpan.textContent = `[File upload: ${eachByte.file}]`;
              rows.push(renderMessageRow(fileSpan));
            }
            continue;
          }
          const dataView = new DataView(eachByte.bytes);
          const decodedString = decoder.decode(dataView);
          if (isBinaryData(decodedString)) {
            const type = detectCompressionType(dataView);
            const binarySpan = document.createElement('span');
            binarySpan.style.color = '#888';
            binarySpan.style.fontStyle = 'italic';
            binarySpan.textContent = `[Binary data \u2014 ${dataView.byteLength} bytes, likely ${type}. Cannot display compressed content.]`;
            rows.push(renderMessageRow(binarySpan));
          } else {
            const tr = document.createElement('tr');
            tr.style.whiteSpace = 'pre-wrap';
            tr.style.wordBreak = 'break-all';
            const td = document.createElement('td');
            td.colSpan = 2;
            appendMarkedText(td, decodedString, compiledFindPattern);
            tr.appendChild(td);
            rows.push(tr);
          }
        }
      } else if (webEventIdRequestForm.error) {
        rows.push(renderBannerRow('Body'));
        const errorSpan = document.createElement('span');
        errorSpan.className = 'web_event_style_warning';
        errorSpan.textContent = `[⚠️ Body unavailable from browser: ${webEventIdRequestForm.error} (e.g. streaming, keepalive, or beacon)]`;
        rows.push(renderMessageRow(errorSpan, 'center'));
      }
    }
    return rows;
  }

  function generateHeaderDetails(headers, optimizeResponseCookies, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const generalHeaderRows = [];
    let bannerTitle = 'Cookies (sorted: symbols, 0-9, Aa-Zz)'; // request cookies
    const cookieRows = [];
    const optimizedCookiesMap = new Map();
    headers.forEach((header) => {
      // request cookies
      if (header.name === HEADER_NAME_COOKIE) {
        cookieRows.push(...generateRequestCookieDetails(header.value, DELIMITER_REQUEST_COOKIE, maskPatterns, isMaskEnabled, compiledFindPattern));
      }
      // response cookies
      else if (header.name.toLowerCase() === HEADER_NAME_SET_COOKIE) {
        if (!optimizeResponseCookies) {
          bannerTitle = 'Cookies (unoptimized)';
          cookieRows.push(...generateResponseCookieDetails(header.value, DELIMITER_RESPONSE_COOKIE, maskPatterns, isMaskEnabled, compiledFindPattern));
        } else {
          bannerTitle = 'Cookies (optimized)';
          buildOptimizedCookiesMap(header.value, DELIMITER_RESPONSE_COOKIE, optimizedCookiesMap);
        }
      }
      // other headers
      else {
        generalHeaderRows.push(renderKeyValueRow(header.name, header.value, maskPatterns, isMaskEnabled, compiledFindPattern));
      }
    });
    if (optimizeResponseCookies) {
      sortMapByKey(optimizedCookiesMap).forEach((value, key) => {
        cookieRows.push(renderKeyValueRow(key.split(':', 1)[0], value.cookieValue, maskPatterns, isMaskEnabled, compiledFindPattern));
      });
    }
    if (cookieRows.length > 0) {
      return [...generalHeaderRows, renderBannerRow(bannerTitle), ...cookieRows];
    }
    return generalHeaderRows;
  }

  function generateRequestCookieDetails(cookieValue, cookieDelim, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const cookieList = cookieValue.split(cookieDelim).sort(sortArray);
    const rows = [];
    const cookieMap = new Map();
    cookieList.forEach((cookie) => {
      if (cookie) {
        const { cookieName, cookieValue: val } = getCookieNameValue(cookie);
        cookieMap.set(cookieName || cookie, val ?? '');
      }
    });
    cookieMap.forEach((value, key) => {
      rows.push(renderKeyValueRow(key, value, maskPatterns, isMaskEnabled, compiledFindPattern));
    });
    return rows;
  }

  function generateResponseCookieDetails(cookieValue, cookieDelim, maskPatterns, isMaskEnabled, compiledFindPattern) {
    const cookieList = cookieValue.split(cookieDelim);
    const rows = [];
    cookieList.forEach((cookie) => {
      if (cookie) {
        const cookieDetails = getCookieNameValue(cookie);
        rows.push(renderKeyValueRow(cookieDetails.cookieName, cookieDetails.cookieValue, maskPatterns, isMaskEnabled, compiledFindPattern));
      }
    });
    return rows;
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
    const btn = getById('delete_cookies_button');
    httpTracker.browser.cookies.getAll({
      domain,
    }).then((cookies) => {
      removeCookies(cookies);
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Deleted!';
        setTimeout(() => {
          if (btn) {
            btn.textContent = originalText;
          }
        }, 1200);
      }
    }).catch(onError);
  }

  return {
    renderSelectedEventDetails,
    clearDetailsView,
    deleteCookiesForSelectedDomain,
  };
})();
