let customManifestDetails;

function onError(e) {
  console.error(e);
}

// Shorthand for document.getElementById
function getById(elementId) {
  return document.getElementById(elementId);
}

// Shorthand for document.getElementsByClassName which returns a live HTMLCollection of found elements.
function getByClassNames(classNamesSpaceDelimited) {
  return document.getElementsByClassName(classNamesSpaceDelimited);
}

const DIGIT_REGEX = /^\d/;
const ALPHABET_REGEX = /^[a-zA-Z]/;
const SYMBOL_REGEX = /^[^\w]/;

function sortArray(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const scoreA = SYMBOL_REGEX.test(a) * 1 || DIGIT_REGEX.test(a) * 10 || ALPHABET_REGEX.test(a) * 100;
  const scoreB = SYMBOL_REGEX.test(b) * 1 || DIGIT_REGEX.test(b) * 10 || ALPHABET_REGEX.test(b) * 100;

  if (scoreA !== scoreB) {
    return scoreA - scoreB;
  } else if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }
  return 0;
}

function stringToArray(stringWithDelimiter, delimiter = ',') {
  if (stringWithDelimiter?.trim().length > 0) {
    // split, trim empty spaces, then remove empty strings
    return stringWithDelimiter.split(delimiter).map((e) => e.trim()).filter(Boolean);
  }
  return undefined;
}

function arrayToString(array, delimiter = ', ') {
  if (Array.isArray(array)) {
    return array.join(delimiter);
  }
  if (typeof array === 'string') {
    return array;
  }
  return '';
}

function normalizePatterns(val) {
  if (Array.isArray(val)) {
    return val;
  }
  if (typeof val === 'string' && val.trim().length > 0) {
    return stringToArray(val) ?? [];
  }
  return [];
}

function filterWithLength(array, length = 0) {
  return array?.filter((e) => e.length > length) ?? [];
}

function uniqueArray(arrayWithEntries) {
  return arrayWithEntries?.length ? [...new Set(arrayWithEntries)] : [];
}

function sortMapByKey(unsortedMap) {
  //  javascript map do not have sort by default
  return new Map([...unsortedMap.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/** This sorts the object which has name as a property e.g.:
   * [
      {"name":"Host","value":"www.google.com"},
      {"name":"Accept","value":"text"},
      {"name":"Accept-Language","value":"en-US"}
     ]
   *
*/
function sortJsonByProperty(jsonObjectArray, property) {
  return jsonObjectArray.sort((a, b) => a[property]?.localeCompare(b[property]));
}


function getManifestDetails() {
  if (!customManifestDetails) {
    const manifest = httpTracker.browser.runtime.getManifest();
    if (manifest?.action) {
      customManifestDetails = {
        title: `${manifest.action.default_title} (version : ${manifest.version})`,
      };
    }
  }
  return customManifestDetails;
}

const BLOCK_RULE_BASE = 1000;
const HEADER_RULE_BASE = 2000;
const MAX_BLOCK_RULES = 1000;
const MAX_HEADER_RULES = 1000;

function ruleIdRange(base, max) {
  return Array.from({length: max}, (_, i) => base + i);
}

const CHROME_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'xmlhttprequest', 'other',
  'script', 'stylesheet', 'image', 'font', 'object', 'media',
  'websocket', 'ping', 'csp_report',
];

const FIREFOX_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'xmlhttprequest', 'other',
  'script', 'stylesheet', 'image', 'font', 'object', 'media',
  'websocket', 'ping', 'csp_report',
  'beacon', 'imageset', 'json', 'object_subrequest', 'speculative',
  'web_manifest',
];

const FALLBACK_RESOURCE_TYPES = CHROME_RESOURCE_TYPES;

function getAllResourceTypes() {
  const isFirefox = (typeof httpTracker !== 'undefined' && (httpTracker.isFF || httpTracker.isFirefox));
  if (isFirefox) {
    return FIREFOX_RESOURCE_TYPES;
  }
  const dnrResourceType = (typeof httpTracker !== 'undefined' &&
    httpTracker.browser?.declarativeNetRequest?.ResourceType);
  if (dnrResourceType && typeof dnrResourceType === 'object') {
    return Object.values(dnrResourceType);
  }
  return CHROME_RESOURCE_TYPES;
}

const ALL_RESOURCE_TYPES = getAllResourceTypes();

function updateBlockSessionRules(patterns) {
  const removeRuleIds = ruleIdRange(BLOCK_RULE_BASE, MAX_BLOCK_RULES);
  const resourceTypes = getAllResourceTypes();
  const addRules = normalizePatterns(patterns)
      .filter((p) => p.trim().length > 0)
      .map((pattern, index) => ({
        id: BLOCK_RULE_BASE + index,
        priority: 1,
        action: {
          type: 'block',
        },
        condition: {
          urlFilter: `*${pattern.trim()}*`, resourceTypes,
        },
      }));
  return httpTracker.browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds, addRules,
  }).catch(onError);
}

