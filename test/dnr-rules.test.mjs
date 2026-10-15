import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './test-helpers.mjs';

describe('DNR Session Rules Unit Tests', () => {
  describe('updateBlockSessionRules', () => {
    it('creates block rules with IDs 1000+, urlFilter wildcards, and all resource types', async () => {
      const { context, sessionRulesStore } = createTestContext();
      await context.updateBlockSessionRules(['doubleclick.net', 'analytics.com']);

      assert.equal(sessionRulesStore.length, 2);
      assert.deepEqual(sessionRulesStore[0], {
        id: 1000,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '*doubleclick.net*',
          resourceTypes: [
            'main_frame', 'sub_frame', 'xmlhttprequest', 'other',
            'script', 'stylesheet', 'image', 'font', 'object', 'media', 'websocket', 'ping', 'csp_report',
          ],
        },
      });
      assert.deepEqual(sessionRulesStore[1], {
        id: 1001,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '*analytics.com*',
          resourceTypes: [
            'main_frame', 'sub_frame', 'xmlhttprequest', 'other',
            'script', 'stylesheet', 'image', 'font', 'object', 'media', 'websocket', 'ping', 'csp_report',
          ],
        },
      });
    });

    it('accepts string of patterns as well as array', async () => {
      const { context, sessionRulesStore } = createTestContext();
      await context.updateBlockSessionRules('badsite.com, trackers.org');
      assert.equal(sessionRulesStore.length, 2);
      assert.equal(sessionRulesStore[0].condition.urlFilter, '*badsite.com*');
      assert.equal(sessionRulesStore[1].condition.urlFilter, '*trackers.org*');
    });

    it('clears previous block rules when empty list is provided', async () => {
      const { context, sessionRulesStore } = createTestContext();
      await context.updateBlockSessionRules(['badsite.com']);
      assert.equal(sessionRulesStore.length, 1);

      await context.updateBlockSessionRules([]);
      assert.equal(sessionRulesStore.length, 0);
    });
  });

  describe('updateHeaderModifySessionRules', () => {
    it('adds valid headers and modifies requestHeaders operation to "set"', async () => {
      const { context, sessionRulesStore } = createTestContext();
      const headers = [
        { name: 'X-Custom-Auth', value: 'secret-token', url: 'api.example.com' },
        { name: 'X-Tenant-Id', value: '42', url: '' },
      ];
      await context.updateHeaderModifySessionRules(headers);

      assert.equal(sessionRulesStore.length, 2);
      assert.deepEqual(sessionRulesStore[0], {
        id: 2000,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [{
            header: 'X-Custom-Auth', operation: 'set', value: 'secret-token',
          }],
        },
        condition: {
          urlFilter: '*api.example.com*',
          resourceTypes: [
            'main_frame', 'sub_frame', 'xmlhttprequest', 'other',
            'script', 'stylesheet', 'image', 'font', 'object', 'media', 'websocket', 'ping', 'csp_report',
          ],
        },
      });

      // Wildcard url fallback when url is empty
      assert.equal(sessionRulesStore[1].condition.urlFilter, '*');
    });

    it('rejects forbidden transport and framing headers like Connection and Content-Length', async () => {
      const { context, sessionRulesStore } = createTestContext();
      const headers = [
        { name: 'Connection', value: 'keep-alive' },
        { name: 'Content-Length', value: '123' },
        { name: 'Keep-Alive', value: 'timeout=5' },
        { name: 'Transfer-Encoding', value: 'chunked' },
        { name: 'Upgrade', value: 'websocket' },
        { name: 'X-Allowed', value: 'ok' },
      ];
      await context.updateHeaderModifySessionRules(headers);

      assert.equal(sessionRulesStore.length, 1);
      assert.equal(sessionRulesStore[0].action.requestHeaders[0].header, 'X-Allowed');
    });

    it('allows modifying headers like Cookie, Origin, Referer, and Host', async () => {
      const { context, sessionRulesStore } = createTestContext();
      const headers = [
        { name: 'Host', value: 'example.com' },
        { name: 'Cookie', value: 'sessionId=abc123xyz' },
        { name: 'Origin', value: 'https://trusted.example.com' },
        { name: 'Referer', value: 'https://trusted.example.com/login' },
      ];
      await context.updateHeaderModifySessionRules(headers);

      assert.equal(sessionRulesStore.length, 4);
      assert.equal(sessionRulesStore[0].action.requestHeaders[0].header, 'Host');
      assert.equal(sessionRulesStore[1].action.requestHeaders[0].header, 'Cookie');
      assert.equal(sessionRulesStore[2].action.requestHeaders[0].header, 'Origin');
      assert.equal(sessionRulesStore[3].action.requestHeaders[0].header, 'Referer');
    });

    it('rejects forbidden header prefixes like Sec- and Proxy-', async () => {
      const { context, sessionRulesStore } = createTestContext();
      const headers = [
        { name: 'Sec-CH-UA', value: 'test' },
        { name: 'Proxy-Authorization', value: 'Basic 123' },
        { name: 'X-Sec-Custom', value: 'allowed' },
      ];
      await context.updateHeaderModifySessionRules(headers);

      assert.equal(sessionRulesStore.length, 1);
      assert.equal(sessionRulesStore[0].action.requestHeaders[0].header, 'X-Sec-Custom');
    });

    it('rejects non-RFC valid header names containing spaces or invalid characters', async () => {
      const { context, sessionRulesStore } = createTestContext();
      const headers = [
        { name: 'Invalid Header Name', value: 'test' },
        { name: 'Header@Name', value: 'test' },
        { name: 'X-Valid-Token', value: 'test' },
      ];
      await context.updateHeaderModifySessionRules(headers);

      assert.equal(sessionRulesStore.length, 1);
      assert.equal(sessionRulesStore[0].action.requestHeaders[0].header, 'X-Valid-Token');
    });
  });

  describe('clearAllSessionRules', () => {
    it('removes all active session rules when getSessionRules is available', async () => {
      const { context, sessionRulesStore } = createTestContext();
      await context.updateBlockSessionRules(['ad.com']);
      await context.updateHeaderModifySessionRules([{ name: 'X-Test', value: '1' }]);
      assert.equal(sessionRulesStore.length, 2);

      await context.clearAllSessionRules();
      assert.equal(sessionRulesStore.length, 0);
    });
  });

  describe('Dynamic ResourceType Discovery & Automatic Updates', () => {
    it('falls back to complete 13 universal types including csp_report when ResourceType is not exposed', () => {
      const { context } = createTestContext();
      const types = context.getAllResourceTypes();
      assert.equal(types.length, 13);
      assert.ok(types.includes('csp_report'));
      assert.ok(types.includes('main_frame'));
      assert.ok(types.includes('websocket'));
    });

    it('dynamically queries Object.values(ResourceType) when available, auto-including newly added Chrome types', async () => {
      const { context, mockBrowser, sessionRulesStore } = createTestContext();

      // Simulate Chrome adding a new resource type in a future browser update (e.g. 'webtransport')
      mockBrowser.declarativeNetRequest.ResourceType = {
        MAIN_FRAME: 'main_frame',
        SUB_FRAME: 'sub_frame',
        STYLESHEET: 'stylesheet',
        SCRIPT: 'script',
        IMAGE: 'image',
        FONT: 'font',
        OBJECT: 'object',
        XMLHTTPREQUEST: 'xmlhttprequest',
        PING: 'ping',
        CSP_REPORT: 'csp_report',
        MEDIA: 'media',
        WEBSOCKET: 'websocket',
        OTHER: 'other',
        WEBTRANSPORT: 'webtransport', // Newly added browser type
      };

      const dynamicTypes = context.getAllResourceTypes();
      assert.equal(dynamicTypes.length, 14);
      assert.ok(dynamicTypes.includes('webtransport'));

      // Verify that newly added resource type is automatically populated into generated block rules
      await context.updateBlockSessionRules(['tracker.com']);
      assert.equal(sessionRulesStore.length, 1);
      assert.ok(sessionRulesStore[0].condition.resourceTypes.includes('webtransport'));
    });

    it('returns extended Firefox resource types (including beacon, imageset, json) when running in Firefox', async () => {
      const { context, sessionRulesStore } = createTestContext({
        navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0' },
      });
      assert.equal(context.httpTracker.isFF, true);

      const types = context.getAllResourceTypes();
      assert.equal(types.length, 19);
      assert.ok(types.includes('beacon'));
      assert.ok(types.includes('imageset'));
      assert.ok(types.includes('json'));
      assert.ok(types.includes('object_subrequest'));
      assert.ok(types.includes('speculative'));
      assert.ok(types.includes('web_manifest'));

      await context.updateBlockSessionRules(['track.net']);
      assert.equal(sessionRulesStore.length, 1);
      assert.ok(sessionRulesStore[0].condition.resourceTypes.includes('imageset'));
      assert.ok(sessionRulesStore[0].condition.resourceTypes.includes('beacon'));
    });
  });

  describe('Version Parity Verification', () => {
    it('ensures package.json and manifest.json versions are strictly identical', async () => {
      const fs = await import('node:fs');
      const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
      const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

      assert.strictEqual(
        pkg.version,
        manifest.version,
        `Version mismatch! package.json (${pkg.version}) must match manifest.json (${manifest.version}). Run "npm run set-version <version>" to sync them.`
      );
    });
  });
});
