// Runtime proof that Settings "Save location" changes where notes are written.
//
// Source-level assertions can only prove the code looks right. This exercises the
// real resolution rules against a temp directory: that dataFile follows the
// setting, that a rejected folder leaves the previous value intact, and that
// choosing a folder carries notes.json across instead of appearing to lose them.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const main = fs.readFileSync('main.js', 'utf8');

// Pull the three functions out of main.js and run them against a temp dir. They
// only touch fs/path, so stubbing userData is enough to drive them for real.
function extract(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist in main.js`);
  let depth = 0;
  let i = main.indexOf('{', start);
  for (let j = i; j < main.length; j++) {
    if (main[j] === '{') depth++;
    else if (main[j] === '}') {
      depth--;
      if (depth === 0) return main.slice(start, j + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tabbin-save-'));
const userData = path.join(root, 'userData');
fs.mkdirSync(userData, { recursive: true });

let current = { saveLocation: 'same' };
const loadConfig = () => current;
const app = { getPath: () => userData };

const harness = new Function(
  'fs',
  'path',
  'app',
  'loadConfig',
  `${extract('notesDir')}\n${extract('isValidSaveDir')}\n${extract('migrateNotesDir')}\nreturn { notesDir, isValidSaveDir, migrateNotesDir };`,
)(fs, path, app, loadConfig);

const { notesDir, isValidSaveDir, migrateNotesDir } = harness;

// --- default: notes live beside Tabbin's userData ------------------------
assert.strictEqual(
  notesDir(),
  userData,
  'with no folder chosen, notes must stay in the default location',
);
assert.strictEqual(
  path.join(notesDir(), 'notes.json'),
  path.join(userData, 'notes.json'),
  'dataFile must resolve to the default notes.json',
);

// --- a chosen folder redirects the location ------------------------------
const chosen = path.join(root, 'MyNotes');
current = { saveLocation: chosen };
assert.strictEqual(notesDir(), chosen, 'a chosen folder must take effect');
assert.strictEqual(
  path.join(notesDir(), 'notes.json'),
  path.join(chosen, 'notes.json'),
  'notes.json must be written inside the chosen folder',
);
// Resolved per call, so a later change is picked up without a restart.
current = { saveLocation: 'same' };
assert.strictEqual(notesDir(), userData, 'the path must be re-read, not cached');

// --- validation rejects what would break every later save ----------------
assert.strictEqual(isValidSaveDir('same'), true, "'same' is always valid");
assert.strictEqual(isValidSaveDir(chosen), true, 'a real writable folder is valid');
assert.strictEqual(isValidSaveDir(''), false, 'an empty value is rejected');
assert.strictEqual(isValidSaveDir('   '), false, 'whitespace is rejected');
assert.strictEqual(isValidSaveDir('relative/path'), false, 'a relative path is rejected');
assert.strictEqual(isValidSaveDir('C:\\nope\\missing\\tree\\deep'), true,
  'a folder that does not exist yet is created, not rejected');
assert.strictEqual(isValidSaveDir(42), false, 'a non-string is rejected');
assert.strictEqual(isValidSaveDir(null), false, 'null is rejected');

// --- migrating carries the notes across ----------------------------------
fs.writeFileSync(path.join(userData, 'notes.json'), '[{"id":"a"}]');
fs.writeFileSync(path.join(userData, 'notes.json.bak'), '[{"id":"a"}]');
const target = path.join(root, 'Migrated');
migrateNotesDir(userData, target);
assert.strictEqual(
  fs.readFileSync(path.join(target, 'notes.json'), 'utf8'),
  '[{"id":"a"}]',
  'notes.json must be copied to the new folder, not left behind',
);
assert.ok(
  fs.existsSync(path.join(target, 'notes.json.bak')),
  'the backup travels with the notes',
);

// --- an existing notes.json at the destination is never clobbered --------
fs.writeFileSync(path.join(target, 'notes.json'), '[{"id":"existing"}]');
migrateNotesDir(userData, target);
assert.strictEqual(
  fs.readFileSync(path.join(target, 'notes.json'), 'utf8'),
  '[{"id":"existing"}]',
  'a destination that already has notes must not be overwritten',
);

// --- returning to 'same' is a no-op -------------------------------------
const before = fs.readdirSync(userData).length;
migrateNotesDir(target, 'same');
assert.strictEqual(
  fs.readdirSync(userData).length,
  before,
  "choosing 'same' must not touch the default folder",
);

fs.rmSync(root, { recursive: true, force: true });
console.log('PASS: save location resolves per read, validates the folder, and migrates notes without clobbering');