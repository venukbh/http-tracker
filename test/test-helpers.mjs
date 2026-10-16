import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function createTestContext(customGlobals = {}) {
  const sessionRulesStore = [];
  const storageStore = new Map();

  const mockBrowser = {
    runtime: {
      getURL: (path = '') => `chrome-extension://mock-id/${path.replace(/^\//, '')}`,
      getManifest: () => ({
        version: '3.1.0',
        action: { default_title: 'HTTP-TRACKER' },
      }),
      lastError: null,
    },
    declarativeNetRequest: {
      updateSessionRules: async ({ removeRuleIds = [], addRules = [] }) => {
        const removeSet = new Set(removeRuleIds);
        for (let i = sessionRulesStore.length - 1; i >= 0; i--) {
          if (removeSet.has(sessionRulesStore[i].id)) {
            sessionRulesStore.splice(i, 1);
          }
        }
        sessionRulesStore.push(...addRules);
        return true;
      },
      getSessionRules: async () => [...sessionRulesStore],
    },
    storage: {
      sync: {
        get: async (keys) => {
          const result = {};
          const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
          for (const k of keyList) {
            if (storageStore.has(k)) {
              result[k] = storageStore.get(k);
            }
          }
          return result;
        },
        set: async (items) => {
          for (const [k, v] of Object.entries(items)) {
            storageStore.set(k, v);
          }
          return true;
        },
        remove: async (keys) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const k of keyList) {
            storageStore.delete(k);
          }
          return true;
        },
      },
    },
    cookies: {
      removed: [],
      remove: async (details) => {
        mockBrowser.cookies.removed.push(details);
        return details;
      },
    },
  };

  const domElements = new Map();
  const getOrCreateElement = (id) => {
    if (!domElements.has(id)) {
      domElements.set(id, {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        style: {},
        dataset: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        querySelector: () => null,
        querySelectorAll: () => [],
        replaceChildren: () => {},
      });
    }
    return domElements.get(id);
  };

  const mockDocument = {
    getElementById: (id) => getOrCreateElement(id),
    getElementsByClassName: (cls) => [],
    querySelectorAll: (sel) => [],
    ...customGlobals.document,
  };

  const mockNavigator = {
    userAgent: 'Mozilla/5.0 Chrome/120.0',
    ...customGlobals.navigator,
  };

  globalThis.browser = mockBrowser;
  globalThis.chrome = mockBrowser;
  globalThis.document = mockDocument;

  const constantsCode = fs.readFileSync(path.join(rootDir, 'src/js/constants.js'), 'utf-8');
  const utilsCode = fs.readFileSync(path.join(rootDir, 'src/js/utils.js'), 'utf-8');
  const eventCacheCode = fs.readFileSync(path.join(rootDir, 'src/js/event-cache.js'), 'utf-8');
  const detailsCode = fs.readFileSync(path.join(rootDir, 'src/js/details-view.js'), 'utf-8');
  const headerRulesCode = fs.readFileSync(path.join(rootDir, 'src/js/header-rules.js'), 'utf-8');

  const wrapper = new Function(
    'globalThis',
    'window',
    'document',
    'navigator',
    'chrome',
    'browser',
    `
    ${constantsCode}
    ${utilsCode}
    ${eventCacheCode}
    ${detailsCode}
    ${headerRulesCode}
    return {
      httpTracker,
      httpTrackerEventCache,
      httpTrackerDetailsView,
      httpTrackerHeaderRules,
      FORBIDDEN_HEADERS,
      RFC_HEADER_NAME_REGEX,
      INPUT_BOX_DELAY,
      stringToArray,
      arrayToString,
      normalizePatterns,
      filterWithLength,
      uniqueArray,
      sortArray,
      sortMapByKey,
      sortJsonByProperty,
      getManifestDetails,
      updateBlockSessionRules,
      updateHeaderModifySessionRules,
      clearAllSessionRules,
      getPropertyFromStorage,
      setPropertyToStorage,
      debounce,
      escapeHtml,
      getReadableDate,
      isBinaryData,
      detectCompressionType,
      getCookieNameValue,
      removeCookies,
      matchesFilter,
      maskValue,
      matchesIncludePattern,
      matchesExcludePattern,
      urlMatchIncludePattern: matchesIncludePattern,
      urlMatchExcludePattern: matchesExcludePattern,
      addMarkTag,
      ALL_RESOURCE_TYPES,
      CHROME_RESOURCE_TYPES,
      FIREFOX_RESOURCE_TYPES,
      FALLBACK_RESOURCE_TYPES,
      getAllResourceTypes,
    };
  `
  );

  const context = wrapper(globalThis, globalThis, mockDocument, mockNavigator, mockBrowser, mockBrowser);

  return {
    context,
    mockBrowser,
    sessionRulesStore,
    storageStore,
    domElements,
  };
}
