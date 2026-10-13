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

  const mockDocument = {
    getElementById: (id) => null,
    getElementsByClassName: (cls) => [],
    ...customGlobals.document,
  };

  const mockNavigator = {
    userAgent: 'Mozilla/5.0 Chrome/120.0',
    ...customGlobals.navigator,
  };

  globalThis.browser = mockBrowser;
  globalThis.chrome = mockBrowser;
  globalThis.document = mockDocument;

  const constantsCode = fs.readFileSync(path.join(rootDir, 'src/js/httpTrackerConstants.js'), 'utf-8');
  const utilsCode = fs.readFileSync(path.join(rootDir, 'src/js/httpTrackerUtils.js'), 'utf-8');

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
    return {
      httpTracker,
      FORBIDDEN_HEADERS,
      RFC_HEADER_NAME_REGEX,
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
    };
  `
  );

  const context = wrapper(globalThis, globalThis, mockDocument, mockNavigator, mockBrowser, mockBrowser);

  return {
    context,
    mockBrowser,
    sessionRulesStore,
    storageStore,
  };
}
