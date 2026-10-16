# 📝 HTTP-TRACKER Technical Notes & Browser Quirks

This document records architectural decisions, browser engine behaviors, and known browser-specific quirks encountered in HTTP-TRACKER for future reference and troubleshooting.

---

## 1. Request Body Capturing & Chromium `error: "Unknown error."`

### Symptoms
When inspecting certain POST requests (notably telemetry beacons, analytics, or modern web app API calls), the request body displays:
```json
{
  "requestBody": {
    "error": "Unknown error."
  }
}
```
A classic real-world example is GitHub's Datadog Real User Monitoring (RUM) beacon:
- **URL**: `https://api.github.com/_private/browser/rum?ddforward=...&dd-evp-encoding=deflate&_dd.api=fetch`
- **Method**: `POST`
- **Initiator**: `https://github.com`
- **RequestBody**: `error: "Unknown error."`

### Root Cause
1. **Client-Side Compression & Streaming**:
   Modern telemetry libraries (such as Datadog RUM, Sentry, Google Analytics) compress payloads in real-time in the browser using the Compression Streams API (`CompressionStream('deflate')`) and transmit them using:
   ```javascript
   fetch(url, {
     method: 'POST',
     body: compressedReadableStreamOrBlob,
     keepalive: true
   });
   ```
   or via `navigator.sendBeacon()`.

