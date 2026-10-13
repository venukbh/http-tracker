import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './test-helpers.mjs';

describe('Processor Matching & Filtering Logic Unit Tests', () => {
  const { context } = createTestContext();

  describe('Sequential AND (&) vs OR (|) Filter Matching Algorithm', () => {
    // Exact algorithm from matchesFilter(text) in httpTrackerProcessor.js
    function matchesFilter(text, patterns, isAND) {
      if (!patterns || patterns.length === 0) {
        return true;
      }
      const str = (text || '').toString().toLowerCase();
      if (!isAND) {
        return patterns.some((v) => str.includes(v.toLowerCase()));
      }
      let index = 0;
      for (const pattern of patterns) {
        index = str.indexOf(pattern.toLowerCase(), index);
        if (index === -1) {
          return false;
        }
        index += pattern.length;
      }
      return true;
    }

    it('matches any pattern when in OR mode', () => {
      const patterns = ['google', 'yahoo'];
      assert.equal(matchesFilter('https://google.com/search', patterns, false), true);
      assert.equal(matchesFilter('https://yahoo.com/news', patterns, false), true);
      assert.equal(matchesFilter('https://bing.com/search', patterns, false), false);
    });

    it('matches sequential patterns in order when in AND mode', () => {
      const patterns = ['api', 'v1', 'users'];
      assert.equal(matchesFilter('https://api.example.com/v1/users', patterns, true), true);
      // Fails when order is reversed
      assert.equal(matchesFilter('https://users.example.com/v1/api', patterns, true), false);
      // Fails when one token is missing
      assert.equal(matchesFilter('https://api.example.com/v2/users', patterns, true), false);
    });

    it('handles empty input or empty patterns list gracefully', () => {
      assert.equal(matchesFilter('anything', [], false), true);
      assert.equal(matchesFilter('', ['token'], false), false);
      assert.equal(matchesFilter(null, ['token'], false), false);
    });
  });

  describe('Mask Value Algorithm', () => {
    // Exact algorithm from maskValue(key, value) in httpTrackerProcessor.js
    function maskValue(key, value, maskPatterns, isEnabled) {
      if (!isEnabled || !key) {
        return value;
      }
      const target = key.toString().toLowerCase();
      const isMatched = maskPatterns.some((p) => target.includes(p.toLowerCase()));
      if (isMatched) {
        const str = value?.toString().trim() ?? '';
        if (str.length > 2) {
          return str.charAt(0) + '*****' + str.charAt(str.length - 1);
        }
        if (str.length > 0) {
          return '*****';
        }
      }
      return value;
    }

    const patterns = ['authorization', 'secret', 'token', 'password'];

    it('masks secrets longer than 2 characters preserving only first and last characters', () => {
      assert.equal(maskValue('Authorization', 'Bearer 12345678', patterns, true), 'B*****8');
      assert.equal(maskValue('auth_token', 'supersecret', patterns, true), 's*****t');
      assert.equal(maskValue('user_password', 'p@ssw0rd!', patterns, true), 'p*****!');
    });

    it('masks 1-char and 2-char secrets with five asterisks', () => {
      assert.equal(maskValue('secret_pin', 'ab', patterns, true), '*****');
      assert.equal(maskValue('secret_digit', '7', patterns, true), '*****');
    });

    it('does not mask unlisted keys', () => {
      assert.equal(maskValue('Content-Type', 'application/json', patterns, true), 'application/json');
      assert.equal(maskValue('Host', 'example.com', patterns, true), 'example.com');
    });

    it('does not mask when masking is disabled', () => {
      assert.equal(maskValue('Authorization', 'Bearer 12345', patterns, false), 'Bearer 12345');
    });
  });

  describe('Find-in-Details HTML Highlight Algorithm (addMarkTag)', () => {
    // Exact algorithm from addMarkTag in httpTrackerProcessor.js
    function addMarkTag(text, regex) {
      if (text === null || text === undefined) {
        return '';
      }
      const str = String(text);
      if (!regex) {
        return context.escapeHtml(str);
      }
      regex.lastIndex = 0;
      let result = '';
      let lastIndex = 0;
      let match = regex.exec(str);
      while (match !== null) {
        if (match[0].length === 0) {
          regex.lastIndex++;
          if (match.index >= str.length) {
            break;
          }
          match = regex.exec(str);
          continue;
        }
        result += context.escapeHtml(str.slice(lastIndex, match.index));
        result += `<mark>${context.escapeHtml(match[0])}</mark>`;
        lastIndex = match.index + match[0].length;
        match = regex.exec(str);
      }
      result += context.escapeHtml(str.slice(lastIndex));
      return result;
    }

    it('wraps matches in <mark> tags without double-escaping', () => {
      const regex = new RegExp('Bearer', 'gi');
      const input = 'Authorization: Bearer <token_xyz>';
      const output = addMarkTag(input, regex);
      assert.equal(output, 'Authorization: <mark>Bearer</mark> &lt;token_xyz&gt;');
    });

    it('escapes special HTML characters in both matched and non-matched segments', () => {
      const regex = new RegExp('<script>', 'gi');
      const input = 'Attack: <script>alert(1)</script>';
      const output = addMarkTag(input, regex);
      assert.equal(output, 'Attack: <mark>&lt;script&gt;</mark>alert(1)&lt;/script&gt;');
    });

    it('returns escaped string when regex is null or empty', () => {
      const input = '<b>Bold & Beautiful</b>';
      assert.equal(addMarkTag(input, null), '&lt;b&gt;Bold &amp; Beautiful&lt;/b&gt;');
    });
  });
});