function updateHeaderModifySessionRules(headerRows) {
  const removeRuleIds = ruleIdRange(HEADER_RULE_BASE, MAX_HEADER_RULES);
  const resourceTypes = getAllResourceTypes();
  const addRules = (headerRows ?? [])
      .filter((row) => row.name?.trim() && row.value !== undefined)
      .filter((row) => RFC_HEADER_NAME_REGEX.test(row.name.trim()))
      .filter((row) => !FORBIDDEN_HEADERS.some((v) => row.name.toLowerCase() === v.toLowerCase()) &&
                       !FORBIDDEN_HEADER_PREFIXES.some((p) => row.name.toLowerCase().startsWith(p.toLowerCase())))
      .map((row, index) => ({
        id: HEADER_RULE_BASE + index,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{
            header: row.name.trim(), operation: 'set', value: String(row.value),
          }],
        },
        condition: {
          urlFilter: row.url?.trim() ? `*${row.url.trim()}*` : '*',
          resourceTypes,
        },
      }));
  return httpTracker.browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds, addRules,
  }).catch(onError);
}

function clearAllSessionRules() {
  if (httpTracker.browser?.declarativeNetRequest?.getSessionRules) {
    return httpTracker.browser.declarativeNetRequest.getSessionRules()
        .then((existingRules) => {
          const removeRuleIds = existingRules.map((rule) => rule.id);
          if (removeRuleIds.length > 0) {
            return httpTracker.browser.declarativeNetRequest.updateSessionRules({
              removeRuleIds,
              addRules: [],
            });
          }
          return undefined;
        })
        .catch(onError);
  }
  const allIds = [
    ...ruleIdRange(BLOCK_RULE_BASE, MAX_BLOCK_RULES),
    ...ruleIdRange(HEADER_RULE_BASE, MAX_HEADER_RULES),
  ];
  return httpTracker.browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: allIds,
    addRules: [],
  }).catch(onError);
}

function getPropertyFromStorage(details, key) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
    return undefined;
  }
  return details?.[key];
}

function setPropertyToStorage(key, value) {
  httpTracker.browser.storage.sync.set({[key]: value}).catch(onError);
}

function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  if (dataView.byteLength < 2) {
    return 'binary';
  }
  const b0 = dataView.getUint8(0);
  const b1 = dataView.getUint8(1);
  if (b0 === 0x1f && b1 === 0x8b) {
    return 'gzip';
  }
  if (b0 === 0x78 && (b1 === 0x9c || b1 === 0xda || b1 === 0x01 || b1 === 0x5e)) {
    return 'deflate';
  }
  if (dataView.byteLength >= 4) {
    const b2 = dataView.getUint8(2);
    const b3 = dataView.getUint8(3);
    if (b0 === 0xfd && b1 === 0x2f && b2 === 0xb5 && b3 === 0x2f) {
      return 'zstd';
    }
    if (b0 === 0x04 && b1 === 0x22 && b2 === 0x4d && b3 === 0x18) {
      return 'lz4';
    }
  }
  return 'compressed or binary';
}

