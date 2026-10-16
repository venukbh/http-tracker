import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './test-helpers.mjs';

describe('httpTrackerUtils Unit Tests', () => {
  const { context } = createTestContext();

  describe('stringToArray', () => {
    it('splits comma-separated strings and trims tokens', () => {
      const result = context.stringToArray(' foo , bar,  baz ');
      assert.deepEqual(result, ['foo', 'bar', 'baz']);
    });

    it('filters out empty tokens', () => {
      const result = context.stringToArray('foo,, ,bar,');
      assert.deepEqual(result, ['foo', 'bar']);
    });

    it('supports custom delimiter', () => {
      const result = context.stringToArray('a|b|c', '|');
      assert.deepEqual(result, ['a', 'b', 'c']);
    });

    it('returns undefined for empty, whitespace, null, or undefined strings', () => {
      assert.equal(context.stringToArray(''), undefined);
      assert.equal(context.stringToArray('   '), undefined);
      assert.equal(context.stringToArray(null), undefined);
      assert.equal(context.stringToArray(undefined), undefined);
    });
  });

  describe('arrayToString', () => {
    it('joins array elements with default delimiter ", "', () => {
      assert.equal(context.arrayToString(['apple', 'banana']), 'apple, banana');
    });

    it('joins array elements with custom delimiter', () => {
      assert.equal(context.arrayToString(['x', 'y', 'z'], ' | '), 'x | y | z');
    });

    it('returns input directly if already a string', () => {
      assert.equal(context.arrayToString('raw string'), 'raw string');
    });

    it('returns empty string for null, undefined, or non-arrays', () => {
      assert.equal(context.arrayToString(null), '');
      assert.equal(context.arrayToString(undefined), '');
      assert.equal(context.arrayToString(123), '');
    });
  });

  describe('normalizePatterns', () => {
    it('returns array as-is if already an array', () => {
      const arr = ['google', 'github'];
      assert.deepEqual(context.normalizePatterns(arr), arr);
    });

    it('splits comma-separated string into an array of clean patterns', () => {
      assert.deepEqual(context.normalizePatterns(' google , github '), ['google', 'github']);
    });

    it('returns empty array for empty, whitespace, null, undefined, or invalid inputs', () => {
      assert.deepEqual(context.normalizePatterns(''), []);
      assert.deepEqual(context.normalizePatterns('   '), []);
      assert.deepEqual(context.normalizePatterns(null), []);
      assert.deepEqual(context.normalizePatterns(undefined), []);
      assert.deepEqual(context.normalizePatterns({}), []);
    });
  });

  describe('filterWithLength', () => {
    it('filters strings exceeding specified length', () => {
      const input = ['a', 'ab', 'abc', 'abcd'];
      assert.deepEqual(context.filterWithLength(input, 2), ['abc', 'abcd']);
    });

    it('filters non-empty strings by default (length = 0)', () => {
      const input = ['', 'a', ''];
      assert.deepEqual(context.filterWithLength(input), ['a']);
    });

    it('returns empty array if input is null or undefined', () => {
      assert.deepEqual(context.filterWithLength(null), []);
      assert.deepEqual(context.filterWithLength(undefined), []);
    });
  });

  describe('uniqueArray', () => {
    it('deduplicates items while preserving first occurrence order', () => {
      assert.deepEqual(context.uniqueArray(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
    });

    it('returns empty array for null, undefined, or empty arrays', () => {
      assert.deepEqual(context.uniqueArray([]), []);
      assert.deepEqual(context.uniqueArray(null), []);
      assert.deepEqual(context.uniqueArray(undefined), []);
    });
  });

  describe('sortArray', () => {
    it('sorts symbols before digits before alphabets case-insensitively', () => {
      const items = ['beta', '1digit', '_symbol', 'Alpha', '2digit', '!excl'];
      items.sort(context.sortArray);
      assert.deepEqual(items, ['_symbol', '!excl', '1digit', '2digit', 'Alpha', 'beta']);
    });

    it('sorts alphabetically when categories match', () => {
      const items = ['zebra', 'apple', 'mango'];
      items.sort(context.sortArray);
      assert.deepEqual(items, ['apple', 'mango', 'zebra']);
    });
  });

  describe('sortMapByKey', () => {
    it('sorts Map entries alphabetically by key', () => {
      const map = new Map([
        ['zebra', 1],
        ['apple', 2],
        ['mango', 3],
      ]);
      const sorted = context.sortMapByKey(map);
      assert.deepEqual([...sorted.keys()], ['apple', 'mango', 'zebra']);
    });
  });

  describe('sortJsonByProperty', () => {
    it('sorts array of objects by named string property', () => {
      const list = [
        { name: 'Host', value: 'google.com' },
        { name: 'Accept', value: 'text/html' },
        { name: 'Connection', value: 'keep-alive' },
      ];
      const sorted = context.sortJsonByProperty(list, 'name');
      assert.deepEqual(
        sorted.map((h) => h.name),
        ['Accept', 'Connection', 'Host']
      );
    });
  });

  describe('escapeHtml', () => {
    it('escapes &, <, >, ", and single quote', () => {
      const input = '<div class="alert" data-val=\'test\'>Rock & Roll</div>';
      const expected = '&lt;div class=&quot;alert&quot; data-val=&#039;test&#039;&gt;Rock &amp; Roll&lt;/div&gt;';
      assert.equal(context.escapeHtml(input), expected);
    });

    it('handles numeric and boolean values converted to string', () => {
      assert.equal(context.escapeHtml(42), '42');
      assert.equal(context.escapeHtml(true), 'true');
    });
  });

  describe('getReadableDate', () => {
    it('formats timestamp as MM/DD HH:mm:ss with zero-padding', () => {
      // 2026-03-05 08:07:09 UTC
      const date = new Date(2026, 2, 5, 8, 7, 9);
      const formatted = context.getReadableDate(date.getTime());
      assert.equal(formatted, '03/05 08:07:09');
    });
  });

  describe('isBinaryData', () => {
    it('identifies printable UTF-8 text as non-binary', () => {
      assert.equal(context.isBinaryData('Hello World! 123 \n\t\r regular text'), false);
    });

    it('identifies strings with high density of control / null characters as binary', () => {
      const binarySample = String.fromCharCode(0, 1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16);
      assert.equal(context.isBinaryData(binarySample), true);
    });
  });

  describe('detectCompressionType', () => {
    it('detects gzip magic bytes 0x1f 0x8b', () => {
      const buffer = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]).buffer;
      const view = new DataView(buffer);
      assert.equal(context.detectCompressionType(view), 'gzip');
    });

    it('detects deflate magic bytes 0x78 0x9c', () => {
      const buffer = new Uint8Array([0x78, 0x9c, 0x01, 0x02]).buffer;
      const view = new DataView(buffer);
      assert.equal(context.detectCompressionType(view), 'deflate');
    });

    it('detects zstd magic bytes 0xfd 0x2f 0xb5 0x2f', () => {
      const buffer = new Uint8Array([0xfd, 0x2f, 0xb5, 0x2f]).buffer;
      const view = new DataView(buffer);
      assert.equal(context.detectCompressionType(view), 'zstd');
    });

    it('detects lz4 magic bytes 0x04 0x22 0x4d 0x18', () => {
      const buffer = new Uint8Array([0x04, 0x22, 0x4d, 0x18]).buffer;
      const view = new DataView(buffer);
      assert.equal(context.detectCompressionType(view), 'lz4');
    });

    it('returns "binary" for length < 2', () => {
      const buffer = new Uint8Array([0x01]).buffer;
      const view = new DataView(buffer);
      assert.equal(context.detectCompressionType(view), 'binary');
    });

    it('returns "compressed or binary" for unrecognized header', () => {
      const buffer = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]).buffer;
      const view = new DataView(buffer);
      assert.equal(context.detectCompressionType(view), 'compressed or binary');
    });
  });

  describe('getCookieNameValue', () => {
    it('parses cookie name, value, domain, and path', () => {
      const raw = 'session_id=xyz123; Domain=example.com; Path=/api; Secure';
      const parsed = context.getCookieNameValue(raw);
      assert.equal(parsed.cookieName, 'session_id');
      assert.equal(parsed.domain, 'example.com');
      assert.equal(parsed.path, '/api');
    });

    it('handles cookie with no extra attributes', () => {
      const parsed = context.getCookieNameValue('user=john');
      assert.equal(parsed.cookieName, 'user');
      assert.equal(parsed.cookieValue, 'john');
    });

    it('handles cookies with multiple equal signs in the value', () => {
      const parsed = context.getCookieNameValue('jwt=eyJhbGciOi===; Domain=auth.io; Path=/');
      assert.equal(parsed.cookieName, 'jwt');
      assert.equal(parsed.cookieValue.startsWith('eyJhbGciOi==='), true);
      assert.equal(parsed.domain, 'auth.io');
    });

    it('handles malformed cookies without equal signs gracefully', () => {
      const parsed = context.getCookieNameValue('malformed_cookie_no_equals');
      assert.deepEqual(parsed, {});
    });
  });

  describe('removeCookies', () => {
    it('normalizes domain, prepends slash to path, and calls cookies.remove', async () => {
      const { context: localCtx, mockBrowser } = createTestContext();
      localCtx.removeCookies([
        {
          name: 'auth',
          domain: '.sub.example.com',
          path: 'dashboard',
          secure: true,
          storeId: 'store_1',
          partitionKey: { topLevelSite: 'https://example.com' },
        },
      ]);
      // Allow microtask to process
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(mockBrowser.cookies.removed.length, 1);
      const removed = mockBrowser.cookies.removed[0];
      assert.equal(removed.url, 'https://sub.example.com/dashboard');
      assert.equal(removed.name, 'auth');
      assert.equal(removed.storeId, 'store_1');
      assert.deepEqual(removed.partitionKey, { topLevelSite: 'https://example.com' });
    });

    it('handles null, undefined, or empty cookie arrays gracefully', () => {
      const { context: localCtx } = createTestContext();
      assert.doesNotThrow(() => {
        localCtx.removeCookies(null);
        localCtx.removeCookies(undefined);
        localCtx.removeCookies([]);
      });
    });
  });

  describe('debounce', () => {
    it('debounces rapid calls and executes only the last call', async () => {
      let callCount = 0;
      let lastArg = null;
      const fn = context.debounce((val) => {
        callCount++;
        lastArg = val;
      }, 50);

      fn(1);
      fn(2);
      fn(3);

      assert.equal(callCount, 0);
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(callCount, 1);
      assert.equal(lastArg, 3);
    });
  });
});
