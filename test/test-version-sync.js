#!/usr/bin/env node

/**
 * Version Synchronization Test
 *
 * Validates that version numbers are synchronized across all files.
 * Prevents deployment bugs where package.json and index.js have different versions.
 *
 * Critical: This test MUST pass before any version can be deployed.
 */

const fs = require('fs');
const path = require('path');

// Test configuration
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS - ${name}`);
    passCount++;
  } catch (error) {
    console.log(`  ❌ FAIL - ${name}`);
    console.log(`     ${error.message}`);
    failCount++;
  }
}

// File paths
const ROOT_DIR = path.join(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const INDEX_JS_PATH = path.join(ROOT_DIR, 'index.js');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');

console.log('\n' + '='.repeat(70));
console.log('VERSION SYNCHRONIZATION TESTS');
console.log('='.repeat(70) + '\n');

// Test 1: package.json exists and is valid JSON
test('package.json exists and is valid JSON', () => {
  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    throw new Error('package.json not found');
  }

  try {
    JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  } catch (e) {
    throw new Error(`package.json is not valid JSON: ${e.message}`);
  }
});

// Test 2: package.json has version field
test('package.json has version field', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

  if (!pkg.version) {
    throw new Error('package.json missing "version" field');
  }

  if (typeof pkg.version !== 'string') {
    throw new Error('package.json "version" must be a string');
  }
});

// Test 3: package.json version is valid semver
test('package.json version is valid semver (X.Y.Z)', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const version = pkg.version;

  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(version)) {
    throw new Error(`Invalid semver format: "${version}" (expected X.Y.Z)`);
  }
});

// Test 4: index.js exists
test('index.js exists', () => {
  if (!fs.existsSync(INDEX_JS_PATH)) {
    throw new Error('index.js not found');
  }
});

// Test 5: index.js has VERSION constant
test('index.js has VERSION constant', () => {
  const indexContent = fs.readFileSync(INDEX_JS_PATH, 'utf8');

  if (!indexContent.includes('const VERSION')) {
    throw new Error('index.js missing "const VERSION" declaration');
  }
});

// Test 6: index.js VERSION constant is valid
test('index.js VERSION constant is valid', () => {
  const indexContent = fs.readFileSync(INDEX_JS_PATH, 'utf8');

  // Match: const VERSION = 'X.Y.Z';
  const match = indexContent.match(/const VERSION\s*=\s*['"]([^'"]+)['"]/);

  if (!match) {
    throw new Error('Could not parse VERSION constant from index.js');
  }

  const version = match[1];
  const semverRegex = /^\d+\.\d+\.\d+$/;

  if (!semverRegex.test(version)) {
    throw new Error(`Invalid VERSION format in index.js: "${version}" (expected X.Y.Z)`);
  }
});

// Test 7: CRITICAL - package.json and index.js versions MATCH
test('CRITICAL: package.json and index.js versions MATCH', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const pkgVersion = pkg.version;

  const indexContent = fs.readFileSync(INDEX_JS_PATH, 'utf8');
  const match = indexContent.match(/const VERSION\s*=\s*['"]([^'"]+)['"]/);
  const indexVersion = match[1];

  if (pkgVersion !== indexVersion) {
    throw new Error(
      `VERSION MISMATCH!\n` +
      `     package.json: "${pkgVersion}"\n` +
      `     index.js:     "${indexVersion}"\n` +
      `     These must match exactly.\n` +
      `     Update index.js: const VERSION = '${pkgVersion}';`
    );
  }

  console.log(`     Both show version: ${pkgVersion}`);
});

// Test 8: CHANGELOG.md exists
test('CHANGELOG.md exists', () => {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    throw new Error('CHANGELOG.md not found');
  }
});

// Test 9: CHANGELOG.md has entry for current version
test('CHANGELOG.md has entry for current version', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const currentVersion = pkg.version;

  const changelogContent = fs.readFileSync(CHANGELOG_PATH, 'utf8');

  // Look for: ## [X.Y.Z] - YYYY-MM-DD
  const versionRegex = new RegExp(`##\\s*\\[${currentVersion.replace(/\./g, '\\.')}\\]`);

  if (!versionRegex.test(changelogContent)) {
    throw new Error(
      `CHANGELOG.md missing entry for version ${currentVersion}\n` +
      `     Add: ## [${currentVersion}] - YYYY-MM-DD`
    );
  }

  console.log(`     Found entry for v${currentVersion}`);
});

// Test 10: No hardcoded old versions in critical files
test('No hardcoded old version strings in index.js', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  const currentVersion = pkg.version;

  const indexContent = fs.readFileSync(INDEX_JS_PATH, 'utf8');

  // Find all version-like strings (X.Y.Z)
  const versionMatches = indexContent.match(/\d+\.\d+\.\d+/g) || [];

  // Filter out the correct VERSION constant
  const otherVersions = versionMatches.filter(v => v !== currentVersion);

  // Some version strings are okay (like Node version requirements, dependency versions, etc.)
  // But if we find multiple different version strings, warn about it
  const uniqueOtherVersions = [...new Set(otherVersions)];

  if (uniqueOtherVersions.length > 3) {
    console.log(`     Warning: Found ${uniqueOtherVersions.length} other version strings in index.js`);
    console.log(`     (This may be normal for dependency versions)`);
  }
});

// Summary
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Tests Passed: ${passCount}`);
console.log(`❌ Tests Failed: ${failCount}`);
console.log(`Total: ${passCount + failCount} tests\n`);

if (failCount > 0) {
  console.log('🚨 VERSION SYNCHRONIZATION FAILED!');
  console.log('Fix version mismatches before deploying.\n');
  process.exit(1);
} else {
  console.log('✅ All versions synchronized correctly!\n');
  process.exit(0);
}
