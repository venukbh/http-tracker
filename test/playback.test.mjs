import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestContext } from './test-helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, 'fixtures', 'events.json');

describe('Browser WebEvent Playback & Feature Verification Tests', () => {
  const events = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const { context, mockBrowser, sessionRulesStore, domElements } = createTestContext();
  const eventCache = context.httpTrackerEventCache;

  // Extract unique URLs from the captured payload
  const payloadUrls = [...new Set(events.filter(e => e.url).map(e => e.url))];

  beforeEach(async () => {
    eventCache.clearAll();
    await context.clearAllSessionRules();
  });

  /* -------------------------------------------------------------------------
   * 1. Baseline Playback & Correlation Verification
   * ------------------------------------------------------------------------- */
  describe('Payload WebEvents Ingestion & Correlation', () => {
    it('successfully loads and parses the 75 webEvents fixture', () => {
      assert.equal(Array.isArray(events), true);
      assert.equal(events.length, 75);
      assert.ok(payloadUrls.length > 5, 'Should have multiple unique URLs');
    });

    it('records every event into eventCache and tracks multi-hop redirect chains', () => {
      for (const event of events) {
        eventCache.recordEvent(event);
      }

      // Standard GET with query param
      const getReq = eventCache.getRequest('39512');
      const getRes = eventCache.getResponse('39512');
      assert.equal(getReq?.url, 'https://httpbin.org/get?query=test');
      assert.equal(getRes?.statusCode, 200);

      // Multi-hop redirect chain: 39521 -> 39521_1 -> 39521_2
      const hop1 = eventCache.getRequest('39521');
      const hop2 = eventCache.getRequest('39521_1');
      const hop3 = eventCache.getRequest('39521_2');
      assert.equal(hop1?.url, 'https://httpbin.org/redirect/2');
      assert.equal(hop2?.url, 'https://httpbin.org/relative-redirect/1');
      assert.equal(hop3?.url, 'https://httpbin.org/get');
      assert.equal(eventCache.getResponse('39521')?.statusCode, 302);
      assert.equal(eventCache.getResponse('39521_1')?.statusCode, 302);
      assert.equal(eventCache.getResponse('39521_2')?.statusCode, 200);

      // 404 response
      assert.equal(eventCache.getResponse('39531')?.statusCode, 404);
    });
  });

  /* -------------------------------------------------------------------------
   * 2. Sequential AND (&) vs OR (|) Filters applied to Payload URLs
   * ------------------------------------------------------------------------- */
  describe('Filter Matching against Payload URLs', () => {
    it('applies OR (|) filter to match any pattern across payload URLs', () => {
      const orPatterns = ['favicon', 'example'];
      const matchedUrls = payloadUrls.filter(url => context.matchesFilter(url, orPatterns, false));

      assert.deepEqual(matchedUrls.sort(), [
        'https://example.com/',
        'https://example.com/s.js',
        'https://httpbin.org/favicon.ico',
      ].sort());

      // Should not match other httpbin URLs
      assert.equal(context.matchesFilter('https://httpbin.org/get?query=test', orPatterns, false), false);
      assert.equal(context.matchesFilter('https://httpbin.org/post', orPatterns, false), false);
    });

    it('applies sequential AND (&) filter requiring patterns to appear in order', () => {
      // In-order match on cookies endpoint
      const andPatterns = ['httpbin', 'cookies', 'tracker'];
      const matches = payloadUrls.filter(url => context.matchesFilter(url, andPatterns, true));

      assert.deepEqual(matches, ['https://httpbin.org/cookies/set?tracker=testcookie']);

      // Fails when token is missing
      assert.equal(context.matchesFilter('https://httpbin.org/cookies', andPatterns, true), false);

      // Fails when order is reversed
      const reversedPatterns = ['tracker', 'httpbin'];
      assert.equal(context.matchesFilter('https://httpbin.org/cookies/set?tracker=testcookie', reversedPatterns, true), false);
    });

    it('filters query parameters precisely', () => {
      const queryFilter = ['query=test'];
      const matches = payloadUrls.filter(url => context.matchesFilter(url, queryFilter, false));
      assert.deepEqual(matches, ['https://httpbin.org/get?query=test']);
    });
  });

  /* -------------------------------------------------------------------------
   * 3. Blocking: DeclarativeNetRequest Session Rules applied to Payload Requests
   * ------------------------------------------------------------------------- */
  describe('Blocking via DeclarativeNetRequest Session Rules', () => {
    it('generates DNR block rules for targeted payload endpoints', async () => {
      const blockPatterns = ['favicon.ico', 'status/404'];
      await context.updateBlockSessionRules(blockPatterns);

      const rules = await mockBrowser.declarativeNetRequest.getSessionRules();
      assert.equal(rules.length, 2);

      // Rule 1000: favicon.ico
      assert.equal(rules[0].id, 1000);
      assert.equal(rules[0].action.type, 'block');
      assert.equal(rules[0].condition.urlFilter, '*favicon.ico*');

      // Rule 1001: status/404
      assert.equal(rules[1].id, 1001);
      assert.equal(rules[1].action.type, 'block');
      assert.equal(rules[1].condition.urlFilter, '*status/404*');
    });

    it('evaluates blocking pattern matching against payload URLs via matchesExcludePattern', async () => {
      const blockPatterns = ['favicon.ico', 'status/404'];
      await context.updateBlockSessionRules(blockPatterns);

      const blockedUrls = payloadUrls.filter((url) => context.matchesExcludePattern(url, blockPatterns, []));
      const allowedUrls = payloadUrls.filter((url) => !context.matchesExcludePattern(url, blockPatterns, []));

      assert.ok(blockedUrls.includes('https://httpbin.org/favicon.ico'));
      assert.ok(blockedUrls.includes('https://httpbin.org/status/404'));
      assert.ok(allowedUrls.includes('https://httpbin.org/get?query=test'));
      assert.ok(allowedUrls.includes('https://example.com/'));
    });
  });

  /* -------------------------------------------------------------------------
   * 4. Include & Exclude Pattern Filtering applied to Payload Requests
   * ------------------------------------------------------------------------- */
  describe('Include & Exclude Pattern Filtering on Payload', () => {
    it('includes all payload URLs when include patterns are empty', () => {
      for (const url of payloadUrls) {
        assert.equal(context.matchesIncludePattern(url, [], []), true);
      }
    });

    it('filters payload URLs using local and global include patterns', () => {
      const localInclude = ['httpbin.org/redirect'];
      const globalInclude = ['example.com'];

      const included = payloadUrls.filter(url =>
        context.matchesIncludePattern(url, localInclude, globalInclude)
      );

      assert.deepEqual(included.sort(), [
        'https://example.com/',
        'https://example.com/s.js',
        'https://httpbin.org/redirect/2',
      ].sort());
    });

    it('excludes targeted payload URLs using local and global exclude patterns', () => {
      const localExclude = ['favicon.ico'];
      const globalExclude = ['s.js'];

      const excluded = payloadUrls.filter(url =>
        context.matchesExcludePattern(url, localExclude, globalExclude)
      );

      assert.deepEqual(excluded.sort(), [
        'https://example.com/s.js',
        'https://httpbin.org/favicon.ico',
      ].sort());
    });

    it('applies combined (include && !exclude) pipeline to payload URLs', () => {
      const includes = ['httpbin.org'];
      const excludes = ['status/404', 'favicon.ico'];

      const filtered = payloadUrls.filter(url =>
        context.matchesIncludePattern(url, includes, []) &&
        !context.matchesExcludePattern(url, excludes, [])
      );

      assert.ok(!filtered.includes('https://httpbin.org/status/404'), '404 should be excluded');
      assert.ok(!filtered.includes('https://httpbin.org/favicon.ico'), 'favicon should be excluded');
      assert.ok(!filtered.includes('https://example.com/'), 'example.com not included');
      assert.ok(filtered.includes('https://httpbin.org/get?query=test'), 'get should be included');
      assert.ok(filtered.includes('https://httpbin.org/post'), 'post should be included');
    });
  });

  /* -------------------------------------------------------------------------
   * 5. Optimize Cookies Flag Verification on Payload Response
   * ------------------------------------------------------------------------- */
  describe('Optimize Cookies in Details View', () => {
    it('renders Cookies (optimized) and deduplicates cookies by name/domain/path', () => {
      const detailsView = context.httpTrackerDetailsView;

      // Construct a response with multiple Set-Cookie headers on the same path
      const cookieResponse = {
        url: 'https://httpbin.org/cookies/set?tracker=testcookie',
        statusCode: 302,
        statusLine: 'HTTP/1.1 302 Found',
        responseHeaders: [
          { name: 'Content-Type', value: 'text/html; charset=utf-8' },
          { name: 'Set-Cookie', value: 'tracker=initial_val; Path=/' },
          { name: 'Set-Cookie', value: 'tracker=updated_val; Path=/' },
          { name: 'Set-Cookie', value: 'session_id=sess_999; Domain=httpbin.org; Path=/sub' },
        ],
      };

      // 1. With optimizeResponseCookies = true
      detailsView.renderSelectedEventDetails({
        requestEvent: null,
        responseEvent: cookieResponse,
        requestBody: null,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: true,
        compiledFindPattern: null,
      });

      const optHtml = domElements.get('response_headers_details_body')?.innerHTML || '';
      assert.ok(optHtml.includes('Cookies (optimized)'), 'Should display optimized banner');
      assert.ok(optHtml.includes('updated_val'), 'Should retain updated cookie value');
      assert.ok(!optHtml.includes('initial_val'), 'Should deduplicate and drop superseded cookie');
      assert.ok(optHtml.includes('sess_999'), 'Should retain cookie with different path/domain');

      // 2. With optimizeResponseCookies = false
      detailsView.renderSelectedEventDetails({
        requestEvent: null,
        responseEvent: cookieResponse,
        requestBody: null,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });

      const unoptHtml = domElements.get('response_headers_details_body')?.innerHTML || '';
      assert.ok(unoptHtml.includes('Cookies (unoptimized)'), 'Should display unoptimized banner');
      assert.ok(unoptHtml.includes('initial_val'), 'Unoptimized mode should keep initial cookie');
      assert.ok(unoptHtml.includes('updated_val'), 'Unoptimized mode should keep updated cookie');
      assert.ok(unoptHtml.includes('sess_999'), 'Unoptimized mode should keep session cookie');
    });

    it('normalizes leading dot and domain casing when deduplicating cookies', () => {
      const detailsView = context.httpTrackerDetailsView;
      const dotResponse = {
        url: 'https://example.com/',
        statusCode: 200,
        responseHeaders: [
          { name: 'Set-Cookie', value: 'auth=token_v1; Domain=.example.com; Path=/' },
          { name: 'Set-Cookie', value: 'auth=token_v2; Domain=example.com; Path=/' },
        ],
      };

      detailsView.renderSelectedEventDetails({
        requestEvent: null,
        responseEvent: dotResponse,
        requestBody: null,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: true,
        compiledFindPattern: null,
      });

      const html = domElements.get('response_headers_details_body')?.innerHTML || '';
      assert.ok(html.includes('token_v2'), 'Should retain updated cookie token_v2');
      assert.ok(!html.includes('token_v1'), 'Should deduplicate .example.com and example.com');
    });
  });

  /* -------------------------------------------------------------------------
   * 6. Header Override via DNR Rules on Payload Requests
   * ------------------------------------------------------------------------- */
  describe('Header Override via DeclarativeNetRequest Session Rules', () => {
    it('creates header modification rules for target payload domain', async () => {
      const headerOverrides = [
        { name: 'X-Test-Trace-Id', value: 'trace-12345', url: 'httpbin.org' },
        { name: 'X-App-Env', value: 'testing', url: '' },
      ];

      await context.updateHeaderModifySessionRules(headerOverrides);

      const rules = await mockBrowser.declarativeNetRequest.getSessionRules();
      assert.equal(rules.length, 2);

      // Rule 2000: scoped to httpbin.org
      assert.equal(rules[0].id, 2000);
      assert.equal(rules[0].action.type, 'modifyHeaders');
      assert.deepEqual(rules[0].action.requestHeaders, [
        { header: 'X-Test-Trace-Id', operation: 'set', value: 'trace-12345' },
      ]);
      assert.equal(rules[0].condition.urlFilter, '*httpbin.org*');

      // Rule 2001: global rule
      assert.equal(rules[1].id, 2001);
      assert.equal(rules[1].action.type, 'modifyHeaders');
      assert.deepEqual(rules[1].action.requestHeaders, [
        { header: 'X-App-Env', operation: 'set', value: 'testing' },
      ]);
      assert.equal(rules[1].condition.urlFilter, '*');
    });

    it('rejects forbidden transport headers and Sec-/Proxy- prefixes while allowing Cookie and Referer', async () => {
      const invalidHeaders = [
        { name: 'Connection', value: 'close' },
        { name: 'Content-Length', value: '500' },
        { name: 'Sec-Fetch-Mode', value: 'cors' },
        { name: 'Proxy-Authorization', value: 'Basic 123' },
      ];

      await context.updateHeaderModifySessionRules(invalidHeaders);

      const rules = await mockBrowser.declarativeNetRequest.getSessionRules();
      assert.equal(rules.length, 0, 'Forbidden headers should be rejected completely');

      const allowedHeaders = [
        { name: 'Cookie', value: 'sid=valid' },
        { name: 'Referer', value: 'https://example.com' },
      ];
      await context.updateHeaderModifySessionRules(allowedHeaders);

      const updatedRules = await mockBrowser.declarativeNetRequest.getSessionRules();
      assert.equal(updatedRules.length, 2, 'Cookie and Referer should be accepted');
    });
  });

  /* -------------------------------------------------------------------------
   * 7. Blocked Request Details Rendering
   * ------------------------------------------------------------------------- */
  describe('Blocked Request Details Rendering', () => {
    it('renders request metadata and notice when a request was blocked before headers were sent', () => {
      const detailsView = context.httpTrackerDetailsView;
      const initialRequest = {
        method: 'GET',
        url: 'https://github.githubassets.com/assets/ls-blocked.js',
        initiator: 'https://github.com',
      };
      const blockedResponse = {
        method: 'GET',
        url: 'https://github.githubassets.com/assets/ls-blocked.js',
        error: 'net::ERR_BLOCKED_BY_CLIENT',
      };

      detailsView.renderSelectedEventDetails({
        requestEvent: initialRequest,
        responseEvent: blockedResponse,
        requestBody: null,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });

      const reqHtml = domElements.get('request_headers_details_body')?.innerHTML || '';
      assert.ok(reqHtml.includes('https://github.githubassets.com/assets/ls-blocked.js'), 'Should display requested URL');
      assert.ok(reqHtml.includes('GET'), 'Should display HTTP method');
      assert.ok(reqHtml.includes('https://github.com'), 'Should display initiator');
      assert.ok(reqHtml.includes('Request blocked'), 'Should display blocked notice');
      assert.ok(
        reqHtml.includes('<tr><td class="web_event_detail_header_key"></td><td class="web_event_detail_header_value web_event_style_error">Request blocked</td></tr>'),
        'Notice should be positioned in the 2nd column of the details table'
      );

      const resHtml = domElements.get('response_headers_details_body')?.innerHTML || '';
      assert.ok(resHtml.includes('net::ERR_BLOCKED_BY_CLIENT'), 'Should display error code in response details');
      assert.ok(resHtml.includes('web_event_style_error">net::ERR_BLOCKED_BY_CLIENT'), 'Error code in response details should be styled with web_event_style_error');
    });
  });

  /* -------------------------------------------------------------------------
   * 8. RequestBody Browser Limitation & Error Handling
   * ------------------------------------------------------------------------- */
  describe('RequestBody Browser Limitation & Error Handling', () => {
    it('ignores requestBody property in metadata table and gracefully renders browser limitation error in Body section', () => {
      const detailsView = context.httpTrackerDetailsView;

      const rumRequest = {
        method: 'POST',
        url: 'https://api.github.com/_private/browser/rum?ddforward=...',
        initiator: 'https://github.com',
        requestBody: { error: 'Unknown error.' },
      };

      const rumRequestBody = {
        error: 'Unknown error.',
      };

      detailsView.renderSelectedEventDetails({
        requestEvent: rumRequest,
        responseEvent: null,
        requestBody: rumRequestBody,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });

      const reqHtml = domElements.get('request_headers_details_body')?.innerHTML || '';
      // Ensure requestBody is not dumped into the top metadata table
      assert.ok(!reqHtml.includes('<td class="web_event_detail_header_key">requestBody</td>'), 'requestBody key should not appear in metadata table');
      // Ensure graceful explanatory message appears in the Body section
      assert.ok(reqHtml.includes('Body unavailable from browser: Unknown error.'), 'Should render body unavailable explanation');
      assert.ok(reqHtml.includes('streaming, keepalive, or beacon'), 'Should mention common causes (streaming/keepalive/beacon)');
      assert.ok(reqHtml.includes('web_event_style_warning'), 'Should format body unavailable warning with web_event_style_warning class');
      assert.ok(reqHtml.includes('text-align: center'), 'Should center align body unavailable warning row');
    });
  });

  /* -------------------------------------------------------------------------
   * 9. Error Highlighting (4xx, 5xx, Network Errors) in Details View
   * ------------------------------------------------------------------------- */
  describe('Error Highlighting in Details View', () => {
    it('styles HTTP 4xx and 5xx status codes and status lines with web_event_style_error', () => {
      const detailsView = context.httpTrackerDetailsView;

      const error404Response = {
        method: 'GET',
        url: 'https://httpbin.org/status/404',
        statusCode: 404,
        statusLine: 'HTTP/1.1 404 Not Found',
      };

      detailsView.renderSelectedEventDetails({
        requestEvent: { method: 'GET', url: 'https://httpbin.org/status/404' },
        responseEvent: error404Response,
        requestBody: null,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });

      const resHtml = domElements.get('response_headers_details_body')?.innerHTML || '';
      assert.ok(resHtml.includes('web_event_style_error">404</td>'), 'statusCode 404 must have web_event_style_error');
      assert.ok(resHtml.includes('web_event_style_error">HTTP/1.1 404 Not Found</td>'), 'statusLine 404 must have web_event_style_error');

      // 200 OK should NOT have web_event_style_error
      const ok200Response = {
        method: 'GET',
        url: 'https://httpbin.org/status/200',
        statusCode: 200,
        statusLine: 'HTTP/1.1 200 OK',
      };

      detailsView.renderSelectedEventDetails({
        requestEvent: { method: 'GET', url: 'https://httpbin.org/status/200' },
        responseEvent: ok200Response,
        requestBody: null,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });

      const okResHtml = domElements.get('response_headers_details_body')?.innerHTML || '';
      assert.ok(!okResHtml.includes('web_event_style_error">200</td>'), 'statusCode 200 must NOT have web_event_style_error');
      assert.ok(!okResHtml.includes('web_event_style_error">HTTP/1.1 200 OK</td>'), 'statusLine 200 must NOT have web_event_style_error');
    });
  });

  /* -------------------------------------------------------------------------
   * 8. Details Container Visibility Toggling
   * ------------------------------------------------------------------------- */
  describe('Details Container Visibility Toggling', () => {
    it('sets display to block when rendering details and display to none when cleared', () => {
      const detailsView = context.httpTrackerDetailsView;
      const detailsContainer = domElements.get('web_details_selected_container');

      // Clear view hides container
      detailsView.clearDetailsView();
      assert.equal(detailsContainer.style.display, 'none');
      assert.equal(detailsContainer.style.visibility, 'hidden');

      // Render view shows container
      detailsView.renderSelectedEventDetails({
        requestEvent: { method: 'GET', url: 'https://httpbin.org/get' },
        responseEvent: null,
        requestBody: null,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });
      assert.equal(detailsContainer.style.display, 'block');
      assert.equal(detailsContainer.style.visibility, 'visible');

      // Clear view again hides container
      detailsView.clearDetailsView();
      assert.equal(detailsContainer.style.display, 'none');
      assert.equal(detailsContainer.style.visibility, 'hidden');
    });
  });

  /* -------------------------------------------------------------------------
   * 9. Request Body Multipart, File Upload, and Compressed Binary Rendering
   * ------------------------------------------------------------------------- */
  describe('Request Body Multipart, File Upload, and Compressed Binary Rendering', () => {
    it('renders multipart form fields data with multiple values correctly', () => {
      const detailsView = context.httpTrackerDetailsView;
      const formEvent = {
        formData: {
          username: ['alice'],
          permissions: ['read', 'write', 'admin'],
        },
      };

      detailsView.renderSelectedEventDetails({
        requestEvent: { method: 'POST', url: 'https://api.example.com/roles' },
        responseEvent: null,
        requestBody: formEvent,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });

      const reqHtml = domElements.get('request_headers_details_body')?.innerHTML || '';
      assert.ok(reqHtml.includes('Body (form fields data)'));
      assert.ok(reqHtml.includes('username'));
      assert.ok(reqHtml.includes('alice'));
      assert.ok(reqHtml.includes('permissions'));
      assert.ok(reqHtml.includes('read,write,admin'));
    });

    it('renders file upload attachment notices in request body', () => {
      const detailsView = context.httpTrackerDetailsView;
      const fileEvent = {
        raw: [
          { file: 'financial_report_2026.pdf' },
        ],
      };

      detailsView.renderSelectedEventDetails({
        requestEvent: { method: 'POST', url: 'https://upload.example.com/files' },
        responseEvent: null,
        requestBody: fileEvent,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });

      const reqHtml = domElements.get('request_headers_details_body')?.innerHTML || '';
      assert.ok(reqHtml.includes('[File upload: financial_report_2026.pdf]'));
    });

    it('detects gzip and deflate compressed binary payloads and renders diagnostic badge', () => {
      const detailsView = context.httpTrackerDetailsView;
      // Gzip magic header: 0x1f 0x8b
      const gzipBuffer = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]).buffer;
      const gzipEvent = {
        raw: [{ bytes: gzipBuffer }],
      };

      detailsView.renderSelectedEventDetails({
        requestEvent: { method: 'POST', url: 'https://api.example.com/binary' },
        responseEvent: null,
        requestBody: gzipEvent,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern: null,
      });

      const reqHtml = domElements.get('request_headers_details_body')?.innerHTML || '';
      assert.ok(reqHtml.includes('[Binary data \u2014 6 bytes, likely gzip. Cannot display compressed content.]'));
    });
  });

  /* -------------------------------------------------------------------------
   * 10. Details View Search Highlighting with <mark> Tags
   * ------------------------------------------------------------------------- */
  describe('Details View Search Highlighting with <mark> Tags', () => {
    it('wraps query matches inside header keys and values with <mark> tags', () => {
      const detailsView = context.httpTrackerDetailsView;
      const reqWithHeaders = {
        method: 'GET',
        url: 'https://api.example.com/v1/auth',
        requestHeaders: [
          { name: 'Authorization', value: 'Bearer token-12345' },
          { name: 'X-App-Env', value: 'production' },
        ],
      };

      const compiledFindPattern = new RegExp('auth|bearer', 'gi');

      detailsView.renderSelectedEventDetails({
        requestEvent: reqWithHeaders,
        responseEvent: null,
        requestBody: null,
        maskPatterns: [],
        isMaskEnabled: false,
        optimizeResponseCookies: false,
        compiledFindPattern,
      });

      const reqHtml = domElements.get('request_headers_details_body')?.innerHTML || '';
      assert.ok(reqHtml.includes('<mark>Auth</mark>orization'), 'Should wrap "Auth" substring in header name');
      assert.ok(reqHtml.includes('<mark>Bearer</mark>'), 'Should wrap "Bearer" in header value');
      assert.ok(!reqHtml.includes('<mark>production</mark>'), 'Should not wrap non-matching values');
    });
  });

  /* -------------------------------------------------------------------------
   * 11. Domain Cookie Deletion via deleteCookiesForSelectedDomain
   * ------------------------------------------------------------------------- */
  describe('Domain Cookie Deletion via deleteCookiesForSelectedDomain', () => {
    it('extracts domain from URL input, deletes matching cookies, and toggles button feedback', async () => {
      const detailsView = context.httpTrackerDetailsView;
      const inputEl = globalThis.document.getElementById('delete_cookies');
      const btnEl = globalThis.document.getElementById('delete_cookies_button');
      btnEl.textContent = 'Delete cookies';

      // Seed cookies in browser
      mockBrowser.cookies.stored = [
        { name: 'session_id', domain: 'api.github.com', path: '/' },
        { name: 'pref', domain: '.github.com', path: '/' },
        { name: 'unrelated', domain: 'google.com', path: '/' },
      ];
      mockBrowser.cookies.removed = [];

      inputEl.value = 'https://api.github.com/v1/user/repos';

      detailsView.deleteCookiesForSelectedDomain();
      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.equal(mockBrowser.cookies.removed.length, 2);
      assert.equal(mockBrowser.cookies.removed.some((c) => c.name === 'session_id'), true);
      assert.equal(mockBrowser.cookies.removed.some((c) => c.name === 'pref'), true);
      assert.equal(mockBrowser.cookies.removed.some((c) => c.name === 'unrelated'), false);
      assert.equal(btnEl.textContent, 'Deleted!');
    });
  });
});


