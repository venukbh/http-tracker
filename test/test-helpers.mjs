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
      stored: [],
      removed: [],
      getAll: async (details = {}) => {
        if (!details.domain) return [...mockBrowser.cookies.stored];
        const targetDomain = details.domain.toLowerCase().replace(/^\./, '');
        return mockBrowser.cookies.stored.filter((c) => {
          const cookieDomain = (c.domain || '').toLowerCase().replace(/^\./, '');
          return cookieDomain === targetDomain || cookieDomain.endsWith(`.${targetDomain}`) || targetDomain.endsWith(`.${cookieDomain}`);
        });
      },
      remove: async (details) => {
        mockBrowser.cookies.removed.push(details);
        return details;
      },
    },
  };

  const domElements = new Map();
  const getOrCreateElement = (id) => {
    if (!domElements.has(id)) {
      const classSet = new Set();
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        checked: false,
        disabled: false,
        style: {},
        dataset: {},
        children: [],
        parentElement: null,
        classList: {
          add: (cls) => classSet.add(cls),
          remove: (cls) => classSet.delete(cls),
          toggle: (cls, force) => {
            if (force === undefined) {
              if (classSet.has(cls)) { classSet.delete(cls); return false; }
              classSet.add(cls); return true;
            }
            if (force) { classSet.add(cls); return true; }
            classSet.delete(cls); return false;
          },
          contains: (cls) => classSet.has(cls),
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        replaceChildren: (...args) => { el.children = args; },
        appendChild: (child) => { el.children.push(child); return child; },
        remove: () => {},
      };
      domElements.set(id, el);
    }
    return domElements.get(id);
  };

  const mockDocument = {
    getElementById: (id) => getOrCreateElement(id),
    getElementsByClassName: (cls) => [],
    querySelectorAll: (sel) => [],
    createElement: (tag) => {
      const classSet = new Set();
      return {
        tagName: tag.toUpperCase(),
        id: '',
        textContent: '',
        innerHTML: '',
        style: {},
        dataset: {},
        children: [],
        classList: {
          add: (cls) => classSet.add(cls),
          remove: (cls) => classSet.delete(cls),
          toggle: (cls, force) => {
            if (force === undefined) {
              if (classSet.has(cls)) { classSet.delete(cls); return false; }
              classSet.add(cls); return true;
            }
            if (force) { classSet.add(cls); return true; }
            classSet.delete(cls); return false;
          },
          contains: (cls) => classSet.has(cls),
        },
        appendChild(child) { this.children.push(child); return child; },
      };
    },
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
      parseSmartFilter,
      matchesSmartFilter,
      matchesColumnFilters,
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

export function runDomEventsInBrowser(isFirefox) {
  const registeredListeners = {};
  const mockWebRequest = {
    onBeforeRequest: { addListener: (...args) => { registeredListeners.onBeforeRequest = args; } },
    onBeforeSendHeaders: { addListener: (...args) => { registeredListeners.onBeforeSendHeaders = args; } },
    onSendHeaders: { addListener: (...args) => { registeredListeners.onSendHeaders = args; } },
    onHeadersReceived: { addListener: (...args) => { registeredListeners.onHeadersReceived = args; } },
    onAuthRequired: { addListener: (...args) => { registeredListeners.onAuthRequired = args; } },
    onBeforeRedirect: { addListener: (...args) => { registeredListeners.onBeforeRedirect = args; } },
    onResponseStarted: { addListener: (...args) => { registeredListeners.onResponseStarted = args; } },
    onCompleted: { addListener: (...args) => { registeredListeners.onCompleted = args; } },
    onErrorOccurred: { addListener: (...args) => { registeredListeners.onErrorOccurred = args; } },
  };

  const fakeHttpTracker = {
    isFF: isFirefox,
    isFirefox: isFirefox,
    browser: {
      webRequest: mockWebRequest,
    },
  };

  const fakeEventTracker = {
    processWebEvent: () => {},
  };

  const domEventsCode = fs.readFileSync(path.join(rootDir, 'src/js/dom-events.js'), 'utf-8');
  const runner = new Function('httpTracker', 'eventTracker', domEventsCode);
  runner(fakeHttpTracker, fakeEventTracker);

  return registeredListeners;
}
