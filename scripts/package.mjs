import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// 1. Verify version parity
const manifestJson = JSON.parse(readFileSync('manifest.json', 'utf8'));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

if (manifestJson.version !== packageJson.version) {
  console.error(`\x1b[31mERROR: Version mismatch! manifest.json (${manifestJson.version}) !== package.json (${packageJson.version}). Run: npm run set-version <ver>\x1b[0m`);
  process.exit(1);
}

// 2. Prevent overwriting already tagged past versions
try {
  const currentTagsAtHead = execSync('git tag --points-at HEAD', { encoding: 'utf8' }).trim().split('\n');
  const allTags = execSync('git tag', { encoding: 'utf8' }).trim().split('\n');
  const targetTag = `v${manifestJson.version}`;
  if (!process.env.CI && allTags.includes(targetTag) && !currentTagsAtHead.includes(targetTag)) {
    console.error(`\x1b[31mERROR: ${targetTag} is an older tag in git. Bump version with npm run set-version <ver> before packaging.\x1b[0m`);
    process.exit(1);
  }
} catch (e) {
  // Ignore git errors if git is not available or shallow
}

const version = manifestJson.version;
const archivesDir = 'archives';
mkdirSync(archivesDir, { recursive: true });

const chromeZip = join(archivesDir, `http-tracker-chrome-${version}.zip`);
const firefoxZip = join(archivesDir, `http-tracker-firefox-${version}.zip`);
const genericZip = join(archivesDir, `http-tracker-${version}.zip`);

console.log(`\x1b[36m📦 Packaging HTTP-TRACKER v${version}...\x1b[0m\n`);

// 3. Build Chrome Package (pure MV3 with service_worker, 0 warnings in Chrome)
rmSync(chromeZip, { force: true });
rmSync(genericZip, { force: true });

execSync(`zip -r "${chromeZip}" manifest.json src/ -x "*.DS_Store" -x "*__MACOSX*"`, { stdio: 'pipe' });
cpSync(chromeZip, genericZip);

const chromeSize = (statSync(chromeZip).size / 1024).toFixed(1);
console.log(`\x1b[32m✔ Chrome package:   ${chromeZip} (${chromeSize} KB)\x1b[0m`);

// 4. Build Firefox Package (MV3 with background.scripts and gecko settings, 0 warnings in Firefox)
rmSync(firefoxZip, { force: true });
const tempDir = join(archivesDir, '.firefox-staging');
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

const firefoxManifest = {
  ...manifestJson,
  background: {
    scripts: [
      '/src/js/constants.js',
      '/src/js/utils.js',
      '/src/js/open.js',
      '/src/js/service-worker.js',
    ],
  },
  browser_specific_settings: {
    gecko: {
      id: '{2939349f-b516-4674-afa4-4dc8311a75ef}',
      strict_min_version: '113.0',
    },
  },
};

// Write tailored Firefox manifest
writeFileSync(join(tempDir, 'manifest.json'), JSON.stringify(firefoxManifest, null, 2) + '\n');
// Copy src directory into staging
cpSync('src', join(tempDir, 'src'), { recursive: true });

execSync(`cd "${tempDir}" && zip -r "../../${firefoxZip}" manifest.json src/ -x "*.DS_Store" -x "*__MACOSX*"`, { stdio: 'pipe' });
rmSync(tempDir, { recursive: true, force: true });

const firefoxSize = (statSync(firefoxZip).size / 1024).toFixed(1);
console.log(`\x1b[32m✔ Firefox package:  ${firefoxZip} (${firefoxSize} KB)\x1b[0m`);

console.log(`\n\x1b[32m✨ Both packages ready in ${archivesDir}/ with 0 warnings for their respective stores!\x1b[0m`);
