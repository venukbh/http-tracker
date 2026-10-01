let customManifestDetails;
let addModifyRequestHeadersList;
let blockURLSList;
let includeURLsList;
let excludeURLsList;

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
  const symbolRegex = /^[^\w\s]/;
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
  if (stringWithDelimiter && stringWithDelimiter.trim().length > 0) {
    // split, trim empty spaces, then remove empty strings
    return (stringWithDelimiter.split(delimiter).map((e) => e.trim()).filter((e) => e));
  } else {
    return undefined;
  }
}

function filterWithLength(array, length = 0) {
  if (array && array.length > 0) {
    return (array.filter((e) => e.length > length));
  }
}

function uniqueArray(arrayWithEntries) {
  if (arrayWithEntries && arrayWithEntries.length) {
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

function getStoredDetails(details) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
  } else {
    let existingValues = [];
    if (details.httpTrackerGlobalExcludePatterns) {
      existingValues = details.httpTrackerGlobalExcludePatterns;
    }
    return existingValues;
  }
}

function setRequestHeadersList(headersList) {
  addModifyRequestHeadersList = headersList;
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

const DNR_BLOCK_RULE_BASE = 1000;
const DNR_HEADER_RULE_BASE = 2000;
const DNR_MAX_BLOCK_RULES = 100;
const DNR_MAX_HEADER_RULES = 100;

const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'xmlhttprequest', 'other',
  'script', 'stylesheet', 'image', 'font', 'object', 'media', 'websocket', 'ping',
];

function updateBlockSessionRules(patterns) {
  const removeRuleIds = Array.from({
    length: DNR_MAX_BLOCK_RULES,
  }, (_, i) => DNR_BLOCK_RULE_BASE + i);
  const addRules = (patterns || [])
      .filter((p) => p.trim().length > 0)
      .map((pattern, index) => ({
        id: DNR_BLOCK_RULE_BASE + index,
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
  });
}

function updateHeaderModifySessionRules(headerRows) {
  const removeRuleIds = Array.from({
    length: DNR_MAX_HEADER_RULES,
  }, (_, i) => DNR_HEADER_RULE_BASE + i);
  const addRules = (headerRows || [])
      .filter((row) => row.name && row.name.trim() && row.value !== undefined)
      .filter((row) => !FORBIDDEN_HEADERS.some((v) => row.name.toLowerCase() === v.toLowerCase()) &&
                       !FORBIDDEN_HEADERS_PATTERN.some((p) => row.name.toLowerCase().startsWith(p.toLowerCase())))
      .map((row, index) => ({
        id: DNR_HEADER_RULE_BASE + index,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{
            header: row.name.trim(), operation: 'set', value: String(row.value),
          }],
        },
        condition: {
          urlFilter: row.url && row.url.trim() ? `*${row.url.trim()}*` : '*',
          resourceTypes: ALL_RESOURCE_TYPES,
        },
      }));
  httpTracker.browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds, addRules,
  });
}

function clearAllSessionRules() {
  const allIds = [
    ...Array.from({
      length: DNR_MAX_BLOCK_RULES,
    }, (_, i) => DNR_BLOCK_RULE_BASE + i),
    ...Array.from({
      length: DNR_MAX_HEADER_RULES,
    }, (_, i) => DNR_HEADER_RULE_BASE + i),
  ];
  httpTracker.browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: allIds, addRules: [],
  });
}

function getPropertyFromStorage(details, key) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
  } else {
    // console.log(`value from storage for ${key} = ${details[key]}`);
    return details[key];
  }
}

function setPropertyToStorage(key, value) {
  // console.log(`saving values into storage for ${key} = ${value}`);
  httpTracker.browser.storage.sync.set({
    [key]: value,
  }, function() {
    // nothing to do after successful storing
    // console.log(`Successfully stored ${key} = ${value}`);
  });
}
