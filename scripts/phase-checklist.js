#!/usr/bin/env node

/**
 * Phase Checklist - Verifies all 5 DEMO_PASS markers appear in order.
 *
 * Usage: node scripts/phase-checklist.js
 * Runs --init (temp UMCP_HOME) then --demo, asserts all markers.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EXPECTED_MARKERS = [
  'DEMO_PASS_PHASE1',
  'DEMO_PASS_PHASE2',
  'DEMO_PASS_PHASE3',
  'DEMO_PASS_PHASE4',
  'DEMO_PASS_PHASE5'
];

function main() {
  // Create temp directory for isolated test
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umcp-phase-check-'));
  const claudeDir = path.join(tmpDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'tokens'), { recursive: true });

  // Copy package.json to make it a valid project context
  const pkgSrc = path.join(__dirname, '..', 'package.json');
  fs.copyFileSync(pkgSrc, path.join(tmpDir, 'package.json'));

  const serverPath = path.join(__dirname, '..', 'index.js');

  console.log('=== Phase Checklist ===');
  console.log(`Temp dir: ${tmpDir}`);
  console.log('');

  try {
    // Run --install first (non-interactive)
    console.log('Step 1: Running --install...');
    execSync(`node "${serverPath}" --install`, {
      cwd: tmpDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000
    });
    console.log('  --install: OK\n');

    // Clean up any stale lock files between runs
    const dbLockPath = path.join(claudeDir, 'experiences.db.lock');
    try {
      if (fs.existsSync(dbLockPath)) {
        const stat = fs.statSync(dbLockPath);
        if (stat.isDirectory()) {
          fs.rmdirSync(dbLockPath);
        } else {
          fs.unlinkSync(dbLockPath);
        }
      }
    } catch (e) { /* best effort */ }

    // Run --demo
    console.log('Step 2: Running --demo...');
    let demoOutput;
    try {
      demoOutput = execSync(`node "${serverPath}" --demo`, {
        cwd: tmpDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000
      }).toString();
    } catch (e) {
      // Demo may exit with code 0 or 1, capture output either way
      demoOutput = (e.stdout || '').toString() + (e.stderr || '').toString();
      if (!demoOutput.includes('DEMO_PASS_PHASE')) {
        console.error('  --demo: FAILED');
        console.error(demoOutput);
        process.exit(1);
      }
    }

    console.log(demoOutput);
    console.log('');

    // Check markers in order
    console.log('Step 3: Verifying markers...');
    let lastIndex = -1;
    const results = [];

    for (const marker of EXPECTED_MARKERS) {
      const idx = demoOutput.indexOf(marker);
      if (idx === -1) {
        results.push({ marker, status: 'MISSING' });
      } else if (idx <= lastIndex) {
        results.push({ marker, status: 'OUT_OF_ORDER' });
      } else {
        results.push({ marker, status: 'OK' });
        lastIndex = idx;
      }
    }

    let allPassed = true;
    for (const r of results) {
      const icon = r.status === 'OK' ? '✓' : '✗';
      console.log(`  ${icon} ${r.marker}: ${r.status}`);
      if (r.status !== 'OK') allPassed = false;
    }

    console.log('');
    if (allPassed) {
      console.log('=== ALL PHASES PASSED ===');
      process.exit(0);
    } else {
      console.log('=== PHASE CHECK FAILED ===');
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  } finally {
    // Cleanup temp dir
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // Best effort
    }
  }
}

main();
