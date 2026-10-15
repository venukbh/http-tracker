<div align="center">

# <img src="src/assets/icon_128px.png" width="20" alt="HTTP-TRACKER Icon"> HTTP-TRACKER

**A powerful browser extension that brings your network traffic into one central place — across all tabs, all windows, even incognito.**

[![Version](https://img.shields.io/badge/version-3.1.0-blue?style=for-the-badge)](https://github.com/venukbh/http-tracker/releases)
[![Manifest](https://img.shields.io/badge/Manifest-V3-green?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-yellow?style=for-the-badge&logo=google-chrome)](https://chrome.google.com/webstore/detail/http-tracker/fklakbbaaknbgcedidhblbnhclijnhbi)
[![Firefox](https://img.shields.io/badge/Firefox-Add--on-red?style=for-the-badge&logo=firefox)](https://addons.mozilla.org/en-US/firefox/addon/http-tracker/)

</div>

---

## 🚀 What is HTTP-TRACKER?

HTTP-TRACKER is a browser extension that tracks all network activity in your browser — Chrome and Firefox. Everything you can see in the browser's built-in Network tab, and more, is available through this extension in a **single centralized window**.

Unlike the built-in DevTools, HTTP-TRACKER aggregates requests from **all open tabs** and **all windows** — including private/incognito tabs (when permission is granted) — giving you a unified view of everything your browser is doing on the network.

---

## ✨ Features

### 🔍 Network Tracking

- 📡 Tracks **all HTTP/HTTPS requests** across all tabs and windows in real time
- 🕵️ Supports **private/incognito window** tracking when permission is enabled
- ⚡ Fully **async and non-blocking** — zero added latency to your actual requests

### 🎯 Filtering & Pattern Matching

- ✅ **Include filter** — set patterns so only matching URLs are tracked (`Track URLs having`)
- 🚫 **Exclude filter** — skip URLs containing specific patterns (`Skip URLs having`)
- 🔒 **Block URLs** — simulate ad-block or 404 behavior for specific URL patterns
- 🔎 Filter captured requests by **URL, method, status, date, cache**
- 🔗 Use `&` (AND) and `|` (OR) operators for advanced filter expressions

### 💾 Persistent Preferences

- 🌍 Set **global exclude/include/block/mask patterns** via the options page
- 🔄 Patterns persist across extension restarts — no repetitive re-entry

### 🛠️ Request Header Injection

- ➕ **Add or modify request headers** on the fly without leaving the browser
- 🌐 Apply headers globally (all URLs) or scoped to a specific URL pattern
- ⚠️ Automatically validates against forbidden headers with a visual red-border indicator
- ✔️ Use the **Apply** checkbox to control exactly when a header is activated

### 🛡️ Privacy & Security

- 🎭 **Mask sensitive data** — shows only the first and last character, replacing the rest with `*****`
- 📋 Perfect for sharing screenshots without exposing credentials or tokens

### 🍪 Cookie Management

- 🔤 Displays request cookies **sorted** (symbols first, then 0–9, then Aa–Zz case-insensitive)
- 🧹 **Optimize response cookies** — resolves the final value when duplicate cookies exist

### 🔦 Find in Details

- 🔎 Search across all header keys, values, cookies, and body of the **selected request** using the Find field
- 🟡 Matches are **highlighted inline** using `<mark>` so you can spot values instantly without scrolling
- Supports **regular expressions** — e.g. `token.*value` to match patterns across header content
- Case-insensitive and matches **all occurrences** simultaneously

### 🖱️ UX Controls

- ⏸️ **Pause tracking** without closing the extension — hold data for reference
- 🗑️ Delete all captured data, selected pairs, or all filtered results
- 📋 Captures **form data** in requests (when the option is enabled)

---

## ⌨️ Keyboard Shortcuts

| Platform   | Shortcut           |
| ---------- | ------------------ |
| 🍎 macOS   | `CMD + SHIFT + 1`  |
| 🪟 Windows | `CTRL + SHIFT + 1` |

---

## 📸 Screenshot

![HTTP-TRACKER in action](screenshots/v2.2.5.jpg)

---

## 📦 Installation

### Chrome

[![Install from Chrome Web Store](https://img.shields.io/badge/Install-Chrome_Web_Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore/detail/http-tracker/fklakbbaaknbgcedidhblbnhclijnhbi?hl=en&authuser=0)
[![Rate on Chrome Web Store](https://img.shields.io/badge/⭐_Rate-Chrome_Web_Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore/detail/http-tracker/fklakbbaaknbgcedidhblbnhclijnhbi?hl=en&authuser=0)

### Firefox

[![Install from Firefox Add-ons](https://img.shields.io/badge/Install-Firefox_Add--ons-FF7139?style=for-the-badge&logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/http-tracker/)
[![Rate on Firefox Add-ons](https://img.shields.io/badge/⭐_Rate-Firefox_Add--ons-FF7139?style=for-the-badge&logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/http-tracker/)

---

## 🛠️ Development & Release Process

HTTP-TRACKER uses a zero-build vanilla architecture. The browser directly runs the modular ES6 files from `src/` without transpilers or bundlers.

### 🧪 Running Tests & Quality Checks

```bash
# Run the automated unit and integration test suite (99 tests)
npm test

# Run ESLint code checks
npm run lint
```

### 🏷️ Setting Version in Lockstep

To keep `package.json` and `manifest.json` in 100% parallel sync without unwanted auto-increments during development, set the version explicitly whenever you are ready to ship:

```bash
# Sets the exact version in both package.json and manifest.json
npm run set-version 3.1.0
```

> **Safety Guard**: Both `npm test` and `npm run package` will prevent building or packaging if `manifest.json` and `package.json` versions ever drift.

### 📦 Packaging for Web Stores (Chrome & Firefox)

```bash
# Preview files to be bundled (excluding .DS_Store and development files)
npm run package:dry-run

# Create a clean release zip (e.g. archives/http-tracker-3.1.0.zip)
npm run package

# Verify zip archive contents
npm run package:verify
```

### 🚀 Releasing via GitHub Actions

Whenever a version tag is pushed, GitHub Actions automatically verifies all 99 tests, packages the extension, and publishes a GitHub Release with the downloadable `.zip` attached:

```bash
# 1. Update version across both files
npm run set-version 3.1.0

# 2. Commit and tag
git commit -am "chore: release v3.1.0"
git tag v3.1.0

# 3. Push commit and tag to trigger GitHub Actions release
git push origin <branch> --tags
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

Made with ❤️ for developers who live in the network tab.

⭐ If you find this useful, please star the repo and leave a review!

</div>
