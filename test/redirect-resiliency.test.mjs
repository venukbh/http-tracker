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

  it('captures automatic HTTPS upgrades (e.g. http://example.org -> https://example.org 307) matching DevTools network stack', () => {
    const proc = createProcessorContext();

    // 1. User navigates in tab 89877183 to http://example.org/
    proc.domEvents.recordPendingNavigation(89877183, 'http://example.org/', 1792938330650);

    // 2. Chromium automatically upgrades navigation to HTTPS and delivers onBeforeRequest for https://example.org/
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

    // 3. Verify that Hop 0 row (http://example.org/) is present with status 307 Internal Redirect and Cache column as Internal
    const row0 = proc.document.getElementById('web_events_list_4019');
    assert.ok(row0, 'Hop 0 row (http://example.org/) must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_url_4019')?.textContent, 'http://example.org/');
    assert.equal(proc.document.getElementById('web_event_status_4019')?.textContent, '307');
    assert.equal(proc.document.getElementById('web_event_method_4019')?.textContent, 'GET');
    assert.equal(proc.document.getElementById('web_event_cache_4019')?.textContent, 'Internal');

    // 4. Verify that Hop 1 row (https://example.org/) is present in DOM
    const row1 = proc.document.getElementById('web_events_list_4019_1');
    assert.ok(row1, 'Hop 1 row (https://example.org/) must exist in DOM');
    assert.equal(proc.document.getElementById('web_event_url_4019_1')?.textContent, 'https://example.org/');
    assert.equal(proc.document.getElementById('web_event_status_4019_1')?.textContent, 'N/A');

    // 5. Subsequent events for 4019 arrive: headers, response, completion (200 OK)
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

    // 6. Verify status update on Hop 1
    assert.equal(proc.document.getElementById('web_event_status_4019_1')?.textContent, '200');

    // 7. Verify event cache entries
    const hop0Req = proc.httpTrackerEventCache.getRequest('4019');
    const hop0Res = proc.httpTrackerEventCache.getResponse('4019');
    assert.equal(hop0Req?.url, 'http://example.org/');
    assert.equal(hop0Res?.statusCode, 307);
    assert.equal(hop0Res?.statusLine, 'HTTP/1.1 307 Internal Redirect');
    assert.equal(hop0Res?.redirectUrl, 'https://example.org/');
    assert.equal(hop0Res?.fromCache, 'Internal');

    const hop1Req = proc.httpTrackerEventCache.getRequest('4019_1');
    const hop1Res = proc.httpTrackerEventCache.getResponse('4019_1');
    assert.equal(hop1Req?.url, 'https://example.org/');
    assert.equal(hop1Res?.statusCode, 200);

    // 8. Next subresource request (4020) should have its own row without counter pollution
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
});
