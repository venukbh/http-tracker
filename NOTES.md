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

---

## 7. Browser-Generated Headers vs. Application Headers Architecture

### Conceptual Distinction: Internal Metadata vs. Wire Headers
In network monitoring extensions, request details fall into two fundamentally distinct architectural categories:

1. **Internal Extension Event Metadata**:
   - Properties attached to the request event object by the browser engine's internal WebRequest API (such as `initiator`, `originUrl`, `documentId`, `cookieStoreId`, `thirdParty`, `tabId`, and `fromCache`).
   - **Network Destination**: These fields exist exclusively in browser RAM for extension and DevTools inspection. They never leave the browser, are never serialized into network packets, and never reach the application server.

2. **HTTP Wire Headers**:
   - Key-value pairs serialized into the actual HTTP/1.1 request stream or HTTP/2 & HTTP/3 HEADERS frames.
   - **Network Destination**: These travel over the TCP/TLS socket and are received, parsed, and evaluated by the web server, reverse proxy, or API gateway.

### Browser-Controlled vs. Webpage-Controlled Wire Headers
Not all HTTP wire headers originate from web applications. The browser network stack automatically injects and governs a dedicated set of headers:

- **Fetch Metadata (`Sec-Fetch-*`)**: Injected by the browser to declare request isolation context (destination, mode, cross-site origin, and user activation). Used by servers to thwart CSRF and cross-origin leaks.
- **Client Hints (`Sec-CH-UA*`, `Device-Memory`, `Save-Data`)**: Injected by the browser to convey device architecture, platform, and performance preferences.
- **Context & Security (`Origin`, `Referer`)**: Enforced by the browser to maintain origin boundaries and CORS compliance.
- **Transport & Protocol Control (`Host`, `Connection`, `Priority`, `Accept-Encoding`)**: Managed by the network layer to handle TCP sockets, multiplexing, stream priorities (RFC 9218), and compression algorithms.
- **Session State (`Cookie`)**: Extracted directly from the browser's secure cookie jar for matching domains and paths.

### Cross-Browser Implementation Differences (Chromium vs. Gecko)

1. **Client Hints (`Sec-CH-UA*`)**:
   - **Chrome (Chromium)**: Automatically generates and attaches brand, mobile, and platform Client Hints on all outgoing requests.
   - **Firefox (Gecko)**: Deliberately omits `Sec-CH-UA*` headers on all requests. Mozilla considers User-Agent Client Hints an unnecessary entropy vector for passive browser fingerprinting.

2. **WebRequest Header Visibility & `extraHeaders`**:
   - **Chrome**: By default, Chromium suppresses browser-managed headers (`Cookie`, `Origin`, `Referer`, Client Hints) from extension observers for performance and security. Extensions must explicitly pass the `extraHeaders` specifier in listener configurations to unlock full visibility.
   - **Firefox**: Gecko exposes all outgoing headers to extensions holding host permissions by default, without requiring an `extraHeaders` toggle.

3. **Contextual Metadata Differences**:
   - **Firefox**: Uniquely exposes `cookieStoreId` (identifying Firefox Multi-Account Containers like Personal, Work, or Banking), `originUrl` (the full initiator document URL), and a direct `thirdParty` boolean flag.
   - **Chrome**: Exposes `initiator` (origin only) and Manifest V3 document identifiers (`documentId`, `parentDocumentId`, `frameType`).

### Forward Compatibility & Identifying Future Browser Headers
When browser vendors introduce new headers in future engine releases, the extension classifies and handles them reliably:

1. **Dynamic Capture Guarantee**:
   Because request headers are delivered as an open-ended collection of key-value pairs rather than a static enumeration, network tracking that iterates over the received header collection will capture and display newly standardized headers immediately upon browser release without code updates.

2. **The W3C Prefix Standard (`Sec-`)**:
   Under the W3C Fetch Specification and IETF standards, browser vendors are prohibited from inventing arbitrary un-prefixed names for new browser-governed security or state features. Any new header intended to represent verified browser state or security boundaries must use the `Sec-` prefix (or `Proxy-`). Webpage scripts are physically barred by browser engines from setting or overriding any header with this prefix, guaranteeing that any `Sec-*` header on the wire is authentic and browser-generated.

3. **W3C Forbidden Header Names**:
   For historical headers that do not use the `Sec-` prefix (such as `Host`, `Origin`, `Referer`, `Cookie`, `Priority`, and `Connection`), the W3C maintains the Forbidden Header Names specification. Browser JavaScript runtimes silently drop any attempt by webpage scripts (`fetch`, `XMLHttpRequest`) to set or modify these names. As a result, the presence of any forbidden header name indicates that its value is managed exclusively by the browser's network layer.

### Can Browser Vendors Introduce "Random" Header Names in the Future?
A common architectural question is whether browser vendors (Google, Mozilla, Apple, Microsoft) could suddenly introduce a brand new browser-controlled header with an arbitrary or random name (e.g. `Fast-Track` or `Client-Tier`) without using the `Sec-` prefix:

- **Strict Web Security Boundary**:
  Browser vendors **cannot** arbitrarily introduce unreserved, random-named headers for browser-controlled features. If a browser vendor created a browser-state header with an unreserved name, any website's JavaScript could trivially forge it via `fetch('/api', { headers: { 'Fast-Track': 'true' } })`. The receiving application server would have no mathematical or cryptographic way to verify whether the header was produced by the trusted browser engine or spoofed by a malicious script.

- **The Universal Standardization Rule**:
  Because of this security boundary, international standards (IETF RFC 8470 and WHATWG Fetch Specification Section 2.2.2) mandate that browser vendors can only introduce browser-only headers through two strictly governed paths:
  1. **The Reserved Prefix (`Sec-` or `Proxy-`)**: Any modern feature created exclusively by browser engines (such as Client Hints `Sec-CH-*`, Fetch Metadata `Sec-Fetch-*`, Speculative Loading `Sec-Purpose`, or Privacy Sandbox `Sec-Browsing-Topics`) must begin with `Sec-`. Webpage runtimes are universally blocked from touching this namespace.
  2. **IETF RFC Formal Standardization**: If a non-`Sec` header is ever ratified across all browser engines (such as the recent `Priority` header in RFC 9218), it must be formally added to the browser engine's internal "Forbidden Header Names" list so that webpage scripts are blocked from forging it.

- **Practical Classification Rule**:
  If a header appears on the wire that does **not** start with `Sec-` and is **not** on the standardized forbidden list, it is guaranteed by the web platform architecture to be an **Application / Webpage header** (injected by frontend JavaScript, an analytics SDK, or an API client). Regardless of the header name, HTTP-TRACKER captures and displays it immediately because its network listener uses open-ended dynamic iteration rather than a hardcoded allowlist.


### Complete Mental Model & Classification Matrix

| Category | Who Generates It? | Can Webpages Modify It? | Can Extensions Modify It? | Does It Reach App Server? |
| :--- | :--- | :---: | :---: | :---: |
| **1. Internal Event Metadata** (`initiator`, `originUrl`, `documentId`, `fromCache`, `cookieStoreId`) | Extension Engine | ❌ No | ❌ No | ❌ **NEVER** (RAM only) |
| **2A. Browser Wire Transport** (`Sec-*`, `Connection`, `Host`, `Priority`) | Browser C++ Network Stack | ❌ Blocked | ❌ Blocked (`FORBIDDEN_HEADERS` in `src/js/constants.js`) | ✅ **YES** (Over wire) |
| **2B. Browser Wire Context** (`Cookie`, `Origin`, `Referer`, `User-Agent`) | Browser C++ Network Stack | ❌ Blocked | ✅ **Yes** (via `Modify headers` rule builder) | ✅ **YES** (Over wire) |
| **3. Webpage Wire Headers** (`Authorization`, `Content-Type`, `X-Api-Key`, custom `X-*`) | Webpage JavaScript | ✅ Yes | ✅ **Yes** (via `Modify headers` rule builder) | ✅ **YES** (Over wire) |

#### Key Operational Insights:
- **Extension Modification Boundaries**: Webpages can never touch browser-controlled headers. Extensions with host permissions cannot touch raw transport/framing headers (`Connection`, `Keep-Alive`, `Sec-*` as enforced by `FORBIDDEN_HEADERS`), but can explicitly override context headers (`Cookie`, `Referer`, `Origin`, `User-Agent`) to enable developer testing and header manipulation workflows.
- **Directionality (Request vs. Response)**: The classifications above govern client-to-server **Request Headers**. Server-to-client **Response Headers** (`Set-Cookie`, `Content-Type`, `Server`, `Cache-Control`) are generated by backend application servers, and the browser merely receives and enforces them.
- **HTTP/2 and HTTP/3 Protocol Pseudo-Headers**: Modern HTTP/2 and HTTP/3 connections introduce framing pseudo-headers prefixed with a colon (`:method`, `:path`, `:scheme`, `:authority`). These are low-level binary protocol fields generated by the browser's transport layer; they travel over the wire but cannot be altered by webpages or extension scripts.

### Authoritative Standards & References
- **WHATWG Fetch Living Standard (§ 2.2.2 Forbidden Header Name)**: [https://fetch.spec.whatwg.org/#forbidden-header-name](https://fetch.spec.whatwg.org/#forbidden-header-name)
- **MDN Web Docs (Forbidden Header Name Reference)**: [https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_header_name)
- **Chrome DeclarativeNetRequest Header Rules**: [https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#modify-headers](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest#modify-headers)

### Manual Pre-Packaging Verification Checklist
Because new browser-controlled transport headers are ratified very rarely (years apart), automated build-time network sync is unnecessary and brittle. Before major packaging milestones:
1. Open the [WHATWG Fetch Living Standard (§ 2.2.2)](https://fetch.spec.whatwg.org/#forbidden-header-name).
2. Review the list of lowercase header names.
3. Check `FORBIDDEN_HEADERS` and `FORBIDDEN_HEADER_PREFIXES` in [`src/js/constants.js`](src/js/constants.js).
   - Any header starting with `sec-` or `proxy-` is automatically covered by `FORBIDDEN_HEADER_PREFIXES`.
   - Any new standalone non-`sec` transport header (like `priority`) should be appended to `FORBIDDEN_HEADERS`.
4. If updated, add a unit test in `test/rules.test.mjs` and run `npm test`.



