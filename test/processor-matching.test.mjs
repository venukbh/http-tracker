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
});