function getCookieNameValue(cookie) {
  const firstOccurrence = cookie.indexOf('=');
  const cookieObj = {};
  if (firstOccurrence > -1) {
    cookieObj.cookieName = cookie.substring(0, firstOccurrence).trim();
    cookieObj.cookieValue = cookie.substring(firstOccurrence + 1);
    // https://tools.ietf.org/html/rfc6265#page-10
    // https://tools.ietf.org/html/rfc6265#section-4.1.1
    if (cookieObj.cookieValue) {
      (stringToArray(cookieObj.cookieValue, ';') ?? []).forEach((attribute) => {
        if (attribute) {
          const attributeKeyValue = attribute.trim().split('=');
          // toLowerCase : chrome sends as domain, FF sends as Domain
          if (attributeKeyValue[0].toLowerCase() === 'domain' || attributeKeyValue[0].toLowerCase() === 'path') {
            cookieObj[attributeKeyValue[0].toLowerCase()] = attributeKeyValue[1]?.trim();
          }
        }
      });
    }
  }
  return cookieObj;
}

function removeCookies(cookies) {
  if (!cookies?.length) {
    return;
  }
  const removedCookies = [];
  for (const cookie of cookies) {
    const cleanDomain = cookie.domain?.replace(/^\./, '') ?? '';
    const path = cookie.path?.startsWith('/') ? cookie.path : `/${cookie.path || ''}`;
    const protocol = cookie.secure ? 'https:' : 'http:';
    const cookieUrl = `${protocol}//${cleanDomain}${path}`;
    const removeDetails = {
      url: cookieUrl,
      name: cookie.name,
    };
    if (cookie.storeId) {
      removeDetails.storeId = cookie.storeId;
    }
    if (cookie.partitionKey) {
      removeDetails.partitionKey = cookie.partitionKey;
    }
    if (cookie.firstPartyDomain) {
      removeDetails.firstPartyDomain = cookie.firstPartyDomain;
    }
    const removed = httpTracker.browser.cookies.remove(removeDetails);
    removedCookies.push(removed);
  }
  Promise.all(removedCookies).catch(onError);
}

function matchesFilter(text, patterns, isAND) {
  if (!patterns || patterns.length === 0) {
    return true;
  }
  const str = (text || '').toString().toLowerCase();
  if (!isAND) {
    return patterns.some((v) => str.includes(v.toLowerCase()));
  }
  let index = 0;
  for (const pattern of patterns) {
    index = str.indexOf(pattern.toLowerCase(), index);
    if (index === -1) {
      return false;
    }
    index += pattern.length;
  }
  return true;
}

function parseSmartFilter(filterString) {
  if (!filterString) {
    return null;
  }
  const raw = filterString.trim();
  if (raw.length < 2) {
    return null;
  }
  if (raw.includes(DELIMITER_AND) && !raw.includes(DELIMITER_OR)) {
    const patterns = filterWithLength(stringToArray(raw, DELIMITER_AND), 1);
    return patterns.length > 0 ? { type: 'and', patterns } : null;
  }
  if (raw.includes(DELIMITER_OR) && !raw.includes(DELIMITER_AND)) {
    const patterns = filterWithLength(stringToArray(raw, DELIMITER_OR), 1);
    return patterns.length > 0 ? { type: 'or', patterns } : null;
  }

  const tokens = raw.split(/\s+/).filter(Boolean);
  const conditions = [];
  const textPatterns = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower.startsWith('method:')) {
      const val = lower.slice(7).trim();
      if (val) conditions.push({ field: 'method', value: val });
    } else if (lower.startsWith('status:')) {
      const val = lower.slice(7).trim();
      if (val) conditions.push({ field: 'status', value: val });
    } else if (lower.startsWith('cache:')) {
      const val = lower.slice(6).trim();
      if (val) conditions.push({ field: 'cache', value: val });
    } else if (lower === 'is:cached' || lower === 'is:from-cache') {
      conditions.push({ field: 'cache', value: 'true' });
    } else if (lower === 'is:error') {
      conditions.push({ field: 'status', value: 'error' });
    } else if (lower.startsWith('url:')) {
      const val = token.slice(4).trim();
      if (val) textPatterns.push(val);
    } else {
      textPatterns.push(token);
    }
  }

  if (conditions.length === 0 && textPatterns.length === 0) {
    return null;
  }

  return {
    type: 'smart',
    conditions,
    textPatterns,
  };
}

