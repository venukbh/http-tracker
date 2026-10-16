import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { runDomEventsInBrowser, createTestContext } from './test-helpers.mjs';

describe('Cross-Browser Compatibility & Packaging Tests (Chrome & Firefox)', () => {
  describe('Firefox vs Chrome WebRequest Listener Arguments (Real dom-events.js Execution)', () => {
    it('executes actual dom-events.js in Firefox mode: strictly 2 arguments to onErrorOccurred and no extraHeaders', () => {
      const calls = runDomEventsInBrowser(true);
      assert.equal(calls.onErrorOccurred.length, 2, 'Firefox onErrorOccurred must have exactly 2 arguments');
      assert.equal(typeof calls.onErrorOccurred[0], 'function');
      assert.deepEqual(calls.onErrorOccurred[1], { urls: ['<all_urls>'] });
      assert.deepEqual(calls.onBeforeRequest[2], ['requestBody']);
      assert.deepEqual(calls.onBeforeSendHeaders[2], ['requestHeaders']);
      assert.deepEqual(calls.onHeadersReceived[2], ['responseHeaders']);
    });

    it('executes actual dom-events.js in Chrome mode: 3 arguments including extraHeaders for all listeners', () => {
      const calls = runDomEventsInBrowser(false);
      assert.equal(calls.onErrorOccurred.length, 3, 'Chrome onErrorOccurred accepts 3 arguments');
      assert.deepEqual(calls.onErrorOccurred[2], ['extraHeaders']);
      assert.deepEqual(calls.onBeforeRequest[2], ['requestBody', 'extraHeaders']);
      assert.deepEqual(calls.onBeforeSendHeaders[2], ['requestHeaders', 'extraHeaders']);
      assert.deepEqual(calls.onHeadersReceived[2], ['responseHeaders', 'extraHeaders']);
    });
  });

  describe('Cross-Browser Cookie Removal (Chrome partitionKey vs Firefox firstPartyDomain)', () => {
    it('passes Chrome CHIPS partitionKey when removing partitioned cookies', async () => {
      const { context, mockBrowser } = createTestContext();
      context.removeCookies([
        {
          name: 'chips_session',
          domain: 'example.com',
          path: '/',
          secure: true,
          partitionKey: { topLevelSite: 'https://parent.example' },
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(mockBrowser.cookies.removed.length, 1);
      assert.deepEqual(mockBrowser.cookies.removed[0].partitionKey, { topLevelSite: 'https://parent.example' });
    });

    it('passes Firefox firstPartyDomain when removing container/isolated cookies', async () => {
      const { context, mockBrowser } = createTestContext();
      context.removeCookies([
        {
          name: 'ff_isolated_cookie',
          domain: 'tracker.com',
          path: '/',
          firstPartyDomain: 'example.org',
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(mockBrowser.cookies.removed.length, 1);
      assert.equal(mockBrowser.cookies.removed[0].firstPartyDomain, 'example.org');
    });
  });

  describe('Service Worker Environment Guard', () => {
    it('guards importScripts so it executes in Worker context and safely skips in Window/Event-Page context', () => {
      const swCode = readFileSync(new URL('../src/js/service-worker.js', import.meta.url), 'utf8');
      assert.match(
        swCode,
        /if\s*\(\s*typeof\s+importScripts\s*===\s*['"]function['"]\s*\)/,
        'service-worker.js must guard importScripts for non-worker environments (Firefox event page)',
      );
    });
  });

  describe('Store Distribution Packages Schema Verification', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const version = pkg.version;
    const chromeZip = join('archives', `http-tracker-chrome-${version}.zip`);
    const firefoxZip = join('archives', `http-tracker-firefox-${version}.zip`);

    before(() => {
      if (!existsSync(chromeZip) || !existsSync(firefoxZip)) {
        execSync('node scripts/package.mjs', { stdio: 'pipe' });
      }
    });

    it('verifies that Chrome zip has pure MV3 service_worker and NO background.scripts', () => {
      assert.ok(existsSync(chromeZip), `Expected ${chromeZip} to exist`);
      const manifestStr = execSync(`unzip -p "${chromeZip}" manifest.json`, { encoding: 'utf8' });
      const manifest = JSON.parse(manifestStr);

      assert.equal(manifest.manifest_version, 3);
      assert.ok(manifest.background.service_worker, 'Chrome manifest must specify service_worker');
      assert.equal(manifest.background.scripts, undefined, 'Chrome manifest must NOT contain background.scripts (causes warning)');
    });

    it('verifies that Firefox zip has MV3 background.scripts, official AMO GUID, and NO service_worker', () => {
      assert.ok(existsSync(firefoxZip), `Expected ${firefoxZip} to exist`);
      const manifestStr = execSync(`unzip -p "${firefoxZip}" manifest.json`, { encoding: 'utf8' });
      const manifest = JSON.parse(manifestStr);

      assert.equal(manifest.manifest_version, 3);
      assert.ok(Array.isArray(manifest.background.scripts), 'Firefox manifest must specify background.scripts array');
      assert.equal(manifest.background.service_worker, undefined, 'Firefox manifest must NOT contain service_worker');
      assert.equal(
        manifest.browser_specific_settings?.gecko?.id,
        '{2939349f-b516-4674-afa4-4dc8311a75ef}',
        'Firefox manifest must specify official AMO GUID',
      );
      assert.equal(
        manifest.browser_specific_settings?.gecko?.strict_min_version,
        '113.0',
        'Firefox manifest must target minimum strict version 113.0',
      );
    });
  });

  describe('Input Clear Buttons (✕) Verification across all Text Boxes', () => {
    const htmlContent = readFileSync(new URL('../src/html/http-tracker.html', import.meta.url), 'utf8');
    const cssContent = readFileSync(new URL('../src/css/styles.css', import.meta.url), 'utf8');

    it('verifies that all text input boxes (including header rules) have an associated inline clear button', () => {
      const targetInputs = [
        'track_urls_pattern',
        'exclude_urls_pattern',
        'block_urls_pattern',
        'mask_patterns_list',
        'find_in_details_pattern',
        'delete_cookies',
        'header_name_0',
        'header_value_0',
        'header_url_0',
      ];

      for (const inputId of targetInputs) {
        assert.ok(
          htmlContent.includes(`data-clear-target="${inputId}"`),
          `Expected input #${inputId} to have a matching inline clear button with data-clear-target="${inputId}"`,
        );
      }
    });

    it('verifies that each table column header has an interactive filter toggle, input, and close button', () => {
      const columns = ['url', 'method', 'status', 'date', 'cache'];
      for (const col of columns) {
        assert.ok(
          htmlContent.includes(`data-col="${col}"`),
          `Expected column ${col} to have data-col attribute`,
        );
        assert.ok(
          htmlContent.includes(`id="col_filter_${col}"`),
          `Expected column ${col} to have filter input #col_filter_${col}`,
        );
      }
    });

    it('verifies CSS contains pure CSS visibility toggle and column header filter styles', () => {
      assert.ok(
        cssContent.includes('.tracker_input_wrapper input:not(:placeholder-shown)'),
        'styles.css must include pure CSS toggle for :not(:placeholder-shown)',
      );
      assert.ok(
        cssContent.includes('.input_clear_btn'),
        'styles.css must define .input_clear_btn styling',
      );
      assert.ok(
        cssContent.includes('.col_header_cell'),
        'styles.css must define .col_header_cell styling',
      );
      assert.ok(
        cssContent.includes('.col_header_cell.has_active_filter'),
        'styles.css must define active filter highlight',
      );
    });
  });

  describe('Header Row Compact Layout & Accessibility', () => {
    const htmlContent = readFileSync(new URL('../src/html/http-tracker.html', import.meta.url), 'utf8');
    const cssContent = readFileSync(new URL('../src/css/styles.css', import.meta.url), 'utf8');

    it('verifies header inputs contain descriptive placeholders and aria-labels with visually hidden external labels', () => {
      // Row 0
      assert.ok(htmlContent.includes('<label for="header_name_0" class="web_event_list_hide"'));
      assert.ok(htmlContent.includes('<label for="header_value_0" class="web_event_list_hide"'));
      assert.ok(htmlContent.includes('<label for="header_url_0" class="web_event_list_hide"'));
      assert.ok(htmlContent.includes('id="header_name_0" type="text" class="header_input_name"'));
      assert.ok(htmlContent.includes('aria-label="Header name"'));
      assert.ok(htmlContent.includes('placeholder="Header name (e.g. X-Custom-Header)"'));
      assert.ok(htmlContent.includes('aria-label="Header value"'));
      assert.ok(htmlContent.includes('placeholder="Header value (e.g. my-value)"'));
      assert.ok(htmlContent.includes('aria-label="Target URL pattern"'));
      assert.ok(htmlContent.includes('placeholder="Target URL (blank = all URLs)"'));

      // Template row
      assert.ok(htmlContent.includes('<label for="tmpl_header_name" class="web_event_list_hide"'));
      assert.ok(htmlContent.includes('<label for="tmpl_header_value" class="web_event_list_hide"'));
      assert.ok(htmlContent.includes('<label for="tmpl_header_url" class="web_event_list_hide"'));

      // CSS error styling
      assert.ok(cssContent.includes('.single_header_container .header_input_invalid'));
    });
  });
});

