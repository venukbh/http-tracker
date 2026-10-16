# 🛠️ Development & Release Guide

HTTP-TRACKER uses a zero-build vanilla JavaScript architecture. The browser directly runs the modular ES6 files from `src/` without transpilers or bundlers.

---

## 🧪 Running Tests & Quality Checks

HTTP-TRACKER includes an automated test runner suite (`node:test`) covering pure algorithms, filtering, masking, real payload playback, and cross-browser Chrome/Firefox compatibility:

```bash
# Run the 106 automated unit and integration tests
npm test

# Run ESLint code checks
npm run lint
```

---

## 🏷️ Setting Version in Lockstep

To keep `package.json` and `manifest.json` in 100% parallel sync without unwanted auto-increments during development, set the version explicitly whenever you are ready to ship:

```bash
# Sets the exact version in both package.json and manifest.json
npm run set-version <version>

# Example:
npm run set-version 3.1.0
```

> **Safety Guard**: Both `npm test` and `npm run package` will prevent building or packaging if `manifest.json` and `package.json` versions ever drift.

---

## 📦 Multi-Store Packaging (Chrome & Firefox)

The packaging script automatically builds two tailored distributions into `archives/`:

```bash
# Build pristine Chrome and Firefox release archives
npm run package

# Verify archive contents and file tables
npm run package:verify
```

### Generated Artifacts:
- **`archives/http-tracker-chrome-<version>.zip`**:
  - Tailored for Google Chrome Web Store.
  - Manifest V3 with pure `service_worker` (0 warnings in Chrome).
- **`archives/http-tracker-firefox-<version>.zip`**:
  - Tailored for Mozilla Firefox Add-ons (AMO).
  - Manifest V3 with `background.scripts` and official AMO GUID `{2939349f-b516-4674-afa4-4dc8311a75ef}`.
- **`archives/http-tracker-<version>.zip`**:
  - Standard release alias.

---

## 🔍 Testing Locally

### Google Chrome:
1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the root extension folder.
4. Verify 0 warnings and 0 errors.

### Mozilla Firefox:
1. Go to `about:debugging#/runtime/this-firefox`.
2. Under **Temporary Extensions**, click **Load Temporary Add-on…**.
3. Select `archives/http-tracker-firefox-<version>.zip`.
4. Click **Inspect** to check the console and verify 0 errors.

---

## 🚀 End-to-End Release Workflow

When shipping a new version (e.g. `v3.1.0`):

### 1. Prepare Release
```bash
# 1. Update version across manifest and package.json
npm run set-version 3.1.0

# 2. Run all tests and build store archives
npm test
npm run package
npm run package:verify
```

### 2. Submit to Web Stores
- **Chrome**: Upload `archives/http-tracker-chrome-3.1.0.zip` to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
- **Firefox**: Upload `archives/http-tracker-firefox-3.1.0.zip` to the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/).
- Update store descriptions from [`store-listing.txt`](store-listing.txt).
- Submit for review.

### 3. Wait for Store Approval
- **Do not create git tags yet.**
- Wait for Google / Mozilla approval confirmation emails.

### 4. Merge & Publish on GitHub
Once approved in the store:
```bash
# 1. Switch to master and merge enhancements
git checkout master
git merge enhancements
git push origin master

# 2. Tag the approved release
git tag v3.1.0
git push origin v3.1.0
```

**Automated GitHub Actions CI/CD will immediately:**
1. Spin up an Ubuntu runner.
2. Run all 106 automated tests on Node 24.
3. Package both Chrome and Firefox release archives.
4. Automatically create and publish the GitHub Release with notes and both `.zip` files attached!