2. **Chromium WebRequest Engine Limitation**:
   In Chromium, `chrome.webRequest.onBeforeRequest` with `["requestBody"]` only captures request bodies that are pre-buffered in standard memory formats (URL-encoded form data, multipart forms, or static buffers).

   For requests that use:
   - **Streaming upload bodies** (`ReadableStream`)
   - **`fetch(..., { keepalive: true })`**
   - **`navigator.sendBeacon()`**
   - **Speculative preconnect / background beacon transfers**

   Chromium's C++ network service intentionally refuses to buffer or replicate these streaming payloads across IPC to extensions to avoid memory exhaustion and unbounded latency. By design, Chromium's WebRequest API returns:
   ```json
   { "error": "Unknown error." }
   ```
   *(Documented in Chromium bug tracker [issue 707185](https://issues.chromium.org/issues/40518776)).*

   > **Important**: The request itself succeeded normally over the network; only the browser extension inspection hook was unable to copy the streaming buffer.

### How HTTP-TRACKER Handles This
1. **Excluded from Metadata Table**:
   `requestBody` is included in `ignoreHeaders` in `src/js/details-view.js` so internal browser error objects are never dumped into the top metadata table alongside `documentId`, `initiator`, and `method`.
2. **Graceful Explanation in Body Section**:
   In `buildRequestFormContainer` (`src/js/details-view.js`), when `webEventIdRequestForm.error` is detected, HTTP-TRACKER displays a clear, informative message rather than a raw JSON error:
   ```html
   [Body unavailable from browser: Unknown error. (e.g. streaming, keepalive, or beacon)]
   ```
3. **Automated Regression Test**:
   Verified via `test/playback.test.mjs` ("RequestBody Browser Limitation & Error Handling").

### Why the Response Code is `202 Accepted`
- **RFC 9110 Definition**: `202 Accepted` indicates that the request has been received and accepted for processing, but processing has not yet completed.
- **Asynchronous Telemetry Ingest**: High-throughput ingestion backends (Datadog, Sentry, Kafka, AWS Kinesis, Google Pub/Sub) do not wait to parse, validate, or store telemetry in databases synchronously while the user is actively browsing. The ingestion edge server merely enqueues the compressed batch into a buffer/message broker and returns `202 Accepted` in under ~20ms so it doesn't hold browser connections open or slow down page unloads.
- **Success Status**: In HTTP semantics and in HTTP-TRACKER, `202` is a standard `2xx` success code, confirming that the server received and accepted the request.

---

## 2. Cross-Browser Manifest V3 Differences (Chrome vs Firefox)

### Background Script Specification
- **Chrome**: Requires `background.service_worker: "src/js/service-worker.js"`.
  - Rejects `background.scripts`.
- **Firefox**: Requires `background.scripts: ["src/js/service-worker.js"]`.
  - Rejects `background.service_worker` in standard MV3 add-ons.
- **AMO GUID**:
  - Firefox requires `browser_specific_settings.gecko.id` (set to `{2939349f-b516-4674-afa4-4dc8311a75ef}`).
  - Chrome flags unknown keys under `browser_specific_settings` as warnings.
- **Packaging Solution**:
  - `scripts/package.mjs` builds two separate zero-warning packages:
    - `archives/http-tracker-chrome-<version>.zip` (pure service worker)
    - `archives/http-tracker-firefox-<version>.zip` (background scripts + gecko id)

### WebRequest API Event Signatures
- In `chrome.webRequest.onErrorOccurred`:
  - Chrome allows passing `["extraHeaders"]` in the filter/specs.
  - Firefox throws an exception if `extraHeaders` is passed to `onErrorOccurred`.
  - `src/js/dom-events.js` checks the browser runtime or omits `extraHeaders` for `onErrorOccurred` listeners.

---

## 3. Typography & Cross-Platform Font Rendering

### Firefox Serif Fallback Issue
When a stylesheet specifies generic `font-family: Arial, Helvetica, sans-serif` without declaring standard form control rules (`input, button, select, textarea`), Firefox on macOS and Windows falls back to user-agent default serif fonts (Times New Roman).

### System Font Stack Solution
`src/css/styles.css` applies the native system font stack uniformly across all elements:
```css
body, input, button, select, textarea, label {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
}
```
This guarantees crisp, modern sans-serif typography across:
- **macOS**: San Francisco (`-apple-system`)
- **Windows**: Segoe UI (`"Segoe UI"`)
- **Linux / Android**: Roboto (`Roboto`)

---

## 4. RFC 6265 Cookie Normalization & Deduplication

### Leading Dot Domain Handling
RFC 6265 specifies that domain cookies set with a leading dot (`.example.com`) and without (`example.com`) belong to the same effective host.
- In `src/js/details-view.js` and `src/js/utils.js`:
  - Cookie domains are normalized by stripping any leading dot (`domain.replace(/^\./, '').toLowerCase()`) before deduplication in "Optimize cookies" mode.
  - Cookie deletion via `chrome.cookies.remove` prepends `/` to relative paths and targets the normalized host to ensure full removal.

---

## 5. DeclarativeNetRequest Header Override Rules

### Forbidden vs Allowed Headers
When modifying headers dynamically via DNR session rules (`chrome.declarativeNetRequest.updateSessionRules`):
- **Forbidden Transport & Security Headers**:
  - `Connection`, `Content-Length`, `Host`, `Keep-Alive`, `Te`, `Upgrade`, `Transfer-Encoding`, `Sec-*`, `Proxy-*`.
  - Attempting to set these via DNR causes browser rule rejection.
- **Allowed Essential Overrides**:
  - `Cookie`, `Referer`, `Origin`, `User-Agent`, `Accept`, `Authorization`, and custom application headers (`X-*`).
- Validation logic is implemented in `src/js/header-rules.js` and covered by automated test assertions.

---

## 6. UI Alignment & Form Layout Standards

### Right-Pane Control Alignment
To prevent input boxes from stretching inconsistently across different screen widths:
- Form rows (`Mask fields`, `Find in details`, `Delete cookies`) are wrapped in `.right_pane_controls_wrapper` (`gap: 8px`).
- Left labels use fixed `width: 130px; min-width: 130px;`.
- Text input wrappers use `flex: 1; min-width: 0;`.
- Trailing control slots (checkboxes or delete buttons) use fixed `width: 70px; min-width: 70px;`.
- Labels omit trailing colons for clean, modern presentation.

### Inline Clear Buttons (`✕`) in Text Inputs
All text input boxes across the extension feature an inline circular `✕` clear button (`.input_clear_btn`):
- **Inputs covered**:
  - Main controls: `Track URLs having`, `Skip URLs having`, `Block URLs having`, `Filter list by`, `Mask fields`, `Find in details`, and `Delete cookies`.
  - Header rule builder: `Name`, `Value`, and `URL` (including dynamically added rows).
- **Pure CSS Visibility Toggle**: Uses `.tracker_input_wrapper input:not(:placeholder-shown) ~ .input_trailing_icons .input_clear_btn { display: flex; }`. When the input is empty, the button is completely hidden; typing even a single character makes it appear.
- **Space Optimization**: Replaces the bulky external `[ Clear filter ]` button on the filter row, freeing up 80px for the query text.
- **Keyboard Shortcut**: Pressing <kbd>Escape</kbd> while focused inside any text box instantly clears it and dispatches the change event.
- **Dynamic Trailing Icons Layout**: All trailing icons sit inside a flex container (`.input_trailing_icons` at `right: 6px; display: flex; gap: 4px;`).
  - When the info badge is empty, it uses `:empty { display: none !important; }`, allowing the `✕` clear button to sit flush against the far-right edge (`right: 6px`) with **zero empty gap**.
  - When preferences exist and an info badge is active, the `ⓘ` badge takes the far-right position and the `✕` clear button automatically flows to its left, dynamically separated by a 4px gap.
- **Header Inputs Proportional Styling**: Header inputs use a compact 13px circular `✕` button (`right: 3px`) so it never crowds the 20px tall row. Clearing a header field automatically triggers live session rule synchronization.

### Header Row Compact Layout & Inline Labels
To maximize horizontal space in the "Modify headers" section:
- **Reclaimed ~110px of Horizontal Space**: External visible labels (`Name`, `Value`, `URL`) previously consumed ~35px each. These have been hidden visually using `.web_event_list_hide` (`display: none;`), expanding the three text input boxes to occupy 100% of the available row width.
- **Self-Describing Placeholders**:
  - Name: `placeholder="Header name (e.g. X-Custom-Header)"`
  - Value: `placeholder="Header value (e.g. my-value)"`
  - URL: `placeholder="Target URL (blank = all URLs)"`
- **Accessibility Preserved**: All inputs retain `<label for="..." class="web_event_list_hide">` and explicit `aria-label`s (`"Header name"`, `"Header value"`, `"Target URL pattern"`) ensuring full WCAG screen-reader compliance.
- **Direct Input Error Indication**: Instead of coloring a now-hidden label red, invalid header names directly highlight the input box with a distinct red border (`.header_input_invalid { border-color: #e53e3e !important; }`), restoring normal borders when corrected or cleared.

### Error Highlighting Standards (DevTools Pattern)
To ensure rapid error diagnosis consistent with Chrome DevTools:
- **Top Request Stream**: Both network errors (`onErrorOccurred` / `webEvent.error`) and HTTP `4xx`/`5xx` status codes (e.g. `404`, `500`) automatically apply `.web_event_style_error` (red text) to the entire request row in `#urls_list`.
- **Bottom Details View**:
  - `statusCode` values $\ge 400$ and `statusLine` values (e.g. `HTTP/1.1 500 Internal Server Error`) are highlighted in bold red (`.web_event_detail_header_value.web_event_style_error`).
  - Network-level failure properties (`error: net::ERR_BLOCKED_BY_CLIENT`) are styled in bold red.
  - Notices (`Request blocked`, `Response not available`, `Request not available`) remain highlighted in red.
  - **Browser Limitations & Warnings**: Explanatory notices where the request succeeded but browser recording was limited (e.g. `[⚠️ Body unavailable from browser: Unknown error. (e.g. streaming, keepalive, or beacon)]`) are styled with `.web_event_style_warning` in accessible amber-700 (`#b45309;`) to prevent false alarms that the API call failed.
  - Standard headers (`Date`, `Content-Type`, `Server`) remain clean and neutral to prevent eye strain and preserve readability.

