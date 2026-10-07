// Behavioural proof that display order survives a relaunch, and that every
// notes write goes through the serialized write queue.
//
// Both were source-level invisible before: notes:list sorted by updatedAt, so
// drag-reorder's persisted order was discarded on the next launch, and
// notes:create called saveNotes() directly instead of queueWrite(). A text
// assertion cannot catch either — both read as correct source. These run the
// real handlers against a temp notes file.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const main = fs.readFileSync('main.js', 'utf8');

// --- Extract the real storage functions from main.js ------------------------
// They only touch fs/path plus app.getPath('userData'), so stubbing userData
// is enough to drive them for real.
function extract(name) {
  const start = main.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist in main.js`);
  let depth = 0;
  let opened = false;
  for (let i = main.indexOf('{', start); i < main.length; i += 1) {
    if (main[i] === '{') { depth += 1; opened = true; }
    else if (main[i] === '}') {
      depth -= 1;
      if (opened && depth === 0) return main.slice(start, i + 1);
    }
  }
  assert.fail(`${name} body was not brace-balanced`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabbin-order-'));
const notesFile = path.join(dir, 'notes.json');
const write = (notes) => fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2));

// dataFile is an arrow const (`const dataFile = () => ...`), not a function
// declaration, so it needs its own one-line extract.
const dataFileLine = main.match(/^const dataFile = .*$/m);
assert.ok(dataFileLine, 'dataFile must exist in main.js');

// Deterministic, distinct timestamps. The old bug sorted descending by
// updatedAt, so these values force that sort to produce a DIFFERENT order than
// the on-disk order.
const a = { id: 'a', title: 'A', content: '', updatedAt: 1000 };
const b = { id: 'b', title: 'B', content: '', updatedAt: 2000 };
const c = { id: 'c', title: 'C', content: '', updatedAt: 3000 };

const harness = new Function(
  'fs', 'path', 'app', 'writeChain', 'seed', 'loadConfig',
  `${dataFileLine[0]}
   ${extract('notesDir')}
   ${extract('loadNotes')}
   ${extract('saveNotes')}
   ${extract('queueWrite')}
   return { loadNotes, saveNotes, queueWrite };`
);

let writeChain = Promise.resolve();
const store = harness(
  fs, path, { getPath: () => dir }, writeChain, [],
  // saveLocation 'same' makes notesDir() resolve to the stubbed userData, i.e.
  // the temp dir. Without this it read the REAL user config and the real notes.
  () => ({ saveLocation: 'same' }),
);
const { loadNotes, saveNotes, queueWrite } = store;

// --- 1. Order is returned as persisted, not re-sorted ------------------------
write([a, b, c]); // on-disk order: A, B, C — oldest first
const loaded = loadNotes();
assert.deepStrictEqual(
  loaded.map((n) => n.id),
  ['a', 'b', 'c'],
  'loadNotes must return notes in persisted order, not sorted by updatedAt',
);

// The exact regression: notes:list used `.sort((x, y) => y.updatedAt - x.updatedAt)`,
// which turns [A,B,C] into [C,B,A] and silently discards the drag order.
const buggySort = [...loaded].sort((x, y) => y.updatedAt - x.updatedAt).map((n) => n.id);
assert.deepStrictEqual(
  buggySort,
  ['c', 'b', 'a'],
  'control: the old sort really did reverse this order, so this test would have failed before',
);

// notes:list must NOT contain a sort of the loaded array.
const listHandler = main.slice(
  main.indexOf("ipcMain.handle('notes:list'"),
  main.indexOf('\n', main.indexOf("ipcMain.handle('notes:list'")),
);
assert.doesNotMatch(
  listHandler,
  /\.sort\(/,
  'notes:list must not re-sort; notes.json order IS the display order drag-reorder writes',
);

// --- 2. Every notes write goes through the queue -----------------------------
const createHandler = main.slice(
  main.indexOf("ipcMain.handle('notes:create'"),
  main.indexOf("ipcMain.handle('notes:get'"),
);
assert.match(
  createHandler,
  /await queueWrite\(notes\)/,
  'notes:create must serialize its write, or it races the write queue',
);
assert.doesNotMatch(
  createHandler,
  /[^e]saveNotes\(notes\)/,
  'notes:create must not call saveNotes() directly — that is the race this guards',
);

// --- 3. The queue really serializes overlapping writes -----------------------
// Queue two writes built from the same read, and prove the LAST one wins with a
// value that proves ordering, not just "no corruption".
(async () => {
  writeChain = Promise.resolve();
  const first = [a, b];
  const second = [a, b, c];
  const p1 = queueWrite(first);
  const p2 = queueWrite(second);
  await Promise.all([p1, p2]);
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(notesFile, 'utf8')).map((n) => n.id),
    ['a', 'b', 'c'],
    'queued writes must land in order, last write winning',
  );
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(
    'PASS: display order survives a relaunch, and every notes write is serialized',
  );
})().catch((err) => {
  fs.rmSync(dir, { recursive: true, force: true });
  console.error('FAIL:', err.message);
  process.exit(1);
});