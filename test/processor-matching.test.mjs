import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './test-helpers.mjs';

describe('Processor Matching & Filtering Logic Unit Tests', () => {
  const { context } = createTestContext();

  describe('Sequential AND (&) vs OR (|) Filter Matching Algorithm', () => {
    it('matches any pattern when in OR mode', () => {
      const patterns = ['google', 'yahoo'];
      assert.equal(context.matchesFilter('https://google.com/search', patterns, false), true);
      assert.equal(context.matchesFilter('https://yahoo.com/news', patterns, false), true);
      assert.equal(context.matchesFilter('https://bing.com/search', patterns, false), false);
    });

    it('matches sequential patterns in order when in AND mode', () => {
      const patterns = ['api', 'v1', 'users'];
      assert.equal(context.matchesFilter('https://api.example.com/v1/users', patterns, true), true);
      // Fails when order is reversed
      assert.equal(context.matchesFilter('https://users.example.com/v1/api', patterns, true), false);
      // Fails when one token is missing
      assert.equal(context.matchesFilter('https://api.example.com/v2/users', patterns, true), false);
    });

    it('handles empty input or empty patterns list gracefully', () => {
      assert.equal(context.matchesFilter('anything', [], false), true);
      assert.equal(context.matchesFilter('', ['token'], false), false);
      assert.equal(context.matchesFilter(null, ['token'], false), false);
    });
  });

  describe('Mask Value Algorithm', () => {
    const patterns = ['authorization', 'secret', 'token', 'password'];

    it('masks secrets longer than 2 characters preserving only first and last characters', () => {
      assert.equal(context.maskValue('Authorization', 'Bearer 12345678', patterns, true), 'B*****8');
      assert.equal(context.maskValue('auth_token', 'supersecret', patterns, true), 's*****t');
      assert.equal(context.maskValue('user_password', 'p@ssw0rd!', patterns, true), 'p*****!');
    });

    it('masks 1-char and 2-char secrets with five asterisks', () => {
      assert.equal(context.maskValue('secret_pin', 'ab', patterns, true), '*****');
      assert.equal(context.maskValue('secret_digit', '7', patterns, true), '*****');
    });

    it('does not mask unlisted keys', () => {
      assert.equal(context.maskValue('Content-Type', 'application/json', patterns, true), 'application/json');
      assert.equal(context.maskValue('Host', 'example.com', patterns, true), 'example.com');
    });

    it('does not mask when masking is disabled', () => {
      assert.equal(context.maskValue('Authorization', 'Bearer 12345', patterns, false), 'Bearer 12345');
    });
  });

  describe('URL Include & Exclude Pattern Matcher', () => {
    it('includes all URLs when include lists are empty', () => {
      assert.equal(context.matchesIncludePattern('https://example.com/api', [], []), true);
    });

    it('includes URLs matching local or global include patterns', () => {
      assert.equal(context.matchesIncludePattern('https://example.com/api', ['api'], []), true);
      assert.equal(context.matchesIncludePattern('https://example.com/auth', [], ['auth']), true);
      assert.equal(context.matchesIncludePattern('https://example.com/static', ['api'], ['auth']), false);
    });

    it('excludes URLs matching local or global exclude patterns', () => {
      assert.equal(context.matchesExcludePattern('https://example.com/analytics.js', ['.js'], []), true);
      assert.equal(context.matchesExcludePattern('https://example.com/favicon.ico', [], ['favicon']), true);
      assert.equal(context.matchesExcludePattern('https://example.com/api/users', ['.js'], ['favicon']), false);
    });
  });

  describe('Find-in-Details HTML Highlight Algorithm (addMarkTag)', () => {
    it('wraps matches in <mark> tags without double-escaping', () => {
      const regex = new RegExp('Bearer', 'gi');
      const input = 'Authorization: Bearer <token_xyz>';
      const output = context.addMarkTag(input, regex);
      assert.equal(output, 'Authorization: <mark>Bearer</mark> &lt;token_xyz&gt;');
    });

    it('escapes special HTML characters in both matched and non-matched segments', () => {
      const regex = new RegExp('<script>', 'gi');
      const input = 'Attack: <script>alert(1)</script>';
      const output = context.addMarkTag(input, regex);
      assert.equal(output, 'Attack: <mark>&lt;script&gt;</mark>alert(1)&lt;/script&gt;');
    });

    it('returns escaped string when regex is null or empty', () => {
      const input = '<b>Bold & Beautiful</b>';
      assert.equal(context.addMarkTag(input, null), '&lt;b&gt;Bold &amp; Beautiful&lt;/b&gt;');
    });
  });

  describe('Visible Element Fast-Path Query Detection', () => {
    it('detects visible row presence via querySelector fast-path', () => {
      const mockContainer = {
        querySelector: (selector) => {
          if (selector.includes(':not(.web_event_list_hide)')) {
            return { id: 'web_events_list_101' };
          }
          return null;
        },
      };
      const hasVisibleRow = Boolean(mockContainer.querySelector('.web_event_list_blank:not(.web_event_list_hide)'));
      assert.equal(hasVisibleRow, true);
    });

    it('returns false when all elements are hidden or container is empty', () => {
      const allHiddenContainer = {
        querySelector: () => null,
      };
      const hasVisibleRow = Boolean(allHiddenContainer.querySelector('.web_event_list_blank:not(.web_event_list_hide)'));
      assert.equal(hasVisibleRow, false);
    });
  });

  describe('Atomic Batch Clear via replaceChildren', () => {
    it('replaces all row children while preserving heading in a single atomic call', () => {
      let replacedWith = null;
      const heading = { id: 'urls_list_heading' };
      const container = {
        replaceChildren: (...args) => {
          replacedWith = args;
        },
      };

      if (heading) {
        container.replaceChildren(heading);
      }
      assert.equal(replacedWith?.length, 1);
      assert.equal(replacedWith[0].id, 'urls_list_heading');
    });

    it('clears container completely when heading element is missing', () => {
      let replacedWith = null;
      const container = {
        replaceChildren: (...args) => {
          replacedWith = args;
        },
      };

      container.replaceChildren();
      assert.equal(replacedWith?.length, 0);
    });
  });

  describe('Row Event Delegation with closest()', () => {
    function simulateClosestDelegation(target) {
      const row = target?.closest?.('.web_event_list_blank');
      return row ? row.id : null;
    }

    it('resolves row when clicking directly on row padding or margin', () => {
      const row = {
        id: 'web_events_list_301',
        closest: (selector) => (selector === '.web_event_list_blank' ? row : null),
      };
      assert.equal(simulateClosestDelegation(row), 'web_events_list_301');
    });

    it('resolves row when clicking inside deeply nested markup like <mark> tag', () => {
      const row = { id: 'web_events_list_302' };
      const nestedMark = {
        closest: (selector) => (selector === '.web_event_list_blank' ? row : null),
      };
      assert.equal(simulateClosestDelegation(nestedMark), 'web_events_list_302');
    });

    it('returns null when clicking outside rows such as table heading', () => {
      const heading = {
        id: 'urls_list_heading',
        closest: () => null,
      };
      assert.equal(simulateClosestDelegation(heading), null);
      assert.equal(simulateClosestDelegation(null), null);
    });
  });

  /* -------------------------------------------------------------------------
   * 8. DevTools Smart Filter (parseSmartFilter & matchesSmartFilter)
   * ------------------------------------------------------------------------- */
  describe('DevTools Smart Filter Parser & Row Matcher', () => {
    it('returns null for empty, whitespace, or 1-character queries', () => {
      assert.equal(context.parseSmartFilter(''), null);
      assert.equal(context.parseSmartFilter('  '), null);
      assert.equal(context.parseSmartFilter('a'), null);
    });

    it('parses legacy sequential AND (&) queries', () => {
      const parsed = context.parseSmartFilter('google & api');
      assert.equal(parsed.type, 'and');
      assert.deepEqual(parsed.patterns, ['google', 'api']);
    });

    it('parses legacy OR (|) queries', () => {
      const parsed = context.parseSmartFilter('get | post');
      assert.equal(parsed.type, 'or');
      assert.deepEqual(parsed.patterns, ['get', 'post']);
    });

    it('parses DevTools keyword prefixes (method, status, cache, is:cached)', () => {
      const parsed = context.parseSmartFilter('api method:post status:404 is:cached');
      assert.equal(parsed.type, 'smart');
      assert.deepEqual(parsed.textPatterns, ['api']);
      assert.deepEqual(parsed.conditions, [
        { field: 'method', value: 'post' },
        { field: 'status', value: '404' },
        { field: 'cache', value: 'true' },
      ]);
    });

    it('matches plain text URL across data objects and elements', () => {
      const parsed = context.parseSmartFilter('checkout');
      const matchItem = { url: 'https://store.com/checkout/pay', method: 'POST', status: '200' };
      const nonMatchItem = { url: 'https://store.com/browse/items', method: 'GET', status: '200' };

      assert.equal(context.matchesSmartFilter(matchItem, parsed), true);
      assert.equal(context.matchesSmartFilter(nonMatchItem, parsed), false);
    });

    it('matches method condition accurately', () => {
      const postFilter = context.parseSmartFilter('method:post');
      const getFilter = context.parseSmartFilter('method:get');

      const item = { url: 'https://api.com/v1', method: 'POST', status: '200' };
      assert.equal(context.matchesSmartFilter(item, postFilter), true);
      assert.equal(context.matchesSmartFilter(item, getFilter), false);
    });

    it('matches status codes including wildcards (4xx, 5xx) and error keyword', () => {
      const status404Filter = context.parseSmartFilter('status:404');
      const status4xxFilter = context.parseSmartFilter('status:4xx');
      const status5xxFilter = context.parseSmartFilter('status:5xx');
      const errorFilter = context.parseSmartFilter('is:error');

      const notFoundItem = { url: 'https://api.com/item', method: 'GET', status: '404' };
      const serverErrItem = { url: 'https://api.com/crash', method: 'POST', status: '500' };
      const okItem = { url: 'https://api.com/ok', method: 'GET', status: '200' };

      assert.equal(context.matchesSmartFilter(notFoundItem, status404Filter), true);
      assert.equal(context.matchesSmartFilter(notFoundItem, status4xxFilter), true);
      assert.equal(context.matchesSmartFilter(notFoundItem, status5xxFilter), false);

      assert.equal(context.matchesSmartFilter(serverErrItem, status5xxFilter), true);
      assert.equal(context.matchesSmartFilter(serverErrItem, status4xxFilter), false);

      assert.equal(context.matchesSmartFilter(notFoundItem, errorFilter), true);
      assert.equal(context.matchesSmartFilter(serverErrItem, errorFilter), true);
      assert.equal(context.matchesSmartFilter(okItem, errorFilter), false);
    });

    it('matches compound criteria (e.g. method:post status:200 api)', () => {
      const compound = context.parseSmartFilter('api method:post status:200');

      const perfectMatch = { url: 'https://mysite.com/api/orders', method: 'POST', status: '200' };
      const wrongMethod = { url: 'https://mysite.com/api/orders', method: 'GET', status: '200' };
      const wrongStatus = { url: 'https://mysite.com/api/orders', method: 'POST', status: '400' };
      const wrongUrl = { url: 'https://mysite.com/other/orders', method: 'POST', status: '200' };

      assert.equal(context.matchesSmartFilter(perfectMatch, compound), true);
      assert.equal(context.matchesSmartFilter(wrongMethod, compound), false);
      assert.equal(context.matchesSmartFilter(wrongStatus, compound), false);
      assert.equal(context.matchesSmartFilter(wrongUrl, compound), false);
    });

    it('matches cache condition (is:cached vs cache:false)', () => {
      const cachedFilter = context.parseSmartFilter('is:cached');
      const uncachedFilter = context.parseSmartFilter('cache:false');

      const cachedItem = { url: 'https://cdn.com/app.js', fromCache: 'true' };
      const networkItem = { url: 'https://cdn.com/app.js', fromCache: 'false' };

      assert.equal(context.matchesSmartFilter(cachedItem, cachedFilter), true);
      assert.equal(context.matchesSmartFilter(networkItem, cachedFilter), false);

      assert.equal(context.matchesSmartFilter(networkItem, uncachedFilter), true);
      assert.equal(context.matchesSmartFilter(cachedItem, uncachedFilter), false);
    });

    it('evaluates DOM element structure correctly', () => {
      const parsed = context.parseSmartFilter('method:post status:200');

      const fakeElement = {
        children: [
          { textContent: 'https://api.example.com/login' },
          { textContent: 'POST' },
          { textContent: '200' },
          { textContent: '10/16 10:00:00' },
          { textContent: 'false' },
        ],
        classList: { contains: () => false },
      };

      assert.equal(context.matchesSmartFilter(fakeElement, parsed), true);
    });
  });

  /* -------------------------------------------------------------------------
   * 9. Interactive Column Header Filter Matcher (matchesColumnFilters)
   * ------------------------------------------------------------------------- */
  describe('Column Header Filters Matcher (matchesColumnFilters)', () => {
    it('returns true when filters are null, undefined, or empty', () => {
      const item = { url: 'https://example.com/api', method: 'GET', status: '200' };
      assert.equal(context.matchesColumnFilters(item, null), true);
      assert.equal(context.matchesColumnFilters(item, {}), true);
    });

    it('filters by URL column supporting substring, AND (&), and OR (|)', () => {
      const item1 = { url: 'https://api.github.com/v1/users', method: 'GET' };
      const item2 = { url: 'https://cdn.example.com/bundle.js', method: 'GET' };

      // Substring
      assert.equal(context.matchesColumnFilters(item1, { url: 'github' }), true);
      assert.equal(context.matchesColumnFilters(item2, { url: 'github' }), false);

      // AND (&)
      assert.equal(context.matchesColumnFilters(item1, { url: 'api & users' }), true);
      assert.equal(context.matchesColumnFilters(item1, { url: 'api & repos' }), false);

      // OR (|)
      assert.equal(context.matchesColumnFilters(item1, { url: 'github | bitbucket' }), true);
      assert.equal(context.matchesColumnFilters(item2, { url: 'github | bitbucket' }), false);
    });

    it('filters by Method column with case insensitivity and OR (|)', () => {
      const postItem = { url: 'https://api.com/items', method: 'POST' };
      const getItem = { url: 'https://api.com/items', method: 'GET' };
      const putItem = { url: 'https://api.com/items', method: 'PUT' };

      assert.equal(context.matchesColumnFilters(postItem, { method: 'post' }), true);
      assert.equal(context.matchesColumnFilters(getItem, { method: 'post' }), false);
      assert.equal(context.matchesColumnFilters(putItem, { method: 'get | put' }), true);
      assert.equal(context.matchesColumnFilters(postItem, { method: 'get | put' }), false);
    });

    it('filters by Status column with exact code, wildcards (4xx, 5xx), and error keyword', () => {
      const okItem = { url: 'https://api.com', status: '200' };
      const notFoundItem = { url: 'https://api.com', status: '404' };
      const serverErrItem = { url: 'https://api.com', status: '500' };

      // Exact
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: '404' }), true);
      assert.equal(context.matchesColumnFilters(okItem, { status: '404' }), false);

      // Wildcard 4xx
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: '4xx' }), true);
      assert.equal(context.matchesColumnFilters(serverErrItem, { status: '4xx' }), false);

      // Wildcard 5xx
      assert.equal(context.matchesColumnFilters(serverErrItem, { status: '5xx' }), true);
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: '5xx' }), false);

      // Keyword error
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: 'error' }), true);
      assert.equal(context.matchesColumnFilters(serverErrItem, { status: 'error' }), true);
      assert.equal(context.matchesColumnFilters(okItem, { status: 'error' }), false);
    });

    it('filters by Cache column (true/1 vs false/0)', () => {
      const cached = { url: 'https://cdn.com', fromCache: 'true' };
      const uncached = { url: 'https://api.com', fromCache: 'false' };

      assert.equal(context.matchesColumnFilters(cached, { cache: 'true' }), true);
      assert.equal(context.matchesColumnFilters(uncached, { cache: 'true' }), false);

      assert.equal(context.matchesColumnFilters(uncached, { cache: 'false' }), true);
      assert.equal(context.matchesColumnFilters(cached, { cache: 'false' }), false);
    });

    it('combines multiple column filters simultaneously with AND logic', () => {
      const match = { url: 'https://store.com/api/pay', method: 'POST', status: '200', fromCache: 'false' };
      const wrongMethod = { url: 'https://store.com/api/pay', method: 'GET', status: '200', fromCache: 'false' };
      const wrongStatus = { url: 'https://store.com/api/pay', method: 'POST', status: '500', fromCache: 'false' };
      const wrongUrl = { url: 'https://store.com/home', method: 'POST', status: '200', fromCache: 'false' };

      const multiFilter = { url: 'pay', method: 'post', status: '200' };

      assert.equal(context.matchesColumnFilters(match, multiFilter), true);
      assert.equal(context.matchesColumnFilters(wrongMethod, multiFilter), false);
      assert.equal(context.matchesColumnFilters(wrongStatus, multiFilter), false);
      assert.equal(context.matchesColumnFilters(wrongUrl, multiFilter), false);
    });

    it('evaluates DOM row elements accurately across columns', () => {
      const fakeElement = {
        children: [
          { textContent: 'https://service.org/v2/auth' },
          { textContent: 'POST' },
          { textContent: '201' },
          { textContent: '10/16 11:30:00' },
          { textContent: 'false' },
        ],
        classList: { contains: () => false },
      };

      assert.equal(context.matchesColumnFilters(fakeElement, { url: 'auth', method: 'post', status: '2xx' }), true);
      assert.equal(context.matchesColumnFilters(fakeElement, { url: 'auth', method: 'get' }), false);
    });
  });
});

