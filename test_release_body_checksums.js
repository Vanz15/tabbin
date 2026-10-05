#!/usr/bin/env node
'use strict';

// Offline unit test for verifyBodyChecksums, the release-body checksum guard
// added after v1.0.0/v1.0.1/v1.0.2 shipped checksums that did not match their
// own binaries. It requires the real function so the test exercises the shipped
// implementation rather than a copy of it.

const assert = require('assert');
const path = require('path');

const { verifyBodyChecksums } = require(path.join(__dirname, 'scripts', 'verify-feed.js'));

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const ASSETS = [
  { name: 'Tabbin-Setup.exe', digest: `sha256:${A}` },
  { name: 'Tabbin-Portable.exe', digest: `sha256:${B}` },
];

// The guard prints a summary line per call; silence it so `npm test` output
// stays readable, and restore stdout even if an assertion throws.
function problems(body, assets = ASSETS) {
  const realLog = console.log;
  console.log = () => {};
  try {
    return verifyBodyChecksums(body, assets);
  } finally {
    console.log = realLog;
  }
}

const cases = [
  ['correct list form', `- \`Tabbin-Setup.exe\`: \`${A}\``, 0],
  ['correct table form', `| \`Tabbin-Setup.exe\` | \`${A}\` |`, 0],
  ['both exes correct', `- \`Tabbin-Setup.exe\`: \`${A}\`\n- \`Tabbin-Portable.exe\`: \`${B}\``, 0],
  ['CRLF body', `- \`Tabbin-Setup.exe\`: \`${A}\`\r`, 0],
  ['no checksums at all', 'Just some release notes.', 0],
  ['stale hash from another build (the v1.0.0 bug)', `| \`Tabbin-Setup.exe\` | \`${'c'.repeat(64)}\` |`, 1],
  ['two builds concatenated (128 chars)', `| \`Tabbin-Setup.exe\` | \`${'c'.repeat(128)}\` |`, 1],
  ['truncated hash', `- \`Tabbin-Setup.exe\`: \`${'a'.repeat(40)}\``, 1],
  [
    'one wrong hash among two',
    `- \`Tabbin-Setup.exe\`: \`${A}\`\n- \`Tabbin-Portable.exe\`: \`${'d'.repeat(64)}\``,
    1,
  ],
  ['both hashes wrong', `- \`Tabbin-Setup.exe\`: \`${'c'.repeat(64)}\`\n- \`Tabbin-Portable.exe\`: \`${'d'.repeat(64)}\``, 2],
];

for (const [label, body, expected] of cases) {
  const found = problems(body);
  assert.strictEqual(
    found.length,
    expected,
    `${label}: expected ${expected} problem(s), got ${found.length} (${JSON.stringify(found)})`,
  );
}

// A stale hash must be reported as a wrong value, a concatenation as malformed.
assert.match(
  problems(`| \`Tabbin-Setup.exe\` | \`${'c'.repeat(64)}\` |`)[0],
  /wrong sha256 for Tabbin-Setup\.exe/,
);
assert.match(
  problems(`| \`Tabbin-Setup.exe\` | \`${'c'.repeat(128)}\` |`)[0],
  /malformed sha256/,
);

// With no asset digests available the guard stays quiet rather than guessing,
// because there is nothing trustworthy to compare against.
assert.deepStrictEqual(problems(`- \`Tabbin-Setup.exe\`: \`${'c'.repeat(64)}\``, []), []);

// A digest of the wrong length (rather than a wrong value) is unusable, so the
// guard must ignore it instead of reporting a mismatch it cannot justify.
assert.deepStrictEqual(
  problems(`- \`Tabbin-Setup.exe\`: \`${A}\``, [{ name: 'Tabbin-Setup.exe', digest: 'sha256:short' }]),
  [],
);

// --- Regression: a .blockmap row must not pose as a .exe row ---------------
// v2.0.0's body listed four assets, including `Tabbin-Setup.exe.blockmap`. The
// name regex was unanchored, so that row matched as `Tabbin-Setup.exe` and its
// digest overwrote the real one — the guard then reported MISMATCH on a body
// that was correct, which is how it failed v2.0.0 verification. A checker that
// cries wolf on a correct release trains the reader to ignore it.
const C = 'c'.repeat(64);
assert.deepStrictEqual(
  problems(
    [
      `| \`Tabbin-Setup.exe\` | \`${A}\` |`,
      `| \`Tabbin-Setup.exe.blockmap\` | \`${C}\` |`,
      `| \`latest.yml\` | \`${'e'.repeat(64)}\` |`,
    ].join('\n'),
  ),
  [],
  'a blockmap row after a correct Setup.exe row must not corrupt the claim',
);
assert.deepStrictEqual(
  problems(`| \`Tabbin-Setup.exe.blockmap\` | \`${C}\` |`),
  [],
  'a blockmap row alone must not masquerade as a Setup.exe claim',
);
// The anchored regex must still catch a genuinely wrong .exe digest, or the fix
// would have simply disabled the guard rather than repaired it.
assert.strictEqual(
  problems(
    [`| \`Tabbin-Setup.exe\` | \`${'f'.repeat(64)}\` |`, `| \`Tabbin-Setup.exe.blockmap\` | \`${A}\` |`].join('\n'),
  ).length,
  1,
  'a wrong Setup.exe digest is still reported even with a blockmap row present',
);
// And the blockmap digest must never be what gets compared.
assert.doesNotMatch(
  problems(`| \`Tabbin-Setup.exe\` | \`${A}\` |\n| \`Tabbin-Setup.exe.blockmap\` | \`${'f'.repeat(64)}\` |`).join(''),
  /./,
  'guard must stay quiet when only the blockmap digest is wrong',
);

console.log(
  'PASS: release-body checksum guard (stale, malformed, truncated, mixed, CRLF, no-digest and blockmap-collision cases)',
);