function matchesSmartFilter(elementOrData, parsedFilter) {
  if (!parsedFilter) {
    return true;
  }
  let url = '';
  let method = '';
  let status = '';
  let date = '';
  let cache = '';
  let isError = false;

  if (elementOrData && elementOrData.children) {
    url = elementOrData.children[0]?.textContent || '';
    method = elementOrData.children[1]?.textContent || '';
    status = elementOrData.children[2]?.textContent || '';
    date = elementOrData.children[3]?.textContent || '';
    cache = elementOrData.children[4]?.textContent || '';
    isError = elementOrData.classList?.contains?.('web_event_style_error') || false;
  } else if (elementOrData) {
    url = elementOrData.url || '';
    method = elementOrData.method || '';
    status = String(elementOrData.statusCode ?? elementOrData.status ?? '');
    date = elementOrData.date || '';
    cache = String(elementOrData.fromCache ?? elementOrData.cache ?? '');
    isError = Boolean(elementOrData.error || (status && Number(status) >= 400));
  }

  if (parsedFilter.type === 'and') {
    return matchesFilter(url, parsedFilter.patterns, true);
  }
  if (parsedFilter.type === 'or') {
    const rowText = `${url} ${method} ${status} ${cache}`;
    return matchesFilter(rowText, parsedFilter.patterns, false);
  }

  for (const cond of parsedFilter.conditions) {
    if (cond.field === 'method') {
      if (!method.toLowerCase().includes(cond.value)) return false;
    } else if (cond.field === 'status') {
      const s = status.toLowerCase();
      if (cond.value === 'error') {
        if (!isError && s !== 'error' && !(Number(s) >= 400)) return false;
      } else if (cond.value.endsWith('xx')) {
        const prefix = cond.value[0];
        if (!s.startsWith(prefix)) return false;
      } else {
        if (!s.includes(cond.value)) return false;
      }
    } else if (cond.field === 'cache') {
      const c = cache.toLowerCase();
      if (cond.value === 'true' || cond.value === '1') {
        if (c !== 'true') return false;
      } else if (cond.value === 'false' || cond.value === '0') {
        if (c === 'true') return false;
      } else if (!c.includes(cond.value)) {
        return false;
      }
    }
  }

  for (const text of parsedFilter.textPatterns) {
    const lowerText = text.toLowerCase();
    if (!url.toLowerCase().includes(lowerText) && !method.toLowerCase().includes(lowerText)) {
      return false;
    }
  }

  return true;
}

