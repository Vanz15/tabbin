'use strict';
// Offline check of the palette migration helpers from main.js, extracted so the
// real implementation is exercised without launching Electron or touching
// notes.json. The migration rewrites user data, so it must be provably
// idempotent and must never mangle a colour it cannot parse.

const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync('main.js', 'utf8');
const grab = (name) => {
  const start = src.indexOf(`function ${name}`);
  assert.notStrictEqual(start, -1, `${name} must exist in main.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
};

const paletteLine = src.match(/const palette = \[[^\]]*\]/)[0];
const PALETTE = eval(paletteLine.replace('const palette =', ''));
const factory = new Function(
  `${paletteLine}\n${grab('hexToRgb')}\n${grab('nearestPaletteColor')}\n${grab('migrateNoteColors')}\n` +
    'return { palette, hexToRgb, nearestPaletteColor, migrateNoteColors };',
);
const { palette, hexToRgb, nearestPaletteColor, migrateNoteColors } = factory();

assert.strictEqual(palette.length, 5, 'glass palette has five colours');
assert.ok(palette.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c)), 'palette entries are 6-digit hex');

// The six legacy flat colours must all map onto the new palette.
const LEGACY = ['#f5c542', '#66d9c7', '#ff8b8b', '#a98bff', '#76b7ff', '#f29b72'];
for (const legacy of LEGACY) {
  const mapped = nearestPaletteColor(legacy);
  assert.ok(palette.includes(mapped), `${legacy} maps into the palette, got ${mapped}`);
}

// A colour already on the palette maps to itself.
for (const c of palette) {
  assert.strictEqual(nearestPaletteColor(c), c, `${c} maps to itself`);
}

// Case-insensitive: an already-migrated note must be left alone.
const known = new Set(palette.map((c) => c.toLowerCase()));
assert.ok(known.has('#f2a38f'), 'lowercase palette entries are recognised');
assert.strictEqual(nearestPaletteColor('#F2A38F'), '#F2A38F');

// Unparseable colours are left alone rather than replaced with a guess.
assert.strictEqual(nearestPaletteColor('not-a-color'), null);
assert.strictEqual(hexToRgb(''), null);
assert.strictEqual(hexToRgb(undefined), null);
assert.strictEqual(hexToRgb('#12345'), null, 'short hex is not a colour');

// Migration reports whether it changed anything, and only touches old colours.
const legacyNotes = LEGACY.map((color, i) => ({ id: 'n' + i, color }));
assert.strictEqual(migrateNoteColors(legacyNotes), true, 'legacy notes are rewritten');
assert.ok(
  legacyNotes.every((n) => palette.includes(n.color)),
  'every legacy note ends on the glass palette',
);

const modern = palette.map((color, i) => ({ id: 'm' + i, color }));
assert.strictEqual(migrateNoteColors(modern), false, 'no write when nothing changes');
assert.deepStrictEqual(
  modern.map((n) => n.color),
  palette,
  'modern notes are untouched',
);

// Idempotent: a second pass over migrated notes must be a no-op, so launching
// on every start cannot keep rewriting notes.json.
const once = LEGACY.map((color, i) => ({ id: 'x' + i, color }));
migrateNoteColors(once);
const afterFirst = JSON.stringify(once);
assert.strictEqual(migrateNoteColors(once), false, 'second pass changes nothing');
assert.strictEqual(JSON.stringify(once), afterFirst, 'second pass is byte-identical');

// Content and ids survive the migration untouched.
const rich = [{ id: 'abc', title: 'T', content: '<b>hi</b>', color: '#f5c542', alwaysOnTop: true }];
migrateNoteColors(rich);
assert.strictEqual(rich[0].id, 'abc');
assert.strictEqual(rich[0].title, 'T');
assert.strictEqual(rich[0].content, '<b>hi</b>');
assert.strictEqual(rich[0].alwaysOnTop, true);

console.log('PASS: palette migration (legacy mapping, idempotence, unparseable colours, data preservation)');
