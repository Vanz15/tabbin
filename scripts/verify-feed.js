#!/usr/bin/env node
'use strict';

// Release-time guard, not part of `npm test` (it needs network access).
//
// The v1.0.0 release shipped a `latest.yml` created ~7 minutes before the
// `Setup.exe.blockmap` it references, with the installer re-uploaded in place.
// A feed whose sha512 does not match the shipped artifact makes electron-updater
// fail during differential download. This script fails loudly instead.
//
//   npm run verify:feed                    # full sha512 verification (downloads artifacts)
//   npm run verify:feed -- --metadata-only # compare declared sizes only
//   npm run verify:feed -- --tag v1.0.0
//
// Set GITHUB_TOKEN to avoid anonymous API rate limits.

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const METADATA_ONLY = args.includes('--metadata-only');
const tagArgIndex = args.indexOf('--tag');
const TAG_ARG = tagArgIndex !== -1 && args[tagArgIndex + 1] ? args[tagArgIndex + 1] : null;

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const publish = (pkg.build && pkg.build.publish && pkg.build.publish[0]) || {};
const OWNER = publish.owner;
const REPO = publish.repo;
const CHANNEL = publish.channel || 'latest';
const TAG = TAG_ARG || `v${pkg.version}`;

const HEADERS = { 'User-Agent': 'tabbin-verify-feed' };
if (process.env.GITHUB_TOKEN) HEADERS.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const problems = [];
const warnings = [];

function request(url, { method = 'GET', redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error(`Too many redirects for ${url}`));
    const req = https.request(url, { method, headers: HEADERS }, (res) => {
      const status = res.statusCode;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(request(next, { method, redirects: redirects + 1 }));
      }
      if (status !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${status} for ${url}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

// electron-builder writes a deliberately small, flat YAML document. Rather than
// take a parser dependency for a release script, read the handful of keys we
// actually verify.
function parseFeed(text) {
  const out = { files: [] };
  let inFiles = false;
  let current = null;

  const unquote = (v) => v.replace(/^['"]|['"]$/g, '');
  const put = (target, pair) => {
    const i = pair.indexOf(':');
    if (i === -1) return;
    target[pair.slice(0, i).trim()] = unquote(pair.slice(i + 1).trim());
  };

  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('- ')) {
      current = {};
      out.files.push(current);
      put(current, line.slice(2));
      continue;
    }
    if (line === 'files:') {
      inFiles = true;
      current = null;
      continue;
    }
    if (inFiles && current) {
      put(current, line);
      continue;
    }
    put(out, line);
  }
  return out;
}

function assetByName(assets, name) {
  return assets.find((a) => a.name === name) || null;
}

function human(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function verifyArtifact(entry, assets) {
  const name = entry.url || entry.path;
  if (!name) {
    problems.push('Feed file entry is missing a url/path');
    return;
  }
  const asset = assetByName(assets, name);
  if (!asset) {
    problems.push(`Feed references "${name}" but it is not attached to the ${TAG} release`);
    return;
  }

  if (entry.size !== undefined && Number(entry.size) !== asset.size) {
    problems.push(
      `${name}: feed declares size ${entry.size} but the attached file is ${asset.size} bytes`,
    );
    return;
  }

  if (METADATA_ONLY) {
    console.log(`  · ${name} — size ${human(asset.size)} matches (sha512 not checked)`);
    return;
  }

  const body = await request(asset.browser_download_url);
  const actual = crypto.createHash('sha512').update(body).digest('base64');
  if (entry.sha512 && actual !== entry.sha512) {
    problems.push(
      `${name}: sha512 mismatch — feed says ${entry.sha512.slice(0, 16)}…, actual ${actual.slice(0, 16)}…`,
    );
    return;
  }
  console.log(`  · ${name} — ${human(body.length)}, sha512 matches`);
}

async function main() {
  if (!OWNER || !REPO) {
    console.error('build.publish[0] must declare owner and repo for feed verification.');
    process.exit(2);
  }

  console.log(`Tabbin feed verification`);
  console.log(`  repo    ${OWNER}/${REPO}`);
  console.log(`  tag     ${TAG}`);
  console.log(`  channel ${CHANNEL}${METADATA_ONLY ? '  (metadata only)' : ''}\n`);

  const release = JSON.parse(
    await request(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${TAG}`),
  );
  const assets = release.assets || [];
  const ymlName = `${CHANNEL}.yml`;

  const ymlAsset = assetByName(assets, ymlName);
  if (!ymlAsset) {
    console.error(`${TAG} has no "${ymlName}" asset, so no client can discover updates.`);
    console.error('electron-builder writes <channel>.yml only for auto-updatable targets.');
    process.exit(1);
  }

  const feed = parseFeed(await request(ymlAsset.browser_download_url));

  // NOTE: asset upload timestamps are deliberately NOT used to judge the feed.
  // Re-uploading a byte-identical file bumps `updated_at` without changing its
  // content, so a newer timestamp alone proves nothing. v1.0.0 is exactly that
  // case: Tabbin-Setup.exe was re-uploaded after latest.yml, yet its size and
  // SHA-512 still match the feed, so the feed describes the shipped installer
  // correctly. Content is the only reliable signal, so we hash below.

  const expectedVersion = TAG.replace(/^v/, '');
  if (feed.version && feed.version !== expectedVersion) {
    problems.push(`Feed version is ${feed.version} but the tag is ${expectedVersion}`);
  }

  if (feed.path && feed.sha512) {
    const entry = feed.files.find((f) => (f.url || f.path) === feed.path);
    if (entry && entry.sha512 && entry.sha512 !== feed.sha512) {
      problems.push(`Feed top-level sha512 disagrees with files[] entry for ${feed.path}`);
    }
  }

  console.log(`Feed ${ymlName} (${feed.version || 'unknown version'}) declares:`);
  for (const entry of feed.files.length ? feed.files : [feed]) {
    await verifyArtifact(entry, assets);
  }

  // The portable exe is intentionally absent from the feed (it cannot be
  // auto-updated), so note it rather than treating it as an error.
  const referenced = new Set(feed.files.map((f) => f.url || f.path));
  for (const asset of assets) {
    if (asset.name.endsWith('.blockmap') || asset.name.endsWith('.yml')) continue;
    if (!referenced.has(asset.name)) {
      warnings.push(`${asset.name} is published but not in ${ymlName} (not auto-updatable)`);
    }
  }

  // electron-updater downloads <path>.blockmap for differential updates. If it
  // is missing the updater falls back to a full download, but its absence means
  // the release was assembled by hand rather than by a single electron-builder
  // pass, which is worth flagging.
  if (feed.path && !assetByName(assets, `${feed.path}.blockmap`)) {
    warnings.push(`${feed.path}.blockmap is missing — updates will fall back to a full download`);
  }

  if (warnings.length) {
    console.log('\nNotes:');
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (problems.length) {
    console.error(`\nFAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  x ${p}`);
    console.error(
      '\nRebuild and publish in a single pass. Do not re-upload assets over an already-published release.',
    );
    process.exit(1);
  }

  console.log(`\nPASS — ${ymlName} matches the artifacts published on ${TAG}.`);
}

main().catch((error) => {
  console.error(`\nERROR: ${error.message}`);
  process.exit(2);
});
