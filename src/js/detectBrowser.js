const httpTracker =
  (window.browser) ? {
    browser: window.browser,
    isFF: true
  } : {
    browser: window.chrome
  };

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
  if (stringWithDelimiter.trim().length > 0) {
    // split, trim empty spaces, then remove empty strings
    return (stringWithDelimiter.split(delimiter).map(e => e.trim()).filter(e => e));
  } else {
    return undefined;
  }
}

function uniqueArray(arrayWithEntries) {
  if (arrayWithEntries.length) {
    return [...new Set(arrayWithEntries)];
  }
}

function sortMapByKey(unsortedMap) {
  //  javascript map do not have sort by default
  return new Map([...unsortedMap.entries()].sort(sortArray));
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

// change to a better name
function getStoredDetails(details) {
  if (httpTracker.browser.runtime.lastError) {
    onError(httpTracker.browser.runtime.lastError);
  } else {
    let existingValues = "";
    if (details.httpTrackerGlobalExcludePatterns) {
      existingValues = details.httpTrackerGlobalExcludePatterns;
    }
    return existingValues;
  }
}



async function getChangesFromStorge(changes, namespace) {
  for (var key in changes) {
    var storageChange = changes[key];
    globalExcludeURLsList = storageChange.newValue;
  }
}