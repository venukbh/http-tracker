import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('Strict Origin Tab & Window Deduplication Tests', () => {
  function createOpenSandbox({
    windows = [],
    storage = {},
    extensionId = 'test-extension-id',
  } = {}) {
    let createdTabs = [];
    let updatedTabs = [];
    let updatedWindows = [];
    let createdWindows = [];
    let reloadedTabs = [];
    let openedOptionsPageCount = 0;

    const mockBrowser = {
      runtime: {
        getURL: (path = '') => `chrome-extension://${extensionId}${path.startsWith('/') ? path : '/' + path}`,
        openOptionsPage: () => {
          openedOptionsPageCount++;
        },
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
        query: (filter, callback) => {
          const matching = [];
          for (const win of windows) {
            if (filter.windowId && win.id !== filter.windowId) continue;
            for (const t of win.tabs || []) {
              if (!filter.url || t.url === filter.url) {
                matching.push(t);
              }
            }
          }
          callback(matching);
        },
        create: (props) => {
          createdTabs.push(props);
          return Promise.resolve(props);
        },
        update: (tabId, props) => {
          updatedTabs.push({ tabId, props });
          return Promise.resolve({ id: tabId, ...props });
        },
        reload: (tabId, props) => {
          reloadedTabs.push({ tabId, props });
          return Promise.resolve();
        },
      },
      windows: {
        getAll: (props, cb) => {
          cb(windows);
        },
        get: (winId, cb) => {
          const win = windows.find((w) => w.id === winId) || { id: winId };
          cb(win);
        },
        create: (props) => {
          createdWindows.push(props);
          return Promise.resolve(props);
        },
        update: (winId, props) => {
          updatedWindows.push({ winId, props });
          return Promise.resolve({ id: winId, ...props });
        },
      },
      storage: {
        sync: {
          get: (keys, cb) => {
            const result = {};
            for (const k of keys) {
              if (k in storage) result[k] = storage[k];
            }
            cb(result);
          },
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
      openJsCode + '\nreturn { findWindowAndTab, openAddonOptions, openWhatsNewPage, openAddon, openInTab, openInPopupWindow };'
    );

    const exported = fn(
      { window: { location: { pathname: '/src/js/service-worker.js' } } },
      {
        browser: mockBrowser,
        isFF: false,
        PAGE_PATH: '/src/html/http-tracker.html',
        PAGE_PATH_WHATS_NEW: '/src/html/whats-new.html',
        PAGE_PATH_OPTIONS: '/src/html/options.html',
        STORAGE_KEY_OPEN_ADDON_IN_TAB: 'httpTracker_OpenAddonInTab',
      },
      () => ({ title: 'HTTP-TRACKER' }),
      (obj, key) => obj?.[key],
      () => {},
      () => {}
    );

    return {
      findWindowAndTab: exported.findWindowAndTab,
      openAddonOptions: exported.openAddonOptions,
      openWhatsNewPage: exported.openWhatsNewPage,
      openAddon: exported.openAddon,
      openInTab: exported.openInTab,
      openInPopupWindow: exported.openInPopupWindow,
      getCreatedTabs: () => createdTabs,
      getUpdatedTabs: () => updatedTabs,
      getUpdatedWindows: () => updatedWindows,
      getCreatedWindows: () => createdWindows,
      getReloadedTabs: () => reloadedTabs,
      getOpenedOptionsPageCount: () => openedOptionsPageCount,
    };
  }

  describe('findWindowAndTab strict URL resolution', () => {
    it('matches tab when exact extension origin and relative path match', () => {
      const windows = [
        {
          id: 1,
          tabs: [
            { id: 101, url: 'chrome-extension://test-extension-id/src/html/http-tracker.html' },
          ],
        },
      ];
      const { findWindowAndTab } = createOpenSandbox({ windows });
      const match = findWindowAndTab(windows, '/src/html/http-tracker.html');
      assert.ok(match, 'Must find matching window and tab');
      assert.equal(match.window.id, 1);
      assert.equal(match.tab.id, 101);
    });

    it('matches tab when exact extension origin has query params or hash fragment', () => {
      const windows = [
        {
          id: 2,
          tabs: [
            { id: 201, url: 'chrome-extension://test-extension-id/src/html/whats-new.html#v3.2.0' },
            { id: 202, url: 'chrome-extension://test-extension-id/src/html/options.html?theme=dark' },
          ],
        },
      ];
      const { findWindowAndTab } = createOpenSandbox({ windows });

      const matchHash = findWindowAndTab(windows, '/src/html/whats-new.html');
      assert.ok(matchHash);
      assert.equal(matchHash.tab.id, 201);

      const matchQuery = findWindowAndTab(windows, '/src/html/options.html');
      assert.ok(matchQuery);
      assert.equal(matchQuery.tab.id, 202);
    });

    it('REFUSES to match a tab from another extension with the same relative path', () => {
      const windows = [
        {
          id: 3,
          tabs: [
            { id: 301, url: 'chrome-extension://different-foreign-id/src/html/http-tracker.html' },
            { id: 302, url: 'chrome-extension://different-foreign-id/src/html/options.html' },
          ],
        },
      ];
      const { findWindowAndTab } = createOpenSandbox({ windows });

      assert.equal(findWindowAndTab(windows, '/src/html/http-tracker.html'), null, 'Must ignore foreign extension tracker tab');
      assert.equal(findWindowAndTab(windows, '/src/html/options.html'), null, 'Must ignore foreign extension options tab');
    });

    it('REFUSES to match a web page containing the path fragment in its URL', () => {
      const windows = [
        {
          id: 4,
          tabs: [
            { id: 401, url: 'https://github.com/venu/http-tracker/src/html/http-tracker.html' },
            { id: 402, url: 'http://localhost:8080/src/html/options.html' },
            { id: 403, url: 'https://developer.chrome.com/docs/extensions/?ref=/src/html/whats-new.html' },
          ],
        },
      ];
      const { findWindowAndTab } = createOpenSandbox({ windows });

      assert.equal(findWindowAndTab(windows, '/src/html/http-tracker.html'), null, 'Must ignore web page tracker url');
      assert.equal(findWindowAndTab(windows, '/src/html/options.html'), null, 'Must ignore web page options url');
      assert.equal(findWindowAndTab(windows, '/src/html/whats-new.html'), null, 'Must ignore web page query url');
    });
  });

  describe('openAddonOptions deduplication', () => {
    it('focuses and reloads existing options tab when belonging to this extension', () => {
      const windows = [
        {
          id: 10,
          tabs: [
            { id: 501, url: 'chrome-extension://test-extension-id/src/html/options.html' },
          ],
        },
      ];
      const sandbox = createOpenSandbox({ windows });
      sandbox.openAddonOptions();

      assert.equal(sandbox.getOpenedOptionsPageCount(), 0, 'Must NOT open new options page');
      assert.equal(sandbox.getUpdatedWindows()[0]?.winId, 10);
      assert.equal(sandbox.getUpdatedTabs()[0]?.tabId, 501);
      assert.equal(sandbox.getReloadedTabs()[0]?.tabId, 501);
    });

    it('opens native options page when options tab belongs to a foreign extension or website', () => {
      const windows = [
        {
          id: 11,
          tabs: [
            { id: 502, url: 'chrome-extension://foreign-id/src/html/options.html' },
            { id: 503, url: 'https://example.com/src/html/options.html' },
          ],
        },
      ];
      const sandbox = createOpenSandbox({ windows });
      sandbox.openAddonOptions();

      assert.equal(sandbox.getOpenedOptionsPageCount(), 1, 'Must open native options page for this extension');
      assert.equal(sandbox.getUpdatedTabs().length, 0);
    });
  });

  describe('openAddon tab mode deduplication', () => {
    it('focuses existing tracker tab without creating duplicates', async () => {
      const windows = [
        {
          id: 20,
          tabs: [
            { id: 601, url: 'chrome-extension://test-extension-id/src/html/http-tracker.html' },
          ],
        },
      ];
      const sandbox = createOpenSandbox({
        windows,
        storage: { httpTracker_OpenAddonInTab: true },
      });
      await sandbox.openAddon();

      assert.equal(sandbox.getCreatedTabs().length, 0, 'Must not create a new tab');
      assert.equal(sandbox.getUpdatedWindows()[0]?.winId, 20);
      assert.equal(sandbox.getUpdatedTabs()[0]?.tabId, 601);
    });

    it('creates new tab when tracker tab belongs to another extension or website', async () => {
      const windows = [
        {
          id: 21,
          tabs: [
            { id: 602, url: 'chrome-extension://foreign-id/src/html/http-tracker.html' },
            { id: 603, url: 'https://example.com/src/html/http-tracker.html' },
          ],
        },
      ];
      const sandbox = createOpenSandbox({
        windows,
        storage: { httpTracker_OpenAddonInTab: true },
      });
      await sandbox.openAddon();

      assert.equal(sandbox.getCreatedTabs().length, 1, 'Must spawn new tab');
      assert.equal(
        sandbox.getCreatedTabs()[0].url,
        'chrome-extension://test-extension-id/src/html/http-tracker.html'
      );
    });
  });

  describe('openAddon popup window mode deduplication', () => {
    it('focuses existing popup window and activates tab when open', async () => {
      const windows = [
        {
          id: 30,
          tabs: [
            { id: 701, url: 'chrome-extension://test-extension-id/src/html/http-tracker.html' },
          ],
        },
      ];
      const sandbox = createOpenSandbox({
        windows,
        storage: { httpTracker_OpenAddonInTab: false },
      });
      await sandbox.openAddon();

      assert.equal(sandbox.getCreatedWindows().length, 0, 'Must not spawn new window');
      assert.equal(sandbox.getUpdatedWindows()[0]?.winId, 30);
      assert.equal(sandbox.getUpdatedTabs()[0]?.tabId, 701);
    });

    it('creates new popup window when tracker URL belongs to another extension', async () => {
      const windows = [
        {
          id: 31,
          tabs: [
            { id: 702, url: 'chrome-extension://other-id/src/html/http-tracker.html' },
          ],
        },
      ];
      const sandbox = createOpenSandbox({
        windows,
        storage: { httpTracker_OpenAddonInTab: false },
      });
      await sandbox.openAddon();

      assert.equal(sandbox.getCreatedWindows().length, 1, 'Must create a new window');
      assert.equal(
        sandbox.getCreatedWindows()[0].url,
        'chrome-extension://test-extension-id/src/html/http-tracker.html'
      );
    });
  });
});
