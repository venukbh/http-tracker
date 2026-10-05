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

function sortArray(a, b) {
  const digitRegex = /^\d/;
  const alphabetRegex = /^[a-zA-Z]/;
  const symbolRegex = /^[^\w]/;
  a = a.toLowerCase();
  b = b.toLowerCase();
  const scoreA = symbolRegex.test(a) * 1 || digitRegex.test(a) * 10 || alphabetRegex.test(a) * 100;
  const scoreB = symbolRegex.test(b) * 1 || digitRegex.test(b) * 10 || alphabetRegex.test(b) * 100;

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
    return (stringWithDelimiter.split(delimiter).map((e) => e.trim()).filter((e) => e));
  } else {
    return undefined;
  }
}

function filterWithLength(array, length = 0) {
  if (array?.length > 0) {
    return (array.filter((e) => e.length > length));
  }
}

function uniqueArray(arrayWithEntries) {
  if (arrayWithEntries?.length) {
    return [...new Set(arrayWithEntries)];
  } else {
    return '';
  }
}

function sortMapByKey(unsortedMap) {
  //  javascript map do not have sort by default
  return new Map([...unsortedMap.entries()].sort());
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
  const sortedObject = jsonObjectArray.sort(function(a, b) {
    return a[property].localeCompare(b[property]);
  });
  return sortedObject;
}


function getManifestDetails() {
  if (!customManifestDetails) {
    const manifest = httpTracker.browser.runtime.getManifest();
    if (manifest) {
      customManifestDetails = {};
      customManifestDetails.title = `${manifest.action.default_title} (version : ${manifest.version})`;
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

const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'xmlhttprequest', 'other',
  'script', 'stylesheet', 'image', 'font', 'object', 'media', 'websocket', 'ping',
];

function updateBlockSessionRules(patterns) {
  const removeRuleIds = ruleIdRange(BLOCK_RULE_BASE, MAX_BLOCK_RULES);
  const addRules = (patterns || [])
      .filter((p) => p.trim().length > 0)
      .map((pattern, index) => ({
        id: BLOCK_RULE_BASE + index,
        priority: 1,
        action: {
          type: 'block',
        },
        condition: {
          urlFilter: `*${pattern.trim()}*`, resourceTypes: ALL_RESOURCE_TYPES,
        },
      }));
  httpTracker.browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds, addRules,
  }).catch(onError);
}

function updateHeaderModifySessionRules(headerRows) {
  const removeRuleIds = ruleIdRange(HEADER_RULE_BASE, MAX_HEADER_RULES);
  const addRules = (headerRows || [])
      .filter((row) => row.name?.trim() && row.value !== undefined)
      .filter((row) => !FORBIDDEN_HEADERS.some((v) => row.name.toLowerCase() === v.toLowerCase()) &&
                       !FORBIDDEN_HEADERS_PATTERN.some((p) => row.name.toLowerCase().startsWith(p.toLowerCase())))
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
          resourceTypes: ALL_RESOURCE_TYPES,
        },
      }));
  httpTracker.browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds, addRules,
  }).catch(onError);
}

function clearAllSessionRules() {
  const allIds = [
    ...ruleIdRange(BLOCK_RULE_BASE, MAX_BLOCK_RULES),
    ...ruleIdRange(HEADER_RULE_BASE, MAX_HEADER_RULES),
  ];
  httpTracker.browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: allIds, addRules: [],
  }).catch(onError);
}

function getPropertyFromStorage(details, key) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
  } else {
    return details[key];
  }
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
