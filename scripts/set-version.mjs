#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const version = process.argv.slice(2).find((arg) => !arg.startsWith('-'));

if (!version || !/^\d+\.\d+\.\d+.*$/.test(version)) {
  console.error('\x1b[31mError: Please provide a valid version string (e.g. npm run set-version 3.2.0)\x1b[0m');
  process.exit(1);
}

const pkgPath = path.join(rootDir, 'package.json');
const manifestPath = path.join(rootDir, 'manifest.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

pkg.version = version;
manifest.version = version;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n', 'utf8');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`\x1b[32m✓ Synchronized version to ${version} in package.json and manifest.json\x1b[0m`);
