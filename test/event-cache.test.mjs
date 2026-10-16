import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestContext } from './test-helpers.mjs';

describe('httpTrackerEventCache Unit Tests', () => {
  const { context } = createTestContext();
  const eventCache = context.httpTrackerEventCache;

  beforeEach(() => {
    eventCache.clearAll();
  });

  describe('Redirect Count & ID Enhancement', () => {
    it('sets initial redirect count to 0 without modifying requestIdEnhanced', () => {
      const event = { requestId: 'req-101', requestIdEnhanced: 'req-101' };
      eventCache.setRedirectCount(event);
      assert.equal(event.requestIdEnhanced, 'req-101');
    });

    it('enhances requestId on subsequent redirects', () => {
      const event1 = { requestId: 'req-102', requestIdEnhanced: 'req-102', ip: '1.2.3.4' };
      eventCache.setRedirectCount(event1);
      eventCache.handleRedirect(event1);

      const event2 = { requestId: 'req-102', requestIdEnhanced: 'req-102' };
      eventCache.setRedirectCount(event2);
      assert.equal(event2.requestIdEnhanced, 'req-102_1');
    });

    it('ignores onBeforeRedirect when IP is missing (Firefox bug workaround)', () => {
      const event = { requestId: 'req-103', requestIdEnhanced: 'req-103' };
      eventCache.setRedirectCount(event);
      eventCache.handleRedirect(event); // missing ip

      const nextEvent = { requestId: 'req-103', requestIdEnhanced: 'req-103' };
      eventCache.setRedirectCount(nextEvent);
      assert.equal(nextEvent.requestIdEnhanced, 'req-103');
    });
  });

  describe('Headers and Body Storage', () => {
    it('stores and retrieves request headers', () => {
      const req = { requestId: 'req-1', requestIdEnhanced: 'req-1', requestHeaders: [{ name: 'Host', value: 'example.com' }] };
      eventCache.insertRequestHeaders(req);
      assert.deepEqual(eventCache.getRequest('req-1'), req);
      assert.equal(eventCache.getRequest('nonexistent'), undefined);
    });

    it('stores and merges response headers preserving existing fields', () => {
      const resp1 = { requestIdEnhanced: 'req-2', responseHeaders: [{ name: 'Content-Type', value: 'text/html' }], statusCode: 200, statusLine: 'HTTP/1.1 200 OK' };
      eventCache.insertResponseHeaders(resp1);

      // Subsequent event (e.g. onErrorOccurred or onCompleted) without headers should not wipe previous headers
      const resp2 = { requestIdEnhanced: 'req-2', error: 'net::ERR_CONNECTION_RESET' };
      eventCache.insertResponseHeaders(resp2);

      const merged = eventCache.getResponse('req-2');
      assert.equal(merged.statusCode, 200);
      assert.equal(merged.statusLine, 'HTTP/1.1 200 OK');
      assert.equal(merged.error, 'net::ERR_CONNECTION_RESET');
      assert.equal(merged.responseHeaders.length, 1);
    });

    it('stores and retrieves request body', () => {
      const bodyEvent = { requestIdEnhanced: 'req-3', requestBody: { formData: { user: ['john'] } } };
      eventCache.insertRequestBody(bodyEvent);
      assert.deepEqual(eventCache.getRequestBody('req-3'), { formData: { user: ['john'] } });
    });

    it('tracks added event IDs with hasEvent and markEventAdded', () => {
      assert.equal(eventCache.hasEvent('req-4'), false);
      eventCache.markEventAdded('req-4');
      assert.equal(eventCache.hasEvent('req-4'), true);
    });
  });

  describe('recordEvent Dispatcher', () => {
    it('dispatches onBeforeRequest to insertRequestBody when captureFormData is true', () => {
      const event = { requestId: 'req-rec-1', requestIdEnhanced: 'req-rec-1', callerName: 'onBeforeRequest', requestBody: { raw: 'data' } };
      eventCache.recordEvent(event, true);
      assert.deepEqual(eventCache.getRequestBody('req-rec-1'), { raw: 'data' });
    });

    it('ignores onBeforeRequest body when captureFormData is false', () => {
      const event = { requestId: 'req-rec-2', requestIdEnhanced: 'req-rec-2', callerName: 'onBeforeRequest', requestBody: { raw: 'data' } };
      eventCache.recordEvent(event, false);
      assert.equal(eventCache.getRequestBody('req-rec-2'), undefined);
    });

    it('saves initial request metadata into getRequest on onBeforeRequest', () => {
      const event = {
        requestId: 'req-rec-blocked',
        requestIdEnhanced: 'req-rec-blocked',
        callerName: 'onBeforeRequest',
        method: 'GET',
        url: 'https://github.githubassets.com/assets/blocked.js',
        initiator: 'https://github.com',
        type: 'script',
      };
      eventCache.recordEvent(event, false);
      const req = eventCache.getRequest('req-rec-blocked');
      assert.equal(req.url, 'https://github.githubassets.com/assets/blocked.js');
      assert.equal(req.method, 'GET');
      assert.equal(req.initiator, 'https://github.com');
    });

    it('extracts request metadata on onErrorOccurred when onBeforeRequest was not received', () => {
      const errorEvent = {
        requestId: 'req-error-only',
        requestIdEnhanced: 'req-error-only',
        callerName: 'onErrorOccurred',
        error: 'net::ERR_BLOCKED_BY_CLIENT',
        method: 'GET',
        url: 'https://adtracker.example/track.js',
        initiator: 'https://example.com',
        type: 'script',
      };
      eventCache.recordEvent(errorEvent, false);
      const req = eventCache.getRequest('req-error-only');
      assert.equal(req.url, 'https://adtracker.example/track.js');
      assert.equal(req.method, 'GET');
      const res = eventCache.getResponse('req-error-only');
      assert.equal(res.error, 'net::ERR_BLOCKED_BY_CLIENT');
    });

    it('dispatches request header events to insertRequestHeaders', () => {
      const event = { requestId: 'req-rec-3', requestIdEnhanced: 'req-rec-3', callerName: 'onBeforeSendHeaders', requestHeaders: [{ name: 'User-Agent', value: 'Test' }] };
      eventCache.recordEvent(event, false);
      assert.deepEqual(eventCache.getRequest('req-rec-3'), event);
    });

    it('dispatches response header and completion events to insertResponseHeaders', () => {
      const event = { requestId: 'req-rec-4', requestIdEnhanced: 'req-rec-4', callerName: 'onHeadersReceived', responseHeaders: [{ name: 'Server', value: 'nginx' }], statusCode: 200 };
      eventCache.recordEvent(event, false);
      assert.deepEqual(eventCache.getResponse('req-rec-4'), event);
    });
  });

  describe('Cleanup and Removal', () => {
    it('removes entry by enhanced ID and raw ID', () => {
      eventCache.markEventAdded('req-5_1');
      eventCache.insertRequestHeaders({ requestIdEnhanced: 'req-5_1', requestHeaders: [] });
      eventCache.insertResponseHeaders({ requestIdEnhanced: 'req-5_1', statusCode: 200 });
      eventCache.insertRequestBody({ requestIdEnhanced: 'req-5_1', requestBody: { raw: [] } });

      assert.equal(eventCache.hasEvent('req-5_1'), true);
      eventCache.removeEntry('req-5_1', 'req-5');

      assert.equal(eventCache.hasEvent('req-5_1'), false);
      assert.equal(eventCache.getRequest('req-5_1'), undefined);
      assert.equal(eventCache.getResponse('req-5_1'), undefined);
      assert.equal(eventCache.getRequestBody('req-5_1'), undefined);
    });

    it('clears all entries from all collections on clearAll', () => {
      eventCache.markEventAdded('req-6');
      eventCache.insertRequestHeaders({ requestIdEnhanced: 'req-6', requestHeaders: [] });
      eventCache.insertResponseHeaders({ requestIdEnhanced: 'req-6', statusCode: 200 });

      eventCache.clearAll();

      assert.equal(eventCache.hasEvent('req-6'), false);
      assert.equal(eventCache.getRequest('req-6'), undefined);
      assert.equal(eventCache.getResponse('req-6'), undefined);
    });

    it('tracks deep multi-hop redirect chains and preserves non-removed hops when deleting a single hop', () => {
      const baseId = 'req-deep-redirect';
      // Hop 0
      const e0 = { requestId: baseId, requestIdEnhanced: baseId, ip: '1.1.1.1' };
      eventCache.setRedirectCount(e0);
      eventCache.insertInitialRequest({ requestIdEnhanced: baseId, url: 'https://site.com/0' });
      eventCache.handleRedirect(e0);

      // Hop 1
      const e1 = { requestId: baseId, requestIdEnhanced: baseId, ip: '1.1.1.1' };
      eventCache.setRedirectCount(e1);
      assert.equal(e1.requestIdEnhanced, `${baseId}_1`);
      eventCache.insertInitialRequest({ requestIdEnhanced: `${baseId}_1`, url: 'https://site.com/1' });
      eventCache.handleRedirect(e1);

      // Hop 2
      const e2 = { requestId: baseId, requestIdEnhanced: baseId, ip: '1.1.1.1' };
      eventCache.setRedirectCount(e2);
      assert.equal(e2.requestIdEnhanced, `${baseId}_2`);
      eventCache.insertInitialRequest({ requestIdEnhanced: `${baseId}_2`, url: 'https://site.com/2' });
      eventCache.handleRedirect(e2);

      // Hop 3 (final)
      const e3 = { requestId: baseId, requestIdEnhanced: baseId };
      eventCache.setRedirectCount(e3);
      assert.equal(e3.requestIdEnhanced, `${baseId}_3`);
      eventCache.insertInitialRequest({ requestIdEnhanced: `${baseId}_3`, url: 'https://site.com/3' });

      // Verify all 4 hops exist
      assert.equal(eventCache.getRequest(baseId)?.url, 'https://site.com/0');
      assert.equal(eventCache.getRequest(`${baseId}_1`)?.url, 'https://site.com/1');
      assert.equal(eventCache.getRequest(`${baseId}_2`)?.url, 'https://site.com/2');
      assert.equal(eventCache.getRequest(`${baseId}_3`)?.url, 'https://site.com/3');

      // Granular delete of Hop 2 should NOT delete Hop 1 or Hop 3
      eventCache.removeEntry(`${baseId}_2`, baseId);
      assert.equal(eventCache.getRequest(`${baseId}_2`), undefined);
      assert.equal(eventCache.getRequest(baseId)?.url, 'https://site.com/0');
      assert.equal(eventCache.getRequest(`${baseId}_1`)?.url, 'https://site.com/1');
      assert.equal(eventCache.getRequest(`${baseId}_3`)?.url, 'https://site.com/3');
    });

    it('safely handles null, undefined, or malformed events without throwing exceptions', () => {
      assert.doesNotThrow(() => {
        eventCache.recordEvent(null, false);
        eventCache.recordEvent(undefined, true);
        eventCache.recordEvent({}, false);
        eventCache.removeEntry(null, null);
        eventCache.removeEntry(undefined, undefined);
        eventCache.hasEvent(null);
        eventCache.getRequest(null);
        eventCache.getResponse(undefined);
      });
    });
  });
});
