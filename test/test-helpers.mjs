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
        version: '3.2.0',
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

  function serializeDomNode(node) {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (node.nodeType === 3 || (!node.tagName && node.textContent !== undefined)) {
      return node.textContent || '';
    }
    const tag = (node.tagName || 'DIV').toLowerCase();
    let attrs = '';
    const classNames = [];
    if (node.className) classNames.push(node.className);
    if (node._classListSet) classNames.push(...node._classListSet);
    const uniqueClasses = [...new Set(classNames.join(' ').trim().split(/\s+/).filter(Boolean))].join(' ');
    if (uniqueClasses) {
      attrs += ` class="${uniqueClasses}"`;
    }
    if (node.id) attrs += ` id="${node.id}"`;
    if (node.colSpan) attrs += ` colspan="${node.colSpan}"`;
    if (node.style && typeof node.style === 'object') {
      const entries = Object.entries(node.style);
      if (entries.length > 0) {
        const styleStr = entries.map(([k, v]) => {
          const cssK = k.replace(/([A-Z])/g, '-$1').toLowerCase();
          return `${cssK}: ${v};`;
        }).join(' ');
        attrs += ` style="${styleStr}"`;
      }
    }
    let inner = '';
    if (node.children && node.children.length > 0) {
      inner = node.children.map(serializeDomNode).join('');
    } else if (node.textContent) {
      inner = node.textContent;
    } else if (node._rawInnerHTML) {
      inner = node._rawInnerHTML;
    }
    return `<${tag}${attrs}>${inner}</${tag}>`;
  }

  const createMockElement = (tag = 'DIV', id = '') => {
    const classSet = new Set();
    const el = {
      tagName: tag.toUpperCase(),
      id,
      className: '',
      colSpan: undefined,
      value: '',
      checked: false,
      disabled: false,
      style: {},
      dataset: {},
      children: [],
      parentElement: null,
      _classListSet: classSet,
      _rawInnerHTML: '',
      _textContent: '',
      get innerHTML() {
        if (this.children && this.children.length > 0) {
          return this.children.map(serializeDomNode).join('');
        }
        return this._rawInnerHTML || '';
      },
      set innerHTML(val) {
        this._rawInnerHTML = String(val);
        this.children = [];
      },
      get textContent() {
        if (this.children && this.children.length > 0) {
          return this.children.map((c) => (c ? (c.textContent || '') : '')).join('');
        }
        return this._textContent || '';
      },
      set textContent(val) {
        this._textContent = String(val);
        this._rawInnerHTML = '';
        this.children = [];
      },
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
      replaceChildren: function(...args) {
        this.children = args;
        this._rawInnerHTML = '';
        this._textContent = '';
      },
      appendChild: function(child) {
        this.children.push(child);
        return child;
      },
      remove: () => {},
    };
    return el;
  };

  const domElements = new Map();
  const getOrCreateElement = (id) => {
    if (!domElements.has(id)) {
      domElements.set(id, createMockElement('DIV', id));
    }
    return domElements.get(id);
  };

  const mockDocument = {
    getElementById: (id) => getOrCreateElement(id),
    getElementsByClassName: (cls) => [],
    querySelectorAll: (sel) => [],
    createElement: (tag) => createMockElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
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
