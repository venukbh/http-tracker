import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProcessorContext } from './test-helpers.mjs';

describe('Redirect Pipeline Resiliency & Error Handling Tests (Alternative 2)', () => {
  it('maintains redirect counter across hops when first hop is excluded by an Include filter', async () => {
    const proc = createProcessorContext();
    const trackInput = proc.document.getElementById('track_urls_pattern');
    trackInput.value = 'mail.google';
    trackInput.oninput({ target: trackInput });

    // Wait for debounce delay
    await new Promise((r) => setTimeout(r, 550));

    // Hop 1: http://gmail.com (does not match "mail.google")
    proc.eventTracker.processWebEvent({
      callerName: 'onBeforeRequest',
      requestId: 'req-multi-filter',
      requestIdEnhanced: 'req-multi-filter',
      url: 'http://gmail.com/',
      method: 'GET',
    });
    proc.eventTracker.processWebEvent({
      callerName: 'onBeforeRedirect',
      requestId: 'req-multi-filter',
      requestIdEnhanced: 'req-multi-filter',
      url: 'http://gmail.com/',
      redirectUrl: 'https://mail.google.com/mail/u/0/',
      statusCode: 307,
    });

    // Hop 2: https://mail.google.com/mail/u/0/ (matches "mail.google")
    proc.eventTracker.processWebEvent({
      callerName: 'onBeforeRequest',
      requestId: 'req-multi-filter',
      requestIdEnhanced: 'req-multi-filter',
      url: 'https://mail.google.com/mail/u/0/',
      method: 'GET',
    });
    proc.eventTracker.processWebEvent({
      callerName: 'onCompleted',
      requestId: 'req-multi-filter',
      requestIdEnhanced: 'req-multi-filter',
      url: 'https://mail.google.com/mail/u/0/',
      statusCode: 200,
    });

    // Hop 1 is completely excluded/skipped from UI & cache
    assert.equal(proc.httpTrackerEventCache.hasEvent('req-multi-filter'), false);

    // Hop 2 is captured and receives enhanced ID req-multi-filter_1!
    assert.equal(proc.httpTrackerEventCache.hasEvent('req-multi-filter_1'), true);
    assert.equal(proc.httpTrackerEventCache.getRequest('req-multi-filter_1')?.url, 'https://mail.google.com/mail/u/0/');
    assert.equal(proc.httpTrackerEventCache.getResponse('req-multi-filter_1')?.statusCode, 200);
  });

  it('protects valid response status codes from being overwritten with ERR when net::ERR_ABORTED occurs', () => {
    const proc = createProcessorContext();

    proc.eventTracker.processWebEvent({
      callerName: 'onBeforeRequest',
      requestId: 'req-abort-test',
      requestIdEnhanced: 'req-abort-test',
      url: 'https://example.com/asset.js',
      method: 'GET',
    });
    proc.eventTracker.processWebEvent({
      callerName: 'onHeadersReceived',
      requestId: 'req-abort-test',
      requestIdEnhanced: 'req-abort-test',
      url: 'https://example.com/asset.js',
      statusCode: 200,
    });

    // Browser aborts stream (e.g. prefetch or navigation redirect cancellation)
    proc.eventTracker.processWebEvent({
      callerName: 'onErrorOccurred',
      requestId: 'req-abort-test',
      requestIdEnhanced: 'req-abort-test',
      url: 'https://example.com/asset.js',
      error: 'net::ERR_ABORTED',
    });

    const statusEl = proc.document.getElementById('web_event_status_req-abort-test');
    const rowEl = proc.document.getElementById('web_events_list_req-abort-test');

    // Status should remain 200, not ERR
    assert.equal(statusEl?.textContent, '200');
    // Row should not have error styling
    assert.equal(rowEl?.classList?.contains?.('web_event_style_error'), false);
    // Cached response headers should remain pristine without error field
    assert.equal(proc.httpTrackerEventCache.getResponse('req-abort-test')?.error, undefined);
    assert.equal(proc.httpTrackerEventCache.getResponse('req-abort-test')?.statusCode, 200);
  });

  it('pre-populates redirectUrl in allRequestHeaders and immediately renders next hop row on onBeforeRedirect', () => {
    const proc = createProcessorContext();

    proc.eventTracker.processWebEvent({
      callerName: 'onBeforeRequest',
      requestId: 'req-prepop',
      requestIdEnhanced: 'req-prepop',
      url: 'http://example.com/initial',
      method: 'GET',
    });
    proc.eventTracker.processWebEvent({
      callerName: 'onBeforeRedirect',
      requestId: 'req-prepop',
      requestIdEnhanced: 'req-prepop',
      url: 'http://example.com/initial',
      redirectUrl: 'https://example.com/destination',
      statusCode: 301,
    });

    // Hop 0 row exists with status 301
    const row0 = proc.document.getElementById('web_events_list_req-prepop');
    assert.ok(row0, 'Hop 0 row must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_url_req-prepop')?.textContent, 'http://example.com/initial');
    assert.equal(proc.document.getElementById('web_event_status_req-prepop')?.textContent, '301');

    // Hop 1 row is immediately created in DOM with target URL and status N/A
    const row1 = proc.document.getElementById('web_events_list_req-prepop_1');
    assert.ok(row1, 'Hop 1 row must be created immediately upon onBeforeRedirect');
    assert.equal(proc.document.getElementById('web_event_url_req-prepop_1')?.textContent, 'https://example.com/destination');
    assert.equal(proc.document.getElementById('web_event_status_req-prepop_1')?.textContent, 'N/A');

    // Next hop req-prepop_1 is pre-populated in event cache with target redirectUrl
    const nextReq = proc.httpTrackerEventCache.getRequest('req-prepop_1');
    assert.ok(nextReq, 'Target hop should be pre-created');
    assert.equal(nextReq.url, 'https://example.com/destination');
    assert.equal(nextReq.method, 'GET');
  });

  it('monitors actual network traffic when browser auto-upgrades navigation to HTTPS', () => {
    const proc = createProcessorContext();

    // 1. Chromium auto-upgrades navigation to HTTPS and delivers onBeforeRequest for https://example.org/
    proc.domEvents.forwardEvent('onBeforeRequest')({
      documentLifecycle: 'active',
      frameId: 0,
      frameType: 'outermost_frame',
      method: 'GET',
      parentFrameId: -1,
      requestId: '4019',
      tabId: 89877183,
      timeStamp: 1792938330659.576,
      type: 'main_frame',
      url: 'https://example.org/',
    });

    // 2. Verify that Row 4019 (https://example.org/) is present in DOM
    const row0 = proc.document.getElementById('web_events_list_4019');
    assert.ok(row0, 'Row 4019 (https://example.org/) must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_url_4019')?.textContent, 'https://example.org/');
    assert.equal(proc.document.getElementById('web_event_status_4019')?.textContent, 'N/A');

    // 3. Subsequent events for 4019 arrive: headers, response, completion (200 OK)
    proc.domEvents.forwardEvent('onBeforeSendHeaders')({
      documentLifecycle: 'active',
      frameId: 0,
      method: 'GET',
      parentFrameId: -1,
      requestId: '4019',
      tabId: 89877183,
      timeStamp: 1792938330662.068,
      type: 'main_frame',
      url: 'https://example.org/',
      requestHeaders: [{ name: 'User-Agent', value: 'Chrome' }],
    });

    proc.domEvents.forwardEvent('onHeadersReceived')({
      documentLifecycle: 'active',
      frameId: 0,
      method: 'GET',
      parentFrameId: -1,
      requestId: '4019',
      tabId: 89877183,
      timeStamp: 1792938330788.297,
      type: 'main_frame',
      url: 'https://example.org/',
      statusCode: 200,
      statusLine: 'HTTP/1.1 200',
    });

    proc.domEvents.forwardEvent('onCompleted')({
      documentLifecycle: 'active',
      frameId: 0,
      method: 'GET',
      parentFrameId: -1,
      requestId: '4019',
      tabId: 89877183,
      timeStamp: 1792938330792.731,
      type: 'main_frame',
      url: 'https://example.org/',
      statusCode: 200,
    });

    // 4. Verify status update on 4019
    assert.equal(proc.document.getElementById('web_event_status_4019')?.textContent, '200');

    // 5. Verify event cache entry
    const req = proc.httpTrackerEventCache.getRequest('4019');
    const res = proc.httpTrackerEventCache.getResponse('4019');
    assert.equal(req?.url, 'https://example.org/');
    assert.equal(res?.statusCode, 200);

    // 6. Next subresource request (4020) should have its own row without counter pollution
    proc.domEvents.forwardEvent('onBeforeRequest')({
      documentLifecycle: 'active',
      frameId: 0,
      method: 'GET',
      parentFrameId: -1,
      requestId: '4020',
      tabId: 89877183,
      timeStamp: 1792938330809.744,
      type: 'script',
      url: 'https://example.org/s.js',
    });
    proc.domEvents.forwardEvent('onCompleted')({
      documentLifecycle: 'active',
      frameId: 0,
      method: 'GET',
      parentFrameId: -1,
      requestId: '4020',
      tabId: 89877183,
      timeStamp: 1792938330846.727,
      type: 'script',
      url: 'https://example.org/s.js',
      statusCode: 200,
    });

    const rowSub = proc.document.getElementById('web_events_list_4020');
    assert.ok(rowSub, 'Subresource row 4020 must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_url_4020')?.textContent, 'https://example.org/s.js');
    assert.equal(proc.document.getElementById('web_event_status_4020')?.textContent, '200');
  });

  it('captures native HSTS 307 internal redirects with accurate redirect counter and DevTools parity (e.g. github.com)', () => {
    const proc = createProcessorContext();
    const tabId = 100;
    const timeStamp = 1000;

    // 1. Native webRequest fires onBeforeRequest for http://github.com/?ljk
    proc.domEvents.forwardEvent('onBeforeRequest')({
      callerName: 'onBeforeRequest',
      requestId: 'hsts-101',
      tabId,
      frameId: 0,
      parentFrameId: -1,
      type: 'main_frame',
      url: 'http://github.com/?ljk',
      method: 'GET',
      timeStamp: timeStamp + 10,
    });

    // 3. Native webRequest fires onBeforeRedirect (307 HSTS)
    proc.domEvents.forwardEvent('onBeforeRedirect')({
      callerName: 'onBeforeRedirect',
      requestId: 'hsts-101',
      tabId,
      frameId: 0,
      parentFrameId: -1,
      type: 'main_frame',
      url: 'http://github.com/?ljk',
      redirectUrl: 'https://github.com/?ljk',
      method: 'GET',
      statusCode: 307,
      statusLine: 'HTTP/1.1 307 Internal Redirect',
      responseHeaders: [
        { name: 'Location', value: 'https://github.com/?ljk' },
        { name: 'Non-Authoritative-Reason', value: 'HSTS' },
      ],
      timeStamp: timeStamp + 20,
    });

    // 4. Native webRequest fires onBeforeRequest for https://github.com/?ljk
    proc.domEvents.forwardEvent('onBeforeRequest')({
      callerName: 'onBeforeRequest',
      requestId: 'hsts-101',
      tabId,
      frameId: 0,
      parentFrameId: -1,
      type: 'main_frame',
      url: 'https://github.com/?ljk',
      method: 'GET',
      timeStamp: timeStamp + 30,
    });

    // 5. Native webRequest completes with 200 OK
    proc.domEvents.forwardEvent('onCompleted')({
      callerName: 'onCompleted',
      requestId: 'hsts-101',
      tabId,
      frameId: 0,
      parentFrameId: -1,
      type: 'main_frame',
      url: 'https://github.com/?ljk',
      method: 'GET',
      statusCode: 200,
      timeStamp: timeStamp + 50,
    });

    // VERIFICATION:
    // Exactly 2 rows must exist in DOM:
    // Row 0: http://github.com/?ljk (307 HSTS)
    // Row 1: https://github.com/?ljk (200 OK)
    // There must NOT be any duplicate Row 2 or synthetic "HttpsUpgrades" redirect!
    const urlsList = proc.document.getElementById('urls_list');
    assert.equal(urlsList.children.length, 2, 'Must contain exactly 2 rows in DOM');

    const row0 = urlsList.children.find(c => c.id === 'web_events_list_hsts-101');
    const row1 = urlsList.children.find(c => c.id === 'web_events_list_hsts-101_1');
    const row2 = urlsList.children.find(c => c.id === 'web_events_list_hsts-101_2');

    assert.ok(row0, 'Hop 0 row (http://github.com/) must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_status_hsts-101')?.textContent, '307');
    assert.equal(proc.httpTrackerEventCache.getResponse('hsts-101')?.responseHeaders?.some(h => h.value === 'HSTS'), true);

    assert.ok(row1, 'Hop 1 row (https://github.com/) must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_status_hsts-101_1')?.textContent, '200');

    assert.equal(row2, undefined, 'Must NOT create a duplicate 2nd redirect row (hsts-101_2) in DOM!');
    assert.equal(proc.httpTrackerEventCache.hasEvent('hsts-101_2'), false, 'Must NOT have event hsts-101_2 in cache');
  });

  it('normalizes Firefox native HSTS upgrades (statusCode: 0) to 307 Internal with DevTools parity', () => {
    const proc = createProcessorContext();
    const tabId = 202;
    const timeStamp = 2000;

    // 1. Firefox native webRequest fires onBeforeRequest for http://github.com/
    proc.domEvents.forwardEvent('onBeforeRequest')({
      callerName: 'onBeforeRequest',
      requestId: 'ff-hsts-501',
      tabId,
      frameId: 0,
      parentFrameId: -1,
      type: 'main_frame',
      url: 'http://github.com/',
      method: 'GET',
      timeStamp: timeStamp + 10,
    });

    // 2. Firefox native webRequest fires onBeforeRedirect with statusCode: 0 and statusLine: ""
    proc.domEvents.forwardEvent('onBeforeRedirect')({
      callerName: 'onBeforeRedirect',
      requestId: 'ff-hsts-501',
      tabId,
      frameId: 0,
      parentFrameId: -1,
      type: 'main_frame',
      url: 'http://github.com/',
      redirectUrl: 'https://github.com/',
      method: 'GET',
      statusCode: 0,
      statusLine: '',
      fromCache: false,
      timeStamp: timeStamp + 20,
    });

    // 3. Firefox native webRequest fires onBeforeRequest for https://github.com/
    proc.domEvents.forwardEvent('onBeforeRequest')({
      callerName: 'onBeforeRequest',
      requestId: 'ff-hsts-501',
      tabId,
      frameId: 0,
      parentFrameId: -1,
      type: 'main_frame',
      url: 'https://github.com/',
      method: 'GET',
      timeStamp: timeStamp + 30,
    });

    // 4. Firefox completes with 200 OK
    proc.domEvents.forwardEvent('onCompleted')({
      callerName: 'onCompleted',
      requestId: 'ff-hsts-501',
      tabId,
      frameId: 0,
      parentFrameId: -1,
      type: 'main_frame',
      url: 'https://github.com/',
      method: 'GET',
      statusCode: 200,
      timeStamp: timeStamp + 50,
    });

    // VERIFICATION:
    // Hop 0 row (http://github.com/) must display 307 and Cache: Internal (NOT N/A or false)
    const row0 = proc.document.getElementById('web_events_list_ff-hsts-501');
    assert.ok(row0, 'Hop 0 row (http://github.com/) must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_status_ff-hsts-501')?.textContent, '307');
    assert.equal(proc.document.getElementById('web_event_cache_ff-hsts-501')?.textContent, 'Internal');

    // Cached response must have normalized 307 status
    const cachedResponse = proc.httpTrackerEventCache.getResponse('ff-hsts-501');
    assert.equal(cachedResponse?.statusCode, 307);
    assert.equal(cachedResponse?.statusLine, 'HTTP/1.1 307 Internal Redirect (HSTS)');
    assert.equal(cachedResponse?.fromCache, 'Internal');

    // Hop 1 row (https://github.com/) must display 200 OK
    const row1 = proc.document.getElementById('web_events_list_ff-hsts-501_1');
    assert.ok(row1, 'Hop 1 row (https://github.com/) must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_status_ff-hsts-501_1')?.textContent, '200');
  });
});
