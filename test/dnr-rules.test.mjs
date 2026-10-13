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
            'script', 'stylesheet', 'image', 'font', 'object', 'media', 'websocket', 'ping',
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
            'script', 'stylesheet', 'image', 'font', 'object', 'media', 'websocket', 'ping',
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
            'script', 'stylesheet', 'image', 'font', 'object', 'media', 'websocket', 'ping',
          ],
        },
      });

      // Wildcard url fallback when url is empty
      assert.equal(sessionRulesStore[1].condition.urlFilter, '*');
    });

    it('rejects forbidden headers like Host, Cookie, Origin, Referer', async () => {
      const { context, sessionRulesStore } = createTestContext();
      const headers = [
        { name: 'Host', value: 'evil.com' },
        { name: 'Cookie', value: 'bad=1' },
        { name: 'Origin', value: 'https://evil.com' },
        { name: 'Referer', value: 'https://evil.com' },
        { name: 'X-Allowed', value: 'ok' },
      ];
      await context.updateHeaderModifySessionRules(headers);

      assert.equal(sessionRulesStore.length, 1);
      assert.equal(sessionRulesStore[0].action.requestHeaders[0].header, 'X-Allowed');
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
});
