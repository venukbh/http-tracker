var customManifestDetails;
var addModifyRequestHeadersList;
var blockURLSList;
var includeURLsList;
var excludeURLsList;

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

function stringToArray(stringWithDelimiter, delimiter = ",") {
  if (stringWithDelimiter && stringWithDelimiter.trim().length > 0) {
    // split, trim empty spaces, then remove empty strings
    return (stringWithDelimiter.split(delimiter).map(e => e.trim()).filter(e => e));
  } else {
    return undefined;
  }
}

function filterWithLength(array, length = 0) {
  if (array && array.length > 0) {
    return (array.filter(e => e.length > length));
  }
}

function uniqueArray(arrayWithEntries) {
  if (arrayWithEntries && arrayWithEntries.length) {
    return [...new Set(arrayWithEntries)];
  } else {
    return "";
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
  let sortedObject = jsonObjectArray.sort(function(a, b) {
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
    let manifest = httpTracker.browser.runtime.getManifest();
    if (manifest) {
      customManifestDetails = {};
      customManifestDetails.title = `${manifest.browser_action.default_title} (version : ${manifest.version})`;
    }
  }
  return customManifestDetails;
}

function blockRequests(webEvent) {
  let block = false;
  if (blockURLSList) {
    blockURLSList.some(value => {
      if (webEvent.url.includes(value)) {
        block = true;
      }
    });
  }
  return block;
}

function addModifyRequestHeaders(webEvent) {
  let addHeaders = true;
  if (includeURLsList) {
    if (!(includeURLsList.some(value => webEvent.url.toLowerCase().includes(value)))) {
      return webEvent.requestHeaders;
    }
  }
  if (excludeURLsList) {
    if (excludeURLsList.some(value =>
        webEvent.url.includes(value)
      )) {
      return webEvent.requestHeaders;
    }
  }
  if (addHeaders && addModifyRequestHeadersList) {
    addModifyRequestHeadersList.forEach(newHeader => {
      if ((newHeader.hasOwnProperty("url") && webEvent.url.includes(newHeader['url'])) ||
        !newHeader.hasOwnProperty("url")) {
        let found = false;
        for (let header of webEvent.requestHeaders) {
          if (header.name.toLowerCase() === newHeader.name.toLowerCase()) {
            header.value = newHeader.value;
            found = true;
            break;
          }
        }
        if (!found) {
          webEvent.requestHeaders.push({
            'name': newHeader.name,
            'value': newHeader.value
          });
        }
      }
    });
  }
  return webEvent.requestHeaders;
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
    [key]: value
  }, function() {
    // nothing to do after successful storing
    // console.log(`Successfully stored ${key} = ${value}`);
  });
}