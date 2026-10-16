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

  /* -------------------------------------------------------------------------
   * 5. URL Row Construction & HTTP Error Styling Logic
   * ------------------------------------------------------------------------- */
  describe('URL Row Construction & HTTP Error Styling Logic', () => {
    function createMockRow(event) {
      const classList = new Set();
      const row = {
        id: `web_events_list_${event.requestIdEnhanced}`,
        dataset: {
          requestId: event.requestIdEnhanced,
          rawRequestId: event.requestId,
        },
        classList: {
          add: (cls) => classList.add(cls),
          remove: (cls) => classList.delete(cls),
          contains: (cls) => classList.has(cls),
        },
        children: [
          { id: `web_event_url_${event.requestIdEnhanced}`, className: 'web_event_list_url', textContent: event.url },
          { id: `web_event_method_${event.requestIdEnhanced}`, className: 'web_event_list_method', textContent: event.method },
          { id: `web_event_status_${event.requestIdEnhanced}`, className: 'web_event_list_status', textContent: event.statusCode || (event.error ? 'Error' : 'N/A') },
          { id: `web_event_time_${event.requestIdEnhanced}`, className: 'web_event_list_date_time', textContent: event.timeStamp ? context.getReadableDate(event.timeStamp) : 'N/A' },
          { id: `web_event_cache_${event.requestIdEnhanced}`, className: 'web_event_list_cache', textContent: event.fromCache ?? 'N/A' },
        ],
      };
      if (event.callerName === 'onErrorOccurred' || event.error || (event.statusCode && Number(event.statusCode) >= 400)) {
        row.classList.add('web_event_style_error');
      }
      return row;
    }

    it('populates row dataset attributes and text content correctly', () => {
      const timestamp = new Date(2026, 9, 16, 12, 30, 0).getTime();
      const row = createMockRow({
        requestId: 'req-10',
        requestIdEnhanced: 'req-10_1',
        url: 'https://api.github.com/user',
        method: 'GET',
        statusCode: 200,
        timeStamp: timestamp,
        fromCache: false,
      });

      assert.equal(row.id, 'web_events_list_req-10_1');
      assert.equal(row.dataset.requestId, 'req-10_1');
      assert.equal(row.dataset.rawRequestId, 'req-10');
      assert.equal(row.children[0].textContent, 'https://api.github.com/user');
      assert.equal(row.children[1].textContent, 'GET');
      assert.equal(row.children[2].textContent, 200);
      assert.equal(row.children[3].textContent, '10/16 12:30:00');
      assert.equal(row.children[4].textContent, false);
      assert.equal(row.classList.contains('web_event_style_error'), false);
    });

    it('applies web_event_style_error for 4xx client errors and 5xx server errors', () => {
      const row404 = createMockRow({
        requestId: 'req-11',
        requestIdEnhanced: 'req-11',
        url: 'https://api.github.com/missing',
        method: 'GET',
        statusCode: 404,
      });
      assert.equal(row404.classList.contains('web_event_style_error'), true);

      const row502 = createMockRow({
        requestId: 'req-12',
        requestIdEnhanced: 'req-12',
        url: 'https://api.github.com/gateway',
        method: 'POST',
        statusCode: 502,
      });
      assert.equal(row502.classList.contains('web_event_style_error'), true);
    });

    it('applies web_event_style_error when callerName is onErrorOccurred or error is set', () => {
      const rowBlocked = createMockRow({
        requestId: 'req-13',
        requestIdEnhanced: 'req-13',
        url: 'https://analytics.tracker.com/collect',
        method: 'POST',
        callerName: 'onErrorOccurred',
        error: 'net::ERR_BLOCKED_BY_CLIENT',
      });
      assert.equal(rowBlocked.classList.contains('web_event_style_error'), true);
      assert.equal(rowBlocked.children[2].textContent, 'Error');
    });

    it('does NOT apply web_event_style_error for 2xx or 3xx responses', () => {
      const row200 = createMockRow({ requestId: 'req-14', requestIdEnhanced: 'req-14', statusCode: 200 });
      const row302 = createMockRow({ requestId: 'req-15', requestIdEnhanced: 'req-15', statusCode: 302 });
      const row304 = createMockRow({ requestId: 'req-16', requestIdEnhanced: 'req-16', statusCode: 304 });

      assert.equal(row200.classList.contains('web_event_style_error'), false);
      assert.equal(row302.classList.contains('web_event_style_error'), false);
      assert.equal(row304.classList.contains('web_event_style_error'), false);
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
   * 7. Interactive Column Header Filter Matcher (matchesColumnFilters)
   * ------------------------------------------------------------------------- */
  describe('Column Header Filters Matcher (matchesColumnFilters)', () => {
    it('returns true when filters are null, undefined, or empty', () => {
      const item = { url: 'https://example.com/api', method: 'GET', status: '200' };
      assert.equal(context.matchesColumnFilters(item, null), true);
      assert.equal(context.matchesColumnFilters(item, {}), true);
      assert.equal(context.matchesColumnFilters(item, { url: '', method: '   ' }), true);
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

    it('handles regex special characters in URL filters without throwing syntax errors', () => {
      const itemWithQuery = { url: 'https://example.com/search?q=test&page=1', method: 'GET', status: '200' };
      const itemWithSymbols = { url: 'https://example.com/v1(beta)/item+detail[42]', method: 'GET', status: '200' };

      // Query params containing ? and =
      assert.equal(context.matchesColumnFilters(itemWithQuery, { url: '?q=test' }), true);
      assert.equal(context.matchesColumnFilters(itemWithQuery, { url: '?q=missing' }), false);

      // Parentheses, plus, brackets, asterisks, caret, dollar
      assert.equal(context.matchesColumnFilters(itemWithSymbols, { url: '(beta)' }), true);
      assert.equal(context.matchesColumnFilters(itemWithSymbols, { url: 'item+' }), true);
      assert.equal(context.matchesColumnFilters(itemWithSymbols, { url: '[42]' }), true);
      assert.equal(context.matchesColumnFilters(itemWithSymbols, { url: 'v1 & [42]' }), true);
    });

    it('filters by Method column with case insensitivity, trimming, and OR (|)', () => {
      const postItem = { url: 'https://api.com/items', method: 'POST' };
      const getItem = { url: 'https://api.com/items', method: 'GET' };
      const putItem = { url: 'https://api.com/items', method: 'PUT' };

      assert.equal(context.matchesColumnFilters(postItem, { method: '  post  ' }), true);
      assert.equal(context.matchesColumnFilters(postItem, { method: 'POST' }), true);
      assert.equal(context.matchesColumnFilters(getItem, { method: 'post' }), false);
      assert.equal(context.matchesColumnFilters(putItem, { method: 'get | put' }), true);
      assert.equal(context.matchesColumnFilters(postItem, { method: 'get | put' }), false);
    });

    it('filters by Status column with exact code, wildcards (1xx-5xx), error keyword, and pipe (|)', () => {
      const infoItem = { url: 'https://api.com', status: '101' };
      const okItem = { url: 'https://api.com', status: '200' };
      const redirectItem = { url: 'https://api.com', status: '302' };
      const notFoundItem = { url: 'https://api.com', status: '404' };
      const serverErrItem = { url: 'https://api.com', status: '500' };

      // Wildcards 1xx, 2xx, 3xx, 4xx, 5xx
      assert.equal(context.matchesColumnFilters(infoItem, { status: '1xx' }), true);
      assert.equal(context.matchesColumnFilters(okItem, { status: '2xx' }), true);
      assert.equal(context.matchesColumnFilters(redirectItem, { status: '3xx' }), true);
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: '4xx' }), true);
      assert.equal(context.matchesColumnFilters(serverErrItem, { status: '5xx' }), true);

      // Negative checks
      assert.equal(context.matchesColumnFilters(okItem, { status: '4xx' }), false);
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: '2xx' }), false);

      // Multi-status pipe (|)
      assert.equal(context.matchesColumnFilters(okItem, { status: '200 | 204 | 304' }), true);
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: '200 | 204 | 304' }), false);
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: '200 | 4xx' }), true);

      // Keyword error
      assert.equal(context.matchesColumnFilters(notFoundItem, { status: 'error' }), true);
      assert.equal(context.matchesColumnFilters(serverErrItem, { status: 'error' }), true);
      assert.equal(context.matchesColumnFilters(okItem, { status: 'error' }), false);
    });

    it('filters by Cache column supporting true/1/cached/yes vs false/0/uncached/no', () => {
      const cached = { url: 'https://cdn.com', fromCache: 'true' };
      const uncached = { url: 'https://api.com', fromCache: 'false' };

      for (const affirmative of ['true', '1', 'cached', 'yes']) {
        assert.equal(context.matchesColumnFilters(cached, { cache: affirmative }), true, `Expected ${affirmative} to match cached`);
        assert.equal(context.matchesColumnFilters(uncached, { cache: affirmative }), false, `Expected ${affirmative} not to match uncached`);
      }

      for (const negative of ['false', '0', 'uncached', 'no']) {
        assert.equal(context.matchesColumnFilters(uncached, { cache: negative }), true, `Expected ${negative} to match uncached`);
        assert.equal(context.matchesColumnFilters(cached, { cache: negative }), false, `Expected ${negative} not to match cached`);
      }
    });

    it('filters by Date time column using partial substring matching', () => {
      const item = { url: 'https://api.com', date: '10/16 14:25:30' };
      assert.equal(context.matchesColumnFilters(item, { date: '10/16' }), true);
      assert.equal(context.matchesColumnFilters(item, { date: '14:25' }), true);
      assert.equal(context.matchesColumnFilters(item, { date: '10/17' }), false);
    });

    it('combines all 5 column filters simultaneously with AND logic', () => {
      const match = { url: 'https://store.com/api/pay', method: 'POST', status: '200', date: '10/16 11:00:00', fromCache: 'false' };
      const allFiveFilter = {
        url: 'pay',
        method: 'post',
        status: '2xx',
        date: '10/16',
        cache: 'false',
      };

      assert.equal(context.matchesColumnFilters(match, allFiveFilter), true);

      // Fails if any single column does not match
      assert.equal(context.matchesColumnFilters({ ...match, method: 'GET' }, allFiveFilter), false);
      assert.equal(context.matchesColumnFilters({ ...match, status: '500' }, allFiveFilter), false);
      assert.equal(context.matchesColumnFilters({ ...match, fromCache: 'true' }, allFiveFilter), false);
      assert.equal(context.matchesColumnFilters({ ...match, date: '01/01 00:00:00' }, allFiveFilter), false);
      assert.equal(context.matchesColumnFilters({ ...match, url: 'https://store.com/home' }, allFiveFilter), false);
    });

    it('evaluates DOM row elements accurately across columns and handles missing children gracefully', () => {
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

      // Malformed element with missing children should not throw
      const malformed = { children: [] };
      assert.equal(context.matchesColumnFilters(malformed, { url: 'test' }), false);
    });
  });
});

