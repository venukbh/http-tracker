import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './test-helpers.mjs';

describe('cURL Command Generation & Copy Feature Unit Tests', () => {
  const { context } = createTestContext();
  const { generateCurlCommand, extractCurlRequestBody } = context;

  describe('generateCurlCommand input handling & edge cases', () => {
    it('returns empty string when requestEvent is null or undefined', () => {
      assert.equal(generateCurlCommand(null), '');
      assert.equal(generateCurlCommand(undefined), '');
    });

    it('returns empty string when requestEvent has no url', () => {
      assert.equal(generateCurlCommand({}), '');
      assert.equal(generateCurlCommand({ method: 'GET' }), '');
      assert.equal(generateCurlCommand({ url: '' }), '');
    });
  });

  describe('GET Requests & Headers formatting', () => {
    it('formats a simple GET request with single quotes around URL and no -X GET flag', () => {
      const req = {
        method: 'GET',
        url: 'https://api.example.com/v1/users',
      };
      const result = generateCurlCommand(req);
      assert.equal(result, "curl 'https://api.example.com/v1/users'");
    });

    it('formats a GET request with multiple headers', () => {
      const req = {
        method: 'GET',
        url: 'https://api.example.com/v1/users',
        requestHeaders: [
          { name: 'Accept', value: 'application/json' },
          { name: 'User-Agent', value: 'Mozilla/5.0' },
          { name: 'Authorization', value: 'Bearer test-token-123' },
        ],
      };
      const result = generateCurlCommand(req);
      const expected = [
        "curl 'https://api.example.com/v1/users'",
        "-H 'Accept: application/json'",
        "-H 'User-Agent: Mozilla/5.0'",
        "-H 'Authorization: Bearer test-token-123'",
      ].join(' \\\n  ');
      assert.equal(result, expected);
    });

    it('excludes HTTP/2 and HTTP/3 pseudo-headers (:method, :path, :authority, :scheme)', () => {
      const req = {
        method: 'GET',
        url: 'https://api.example.com/v1/items',
        requestHeaders: [
          { name: ':method', value: 'GET' },
          { name: ':path', value: '/v1/items' },
          { name: ':authority', value: 'api.example.com' },
          { name: ':scheme', value: 'https' },
          { name: 'Accept', value: 'application/json' },
        ],
      };
      const result = generateCurlCommand(req);
      assert.ok(!result.includes(':method'));
      assert.ok(!result.includes(':path'));
      assert.ok(!result.includes(':authority'));
      assert.ok(!result.includes(':scheme'));
      assert.ok(result.includes("-H 'Accept: application/json'"));
    });

    it('excludes Content-Length header so cURL computes length automatically', () => {
      const req = {
        method: 'POST',
        url: 'https://api.example.com/v1/items',
        requestHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Content-Length', value: '42' },
          { name: 'content-length', value: '42' },
        ],
      };
      const result = generateCurlCommand(req);
      assert.ok(!result.toLowerCase().includes('content-length'));
      assert.ok(result.includes("-H 'Content-Type: application/json'"));
    });

    it('adds --compressed flag when Accept-Encoding is present', () => {
      const req = {
        method: 'GET',
        url: 'https://api.example.com/v1/feed',
        requestHeaders: [
          { name: 'Accept-Encoding', value: 'gzip, deflate, br' },
          { name: 'Accept', value: '*/*' },
        ],
      };
      const result = generateCurlCommand(req);
      assert.ok(result.includes('--compressed'));
      assert.ok(result.includes("-H 'Accept-Encoding: gzip, deflate, br'"));
    });
  });

  describe('POSIX Shell Single-Quote Escaping', () => {
    it('safely escapes single quotes in URLs', () => {
      const req = {
        method: 'GET',
        url: "https://example.com/search?q=alice's%20books",
      };
      const result = generateCurlCommand(req);
      assert.equal(result, "curl 'https://example.com/search?q=alice'\\''s%20books'");
    });

    it('safely escapes single quotes in header values and names', () => {
      const req = {
        method: 'GET',
        url: 'https://example.com/test',
        requestHeaders: [
          { name: 'X-Message', value: "don't fail" },
        ],
      };
      const result = generateCurlCommand(req);
      assert.ok(result.includes("-H 'X-Message: don'\\''t fail'"));
    });

    it('safely escapes single quotes in request payloads', () => {
      const req = {
        method: 'POST',
        url: 'https://example.com/api',
      };
      const body = {
        raw: [{ bytes: new TextEncoder().encode('{"comment": "it\'s great"}') }],
      };
      const result = generateCurlCommand(req, body);
      assert.ok(result.includes("--data-raw '{\"comment\": \"it'\\''s great\"}'"));
    });
  });

  describe('Non-GET HTTP Methods', () => {
    it('adds -X POST for POST requests without body', () => {
      const req = {
        method: 'POST',
        url: 'https://example.com/action',
      };
      const result = generateCurlCommand(req);
      assert.equal(result, "curl 'https://example.com/action' \\\n  -X POST");
    });

    it('supports PUT, DELETE, PATCH, OPTIONS, and HEAD methods', () => {
      for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) {
        const req = {
          method,
          url: 'https://example.com/resource/1',
        };
        const result = generateCurlCommand(req);
        assert.ok(result.includes(`-X ${method}`), `Expected -X ${method}`);
      }
    });

    it('normalizes lowercase method names to uppercase', () => {
      const req = {
        method: 'delete',
        url: 'https://example.com/resource/1',
      };
      const result = generateCurlCommand(req);
      assert.ok(result.includes('-X DELETE'));
    });
  });

  describe('extractCurlRequestBody & Body Payload Formatting', () => {
    it('formats URL-encoded form data from formData object', () => {
      const req = {
        method: 'POST',
        url: 'https://example.com/login',
        requestHeaders: [
          { name: 'Content-Type', value: 'application/x-www-form-urlencoded' },
        ],
      };
      const body = {
        formData: {
          username: ['alice'],
          password: ['secret&pass=123'],
        },
      };
      const result = generateCurlCommand(req, body);
      assert.ok(result.includes("-X POST"));
      assert.ok(result.includes("--data-raw 'username=alice&password=secret%26pass%3D123'"));
    });

    it('formats raw JSON payloads from ArrayBuffer bytes', () => {
      const json = JSON.stringify({ query: 'search', page: 1 });
      const req = {
        method: 'POST',
        url: 'https://example.com/api/graphql',
        requestHeaders: [
          { name: 'Content-Type', value: 'application/json' },
        ],
      };
      const body = {
        raw: [{ bytes: new TextEncoder().encode(json) }],
      };
      const result = generateCurlCommand(req, body);
      assert.ok(result.includes(`--data-raw '${json}'`));
    });

    it('formats file uploads as --data-binary @<file>', () => {
      const req = {
        method: 'POST',
        url: 'https://example.com/upload',
      };
      const body = {
        raw: [{ file: '/tmp/upload.jpg' }],
      };
      const result = generateCurlCommand(req, body);
      assert.ok(result.includes("--data-binary '@/tmp/upload.jpg'"));
    });

    it('formats binary buffers with binary placeholder', () => {
      const binaryBytes = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const req = {
        method: 'POST',
        url: 'https://example.com/binary-stream',
      };
      const body = {
        raw: [{ bytes: binaryBytes.buffer }],
      };
      const result = generateCurlCommand(req, body);
      assert.ok(result.includes("--data-binary '[binary data]'"));
    });

    it('handles string body directly', () => {
      const req = {
        method: 'POST',
        url: 'https://example.com/echo',
      };
      const result = generateCurlCommand(req, 'plain text body');
      assert.ok(result.includes("--data-raw 'plain text body'"));
    });

    it('ignores empty body or error notices', () => {
      const req = {
        method: 'GET',
        url: 'https://example.com/stream',
      };
      const body = {
        error: 'Body unavailable from browser: Unknown error.',
      };
      const result = generateCurlCommand(req, body);
      assert.ok(!result.includes('--data'));
    });
  });

  describe('Headers with Cookie Support', () => {
    it('properly outputs Cookie header as standard -H flag', () => {
      const req = {
        method: 'GET',
        url: 'https://example.com/profile',
        requestHeaders: [
          { name: 'Cookie', value: 'session_id=s91823; user_pref=dark' },
        ],
      };
      const result = generateCurlCommand(req);
      assert.ok(result.includes("-H 'Cookie: session_id=s91823; user_pref=dark'"));
    });
  });
});