function matchesColumnFilters(elementOrData, filters) {
  if (!filters || Object.keys(filters).length === 0) {
    return true;
  }
  let url = '';
  let method = '';
  let status = '';
  let date = '';
  let cache = '';
  let isError = false;

  if (elementOrData && elementOrData.children) {
    url = elementOrData.children[0]?.textContent || '';
    method = elementOrData.children[1]?.textContent || '';
    status = elementOrData.children[2]?.textContent || '';
    date = elementOrData.children[3]?.textContent || '';
    cache = elementOrData.children[4]?.textContent || '';
    isError = elementOrData.classList?.contains?.('web_event_style_error') || false;
  } else if (elementOrData) {
    url = elementOrData.url || '';
    method = elementOrData.method || '';
    status = String(elementOrData.statusCode ?? elementOrData.status ?? '');
    date = elementOrData.date || '';
    cache = String(elementOrData.fromCache ?? elementOrData.cache ?? '');
    isError = Boolean(elementOrData.error || (status && Number(status) >= 400));
  }

  if (filters.url) {
    const q = filters.url.trim().toLowerCase();
    const u = url.toLowerCase();
    if (q.includes('&')) {
      const tokens = stringToArray(q, '&').map((s) => s.toLowerCase());
      if (!matchesFilter(u, tokens, true)) return false;
    } else if (q.includes('|')) {
      const tokens = stringToArray(q, '|').map((s) => s.toLowerCase());
      if (!matchesFilter(u, tokens, false)) return false;
    } else {
      if (!u.includes(q)) return false;
    }
  }

  if (filters.method) {
    const q = filters.method.trim().toLowerCase();
    const m = method.toLowerCase();
    if (q.includes('|')) {
      const tokens = stringToArray(q, '|').map((s) => s.toLowerCase());
      if (!tokens.some((token) => m.includes(token))) return false;
    } else {
      if (!m.includes(q)) return false;
    }
  }

  if (filters.status) {
    const q = filters.status.trim().toLowerCase();
    const s = status.toLowerCase();
    if (q === 'error') {
      if (!isError && s !== 'error' && !(Number(s) >= 400)) return false;
    } else if (q.endsWith('xx')) {
      const prefix = q[0];
      if (!s.startsWith(prefix)) return false;
    } else if (q.includes('|')) {
      const tokens = stringToArray(q, '|').map((t) => t.toLowerCase());
      const matched = tokens.some((t) => {
        if (t.endsWith('xx')) return s.startsWith(t[0]);
        if (t === 'error') return isError || s === 'error' || Number(s) >= 400;
        return s.includes(t);
      });
      if (!matched) return false;
    } else {
      if (!s.includes(q)) return false;
    }
  }

  if (filters.date) {
    const q = filters.date.trim().toLowerCase();
    if (!date.toLowerCase().includes(q)) return false;
  }

  if (filters.cache) {
    const q = filters.cache.trim().toLowerCase();
    const c = cache.toLowerCase();
    if (q === 'true' || q === '1' || q === 'cached' || q === 'yes') {
      if (c !== 'true') return false;
    } else if (q === 'false' || q === '0' || q === 'uncached' || q === 'no') {
      if (c === 'true') return false;
    } else {
      if (!c.includes(q)) return false;
    }
  }

  return true;
}

function maskValue(key, value, maskPatterns, isEnabled) {
  if (!isEnabled || !key) {
    return value;
  }
  const target = key.toString().toLowerCase();
  const normalized = normalizePatterns(maskPatterns);
  const isMatched = normalized.some((p) => target.includes(p.toLowerCase()));
  if (isMatched) {
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

function matchesIncludePattern(url, localList, globalList) {
  const hasLocal = localList?.length > 0;
  const hasGlobal = globalList?.length > 0;
  if (!hasLocal && !hasGlobal) {
    return true;
  }
  const target = (url || '').toLowerCase();
  if (hasLocal) {
    const local = Array.isArray(localList) ? localList : normalizePatterns(localList);
    if (local.some((v) => target.includes(v.toLowerCase()))) {
      return true;
    }
  }
  if (hasGlobal) {
    const global = Array.isArray(globalList) ? globalList : normalizePatterns(globalList);
    if (global.some((v) => target.includes(v.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

function matchesExcludePattern(url, localList, globalList) {
  const hasLocal = localList?.length > 0;
  const hasGlobal = globalList?.length > 0;
  if (!hasLocal && !hasGlobal) {
    return false;
  }
  const target = (url || '').toLowerCase();
  if (hasLocal) {
    const local = Array.isArray(localList) ? localList : normalizePatterns(localList);
    if (local.some((v) => target.includes(v.toLowerCase()))) {
      return true;
    }
  }
  if (hasGlobal) {
    const global = Array.isArray(globalList) ? globalList : normalizePatterns(globalList);
    if (global.some((v) => target.includes(v.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

function addMarkTag(text, compiledFindPattern) {
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
