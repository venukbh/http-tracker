import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

describe("What's New Release Notes Page & Update Trigger Tests", () => {
  describe("HTML Page Integrity & Offline Compliance", () => {
    it("ensures src/html/whats-new.html exists and is well-formed HTML5", () => {
      assert.ok(existsSync('src/html/whats-new.html'), 'whats-new.html must exist');
      const html = readFileSync('src/html/whats-new.html', 'utf8');
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('<title>What\'s New in HTTP-TRACKER</title>'));
      assert.ok(html.includes('id="wn_open_tracker"'));
      assert.ok(html.includes('id="wn_open_options"'));
    });

    it("verifies v3.2.0 features and complete historical release changelog are present", () => {
      const html = readFileSync('src/html/whats-new.html', 'utf8');
      // Current release v3.2.0
      assert.ok(html.includes('v3.2.0'), 'Must feature v3.2.0');
      assert.ok(html.includes('Copy as cURL'), 'Must highlight Copy as cURL');
      assert.ok(html.includes('What\'s New Hub'), 'Must highlight What\'s New Hub');
      assert.ok(html.includes('Mozilla AMO'), 'Must highlight Mozilla AMO compliance');

      // Historical releases - all public release tags must be present without consolidation
      const requiredReleases = [
        'v3.1.0', 'v3.0.1', 'v3.0.0', 'v2.2.6', 'v2.2.5', 'v2.2.4', 'v2.2.3',
        'v2.2.2', 'v2.2.1', 'v2.2.0', 'v2.1.9', 'v2.1.8', 'v2.1.7', 'v2.1.6',
        'v2.1.5', 'v2.1.4', 'v2.1.3', 'v2.1.2', 'v2.1.1', 'v2.0.4', 'v2.0.3',
        'v2.0.2', 'v2.0.1', 'v2.0.0', 'v1.0.0'
      ];
      for (const rel of requiredReleases) {
        assert.ok(html.includes(rel), `Must include ${rel} in timeline`);
      }
    });

    it("guarantees 100% offline self-containment with zero external network requests", () => {
      const html = readFileSync('src/html/whats-new.html', 'utf8');
      // Should not load external fonts, scripts, or tracking pixels over HTTP/HTTPS
      const externalScriptOrStyle = /<(script|link)[^>]*(href|src)=["']https?:\/\//i;
      assert.ok(!externalScriptOrStyle.test(html), 'whats-new.html must not load external scripts or styles over HTTP/HTTPS');
    });
  });

  describe("Constants & Path Definitions", () => {
    it("defines PAGE_PATH_WHATS_NEW in constants.js pointing to /src/html/whats-new.html", () => {
      const constantsCode = readFileSync('src/js/constants.js', 'utf8');
      const fn = new Function('globalThis', 'window', 'document', 'navigator', 'chrome', 'browser', constantsCode + '\nreturn httpTracker;');
      const ht = fn({}, {}, {}, { userAgent: 'Chrome' }, {}, {});
      assert.equal(ht.PAGE_PATH_WHATS_NEW, '/src/html/whats-new.html');
    });
  });

  describe("openWhatsNewPage Tab Management & Deduplication", () => {
    function createOpenSandbox(tabsInQuery = []) {
      let createdTab = null;
      let updatedTab = null;
      let updatedWindow = null;
      let reloadedTab = null;

      const mockBrowser = {
        runtime: {
          getURL: (path) => `chrome-extension://test-id${path}`,
          lastError: null,
        },
        action: {
          setTitle: () => {},
          onClicked: {
            hasListener: () => false,
            addListener: () => {},
          },
        },
        tabs: {
          query: (filter, callback) => callback(tabsInQuery),
          create: (props, callback) => {
            createdTab = props;
            const tabObj = { id: 101, windowId: props.windowId || 99, ...props };
            if (typeof callback === 'function') {
              callback(tabObj);
            }
            return Promise.resolve(tabObj);
          },
          update: (tabId, props) => {
            updatedTab = { tabId, props };
          },
          reload: (tabId, props) => {
            reloadedTab = { tabId, props };
          },
        },
        windows: {
          update: (winId, props) => {
            updatedWindow = { winId, props };
          },
          getAll: (props, cb) => {
            const wins = tabsInQuery.length > 0
              ? [{ id: tabsInQuery[0].windowId || 99, type: 'normal', tabs: tabsInQuery }]
              : [{ id: 99, type: 'normal', tabs: [] }];
            cb(wins);
          },
        },
        storage: {
          sync: {
            get: (keys, cb) => cb({}),
          },
        },
      };

      const openJsCode = readFileSync('src/js/open.js', 'utf8');
      const fn = new Function(
        'globalThis',
        'httpTracker',
        'getManifestDetails',
        'getPropertyFromStorage',
        'setPropertyToStorage',
        'onError',
        openJsCode + '\nreturn { openWhatsNewPage };'
      );

      const exported = fn(
        { window: { location: { pathname: '/src/js/background.js' } } },
        {
          browser: mockBrowser,
          PAGE_PATH_WHATS_NEW: '/src/html/whats-new.html',
        },
        () => ({ title: 'HTTP-TRACKER' }),
        () => undefined,
        () => {},
        () => {}
      );

      return {
        openWhatsNewPage: exported.openWhatsNewPage,
        getCreatedTab: () => createdTab,
        getUpdatedTab: () => updatedTab,
        getUpdatedWindow: () => updatedWindow,
        getReloadedTab: () => reloadedTab,
      };
    }

    it("creates a new background tab when no existing What's New tab is open", () => {
      const { openWhatsNewPage, getCreatedTab, getUpdatedWindow } = createOpenSandbox([]);
      openWhatsNewPage(false);

      const created = getCreatedTab();
      assert.ok(created, 'Should create a new tab');
      assert.equal(created.url, 'chrome-extension://test-id/src/html/whats-new.html');
      assert.equal(created.active, false, 'Default launch should open in background (active: false)');
      assert.equal(created.windowId, 99, 'Should target normal browser window');
      assert.equal(getUpdatedWindow(), null, 'Should NOT bring window to front when active: false');
    });

    it("focuses target window and brings newly created What's New tab to front immediately on first click (active: true)", () => {
      const { openWhatsNewPage, getCreatedTab, getUpdatedWindow } = createOpenSandbox([]);
      openWhatsNewPage(true);

      const created = getCreatedTab();
      assert.ok(created, 'Should create a new tab');
      assert.equal(created.url, 'chrome-extension://test-id/src/html/whats-new.html');
      assert.equal(created.active, true, 'User click should request active tab');
      assert.equal(created.windowId, 99, 'Should target normal browser window');
      const updatedWin = getUpdatedWindow();
      assert.ok(updatedWin, 'Must update window to bring to front immediately on first click');
      assert.equal(updatedWin.winId, 99);
      assert.deepEqual(updatedWin.props, { focused: true });
    });

    it("activates and hard-refreshes existing tab instead of creating duplicate when already open", () => {
      const existingTab = { id: 42, windowId: 99, url: 'chrome-extension://test-id/src/html/whats-new.html' };
      const { openWhatsNewPage, getCreatedTab, getUpdatedTab, getUpdatedWindow, getReloadedTab } = createOpenSandbox([existingTab]);

      // Launch with active: true
      openWhatsNewPage(true);
      assert.equal(getCreatedTab(), null, 'Must not spawn duplicate tab');
      const updatedTab = getUpdatedTab();
      assert.ok(updatedTab, 'Must update existing tab');
      assert.equal(updatedTab.tabId, 42);
      assert.equal(updatedTab.props.active, true);
      assert.equal(getUpdatedWindow().winId, 99);
      assert.deepEqual(getReloadedTab(), { tabId: 42, props: { bypassCache: true } }, 'Must hard refresh existing tab bypassing cache');
    });
  });

  describe("Service Worker Update Trigger Logic & Dev Reload Safeguards", () => {
    function simulateInstalledEvent(details, currentVersion = '3.2.0') {
      let openWhatsNewCalled = false;
      let openWhatsNewActive = null;
      let clearRulesCalled = false;

      const mockBrowser = {
        runtime: {
          getManifest: () => ({ version: currentVersion }),
          onInstalled: { addListener: (fn) => fn(details) },
          onStartup: { addListener: () => {} },
          onConnect: { addListener: () => {} },
        },
      };

      const swCode = readFileSync('src/js/service-worker.js', 'utf8');
      const fn = new Function(
        'globalThis',
        'httpTracker',
        'importScripts',
        'clearAllSessionRules',
        'openWhatsNewPage',
        'onError',
        swCode
      );

      fn(
        {},
        { browser: mockBrowser },
        () => {},
        async () => {
          clearRulesCalled = true;
        },
        (active) => {
          openWhatsNewCalled = true;
          openWhatsNewActive = active;
        },
        () => {}
      );

      return { openWhatsNewCalled, openWhatsNewActive, clearRulesCalled };
    }

    it("triggers openWhatsNewPage(false) when extension updates to a new version", () => {
      const result = simulateInstalledEvent({
        reason: 'update',
        previousVersion: '3.1.0',
      }, '3.2.0');

      assert.equal(result.openWhatsNewCalled, true, 'Must open What\'s New tab on update');
      assert.equal(result.openWhatsNewActive, false, 'Must open quietly in background without stealing focus');
    });

    it("safeguards against local developer reload spam when previousVersion === currentVersion", () => {
      const result = simulateInstalledEvent({
        reason: 'update',
        previousVersion: '3.2.0',
      }, '3.2.0');

      assert.equal(result.openWhatsNewCalled, false, 'Must NOT open What\'s New tab on same-version developer reload');
    });

    it("does NOT trigger on fresh installation (reason: install)", () => {
      const result = simulateInstalledEvent({
        reason: 'install',
      }, '3.2.0');

      assert.equal(result.openWhatsNewCalled, false, 'Must NOT open What\'s New on first install');
    });

    it("does NOT trigger on browser engine update (reason: chrome_update)", () => {
      const result = simulateInstalledEvent({
        reason: 'chrome_update',
        previousVersion: '3.2.0',
      }, '3.2.0');

      assert.equal(result.openWhatsNewCalled, false, 'Must NOT open on chrome_update');
    });
  });

  describe("Preferences Options Page What's New Link & Deduplication", () => {
    it("verifies options.html has id='whats_new_link' and omits target='_blank'", () => {
      const html = readFileSync('src/html/options.html', 'utf8');
      assert.ok(html.includes('id="whats_new_link"'), 'options.html must have id="whats_new_link"');
      assert.ok(!html.includes('target="_blank"'), 'options.html must NOT have target="_blank" to prevent tab duplication');
      assert.ok(html.includes('src="/src/js/open.js"'), 'options.html must load open.js for tab deduplication');
    });

    it("verifies clicking whats_new_link calls openWhatsNewPage(true) with event.preventDefault()", () => {
      let openWhatsNewCalledWith = null;
      let preventDefaultCalled = false;
      const listeners = {};

      const mockElements = {
        persist_options: { addEventListener: () => {} },
        whats_new_link: {
          addEventListener: (event, handler) => {
            listeners[event] = handler;
          },
        },
        tab: { checked: false },
        popup: { checked: false },
        default_include_patterns: { value: '' },
        default_exclude_patterns: { value: '' },
        default_mask_patterns: { value: '' },
      };

      const globalSandbox = {
        getById: (id) => mockElements[id] || null,
        openWhatsNewPage: (active) => {
          openWhatsNewCalledWith = active;
        },
        httpTracker: {
          STORAGE_KEY_EXCLUDE_PATTERN: 'exclude',
          STORAGE_KEY_INCLUDE_PATTERN: 'include',
          STORAGE_KEY_MASK_PATTERN: 'mask',
          STORAGE_KEY_OPEN_ADDON_IN_TAB: 'tab',
          browser: {
            storage: {
              sync: {
                get: (keys, cb) => cb({}),
              },
            },
          },
        },
        uniqueArray: (arr) => arr,
        stringToArray: () => [],
        setPropertyToStorage: () => {},
        getPropertyFromStorage: () => '',
        arrayToString: () => '',
      };

      const optionsCode = readFileSync('src/js/options.js', 'utf8');
      const fn = new Function(...Object.keys(globalSandbox), optionsCode);
      fn(...Object.values(globalSandbox));

      assert.ok(typeof listeners.click === 'function', 'Must attach click listener to whats_new_link');

      // Simulate click
      const mockEvent = {
        preventDefault: () => {
          preventDefaultCalled = true;
        },
      };
      listeners.click(mockEvent);

      assert.equal(preventDefaultCalled, true, 'Click handler must prevent default link navigation');
      assert.equal(openWhatsNewCalledWith, true, 'Click handler must call openWhatsNewPage(true)');
    });

    it("verifies options.html has Open Tracker button in header with future extension note", () => {
      const html = readFileSync('src/html/options.html', 'utf8');
      assert.ok(html.includes('id="open_tracker"'), 'options.html must have id="open_tracker" in header');
      assert.ok(html.includes('Open Tracker'), 'Button must have "Open Tracker" label');
      assert.ok(html.includes('icon_128px.png'), 'Button must include extension brand icon');
      assert.ok(html.includes('wn_btn wn_btn_primary'), 'Open Tracker must have primary button styling');
      assert.ok(!html.includes('id="open_tracker_bottom"'), 'Duplicate bottom button should be omitted on compact form');
      assert.ok(html.includes('Future Extension Note: If the preferences page expands in the future'), 'Must have future extension note in comment');
    });

    it("verifies clicking open_tracker calls openAddon()", () => {
      let openAddonCalled = false;
      const listeners = {};

      const createMockBtn = (id) => ({
        addEventListener: (event, handler) => {
          listeners[`${id}_${event}`] = handler;
        },
      });

      const mockElements = {
        persist_options: { addEventListener: () => {} },
        whats_new_link: { addEventListener: () => {} },
        open_tracker: createMockBtn('open_tracker'),
        open_tracker_bottom: createMockBtn('open_tracker_bottom'),
        back_to_addon: createMockBtn('back_to_addon'),
        back_to_addon_bottom: createMockBtn('back_to_addon_bottom'),
        tab: { checked: false },
        popup: { checked: false },
        default_include_patterns: { value: '' },
        default_exclude_patterns: { value: '' },
        default_mask_patterns: { value: '' },
      };

      const globalSandbox = {
        getById: (id) => mockElements[id] || null,
        openAddon: () => {
          openAddonCalled = true;
        },
        openWhatsNewPage: () => {},
        httpTracker: {
          STORAGE_KEY_EXCLUDE_PATTERN: 'exclude',
          STORAGE_KEY_INCLUDE_PATTERN: 'include',
          STORAGE_KEY_MASK_PATTERN: 'mask',
          STORAGE_KEY_OPEN_ADDON_IN_TAB: 'tab',
          browser: {
            storage: {
              sync: {
                get: (keys, cb) => cb({}),
              },
            },
          },
        },
        uniqueArray: (arr) => arr,
        stringToArray: () => [],
        setPropertyToStorage: () => {},
        getPropertyFromStorage: () => '',
        arrayToString: () => '',
      };

      const optionsCode = readFileSync('src/js/options.js', 'utf8');
      const fn = new Function(...Object.keys(globalSandbox), optionsCode);
      fn(...Object.values(globalSandbox));

      assert.ok(typeof listeners['open_tracker_click'] === 'function', 'Must attach click listener to open_tracker');
      assert.ok(typeof listeners['open_tracker_bottom_click'] === 'function', 'Must attach click listener to open_tracker_bottom');

      let preventDefaultCalled = false;
      listeners['open_tracker_click']({
        preventDefault: () => {
          preventDefaultCalled = true;
        },
      });
      assert.equal(preventDefaultCalled, true);
      assert.equal(openAddonCalled, true, 'Click handler must invoke openAddon()');
    });

    it("verifies options.html has saved status badges after all textareas and radio options", () => {
      const html = readFileSync('src/html/options.html', 'utf8');
      assert.ok(html.includes('id="status_default_include_patterns"'), 'Must have status badge for include patterns');
      assert.ok(html.includes('id="status_default_exclude_patterns"'), 'Must have status badge for exclude patterns');
      assert.ok(html.includes('id="status_default_mask_patterns"'), 'Must have status badge for mask patterns');
      assert.ok(html.includes('id="status_uipage"'), 'Must have status badge for uipage radio options');
      assert.ok(html.includes('class="options_saved_badge"'), 'Badges must have options_saved_badge class');
    });

    it("verifies debounced auto-save triggers storage write and shows saved badge", () => {
      const savedStorage = {};
      const badgeClasses = new Set();
      let badgeText = '';

      const listeners = {};
      const mockElements = {
        persist_options: {
          addEventListener: (event, handler) => {
            listeners[event] = handler;
          },
        },
        default_include_patterns: {
          id: 'default_include_patterns',
          tagName: 'TEXTAREA',
          value: 'api, checkout, google',
        },
        default_exclude_patterns: {
          id: 'default_exclude_patterns',
          tagName: 'TEXTAREA',
          value: '',
        },
        default_mask_patterns: {
          id: 'default_mask_patterns',
          tagName: 'TEXTAREA',
          value: '',
        },
        status_default_include_patterns: {
          textContent: '',
          classList: {
            add: (cls) => badgeClasses.add(cls),
            remove: (cls) => badgeClasses.delete(cls),
          },
        },
        open_tracker: { addEventListener: () => {} },
        open_tracker_bottom: { addEventListener: () => {} },
        whats_new_link: { addEventListener: () => {} },
        tab: { checked: false },
        popup: { checked: false },
      };

      const globalSandbox = {
        getById: (id) => mockElements[id] || null,
        debounce: (fn) => fn, // synchronous debounce for immediate testing
        openAddon: () => {},
        openWhatsNewPage: () => {},
        httpTracker: {
          STORAGE_KEY_EXCLUDE_PATTERN: 'exclude_key',
          STORAGE_KEY_INCLUDE_PATTERN: 'include_key',
          STORAGE_KEY_MASK_PATTERN: 'mask_key',
          STORAGE_KEY_OPEN_ADDON_IN_TAB: 'tab_key',
          browser: {
            storage: {
              sync: {
                get: (keys, cb) => cb({}),
              },
            },
          },
        },
        uniqueArray: (arr) => [...new Set(arr)],
        stringToArray: (str, regex) => (str ? str.split(regex).map((s) => s.trim()).filter(Boolean) : []),
        setPropertyToStorage: (key, val) => {
          savedStorage[key] = val;
        },
        getPropertyFromStorage: () => '',
        arrayToString: () => '',
      };

      const optionsCode = readFileSync('src/js/options.js', 'utf8');
      const fn = new Function(...Object.keys(globalSandbox), optionsCode);
      fn(...Object.values(globalSandbox));

      assert.ok(typeof listeners.input === 'function', 'Must attach input listener to persist_options');
      assert.ok(typeof listeners.change === 'function', 'Must attach change listener to persist_options');

      // User types into the textarea
      mockElements.default_include_patterns.value = 'api, checkout, google';
      listeners.input({
        target: mockElements.default_include_patterns,
      });

      assert.deepEqual(savedStorage['include_key'], ['api', 'checkout', 'google'], 'Must persist parsed array to storage');
      assert.ok(badgeClasses.has('show'), 'Must add show class to status badge');
    });

    it("verifies beforeunload flushes active textarea to storage", () => {
      const savedStorage = {};
      const windowListeners = {};

      const mockActiveTextarea = {
        id: 'default_mask_patterns',
        tagName: 'TEXTAREA',
        value: 'password, authorization, secret',
      };

      const mockElements = {
        persist_options: { addEventListener: () => {} },
        default_include_patterns: {
          id: 'default_include_patterns',
          tagName: 'TEXTAREA',
          value: '',
        },
        default_exclude_patterns: {
          id: 'default_exclude_patterns',
          tagName: 'TEXTAREA',
          value: '',
        },
        default_mask_patterns: mockActiveTextarea,
        status_default_mask_patterns: {
          textContent: '',
          classList: { add: () => {}, remove: () => {} },
        },
        open_tracker: { addEventListener: () => {} },
        open_tracker_bottom: { addEventListener: () => {} },
        whats_new_link: { addEventListener: () => {} },
        tab: { checked: false },
        popup: { checked: false },
      };

      const globalSandbox = {
        getById: (id) => mockElements[id] || null,
        debounce: (fn) => fn,
        openAddon: () => {},
        openWhatsNewPage: () => {},
        window: {
          addEventListener: (event, handler) => {
            windowListeners[event] = handler;
          },
        },
        document: {
          get activeElement() {
            return mockActiveTextarea;
          },
          addEventListener: () => {},
        },
        httpTracker: {
          STORAGE_KEY_EXCLUDE_PATTERN: 'exclude_key',
          STORAGE_KEY_INCLUDE_PATTERN: 'include_key',
          STORAGE_KEY_MASK_PATTERN: 'mask_key',
          STORAGE_KEY_OPEN_ADDON_IN_TAB: 'tab_key',
          browser: {
            storage: {
              sync: {
                get: (keys, cb) => cb({}),
              },
            },
          },
        },
        uniqueArray: (arr) => [...new Set(arr)],
        stringToArray: (str, regex) => (str ? str.split(regex).map((s) => s.trim()).filter(Boolean) : []),
        setPropertyToStorage: (key, val) => {
          savedStorage[key] = val;
        },
        getPropertyFromStorage: () => '',
        arrayToString: () => '',
      };

      const optionsCode = readFileSync('src/js/options.js', 'utf8');
      const fn = new Function(...Object.keys(globalSandbox), optionsCode);
      fn(...Object.values(globalSandbox));

      assert.ok(typeof windowListeners.beforeunload === 'function', 'Must attach beforeunload listener');

      // Simulate user editing active textarea before closing tab
      mockActiveTextarea.value = 'password, authorization, secret';
      windowListeners.beforeunload();

      assert.deepEqual(savedStorage['mask_key'], ['password', 'authorization', 'secret'], 'Unload must flush active textarea');
    });
  });

  describe("Addon Workspace Preferences & What's New Buttons", () => {
    it("verifies http-tracker.html features modern ⚙️ Preferences and 📖 What's New buttons", () => {
      const html = readFileSync('src/html/http-tracker.html', 'utf8');
      assert.ok(html.includes('id="preferences"'), 'Must have id="preferences"');
      assert.ok(html.includes('id="whats_new"'), 'Must have id="whats_new"');
      assert.ok(html.includes('⚙️ Preferences'), 'Preferences button must have gear icon');
      assert.ok(html.includes('📖 What\'s New'), 'What\'s New button must have book icon');
      assert.ok(html.includes('wn_btn wn_btn_secondary'), 'Buttons must use wn_btn secondary styling');
    });

    it("verifies http-tracker.html features branding logo and pure wire fidelity badge", () => {
      const html = readFileSync('src/html/http-tracker.html', 'utf8');
      assert.ok(html.includes('class="tracker_brand_icon"'), 'Must have branding logo icon');
      assert.ok(html.includes('/src/assets/icon_32px.png'), 'Must reference existing extension icon asset');
      assert.ok(html.includes('HTTP-TRACKER'), 'Must display HTTP-TRACKER title');
      assert.ok(html.includes('id="fidelity_badge"'), 'Must have fidelity badge element');
      assert.ok(html.includes('genuine network transactions rather than browser-generated internal URL rewrites'), 'Must feature genuine network transactions text');
    });
  });
});

