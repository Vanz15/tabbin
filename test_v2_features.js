const assert = require('assert');
const fs = require('fs');
const main = fs.readFileSync('main.js', 'utf8');
const dock = fs.readFileSync('dock.html', 'utf8');
const note = fs.readFileSync('note.html', 'utf8');
const preload = fs.readFileSync('preload.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.match(main, /ipcMain\.handle\('notes:reorder'/);
assert.match(main, /await queueWrite\(result\)/);
assert.match(dock, /draggable = true/);
assert.match(dock, /window\.tabbin\.reorder\(notes\.map\(/);
assert.match(dock, /background:\s*transparent\s*!important/);
// The dock keeps both controls (hide and quit) as inline SVG glyphs. The emoji
// they replaced ("👁" / "×") rendered inconsistently across Windows fonts and
// did not match the mockup's stroke-style icons.
assert.match(dock, /id="hide"/);
assert.match(dock, /id="quit"/);
assert.match(dock, /id="new"/);
assert.doesNotMatch(
  dock,
  /title="Hide dock">👁/,
  'emoji glyphs replaced with SVG icons',
);
// Geist is bundled rather than hotlinked, so an offline launch still renders the
// intended typeface instead of a fallback.
assert.match(dock, /@font-face/);
assert.match(dock, /fonts\/Geist-Variable\.woff2/);
assert.doesNotMatch(dock, /fonts\.googleapis\.com/, 'font must not be fetched from a CDN at runtime');
assert.ok(
  fs.existsSync('fonts/Geist-Variable.woff2'),
  'bundled Geist font must exist in the project',
);

// --- Collapsed edge pills (rejected) ---------------------------------
// The mockup drew coloured pills on the edge while the dock is collapsed.
// Tried and removed: they sit in the left margin and obstruct normal scrolling,
// so nothing is drawn while collapsed. These assertions keep them out.
assert.doesNotMatch(dock, /id="peek"/, 'collapsed edge pills were removed as an obstruction');
assert.doesNotMatch(dock, /\.peek[^{]*\{/, 'no .peek styles');
assert.doesNotMatch(dock, /renderPeek/);
assert.doesNotMatch(main, /pushDockState/);
assert.doesNotMatch(main, /'dock:state'/, 'no dock-state channel needed without pills');
assert.doesNotMatch(preload, /onDockState/);
// The collapsed dock stays a plain sliver at its original width.
assert.match(main, /const hiddenWidth = 10;/);
assert.doesNotMatch(dock, /id="settings"/);
assert.doesNotMatch(dock, /id="pin"/);
assert.match(note, /contenteditable="true"/);
assert.match(note, /body::-webkit-scrollbar/);
assert.match(note, /\.editor::-webkit-scrollbar/);
assert.match(note, /title="Strikethrough" data-cmd="strikeThrough"/);
assert.match(note, /title="Numbered list" data-cmd="insertOrderedList"><svg/);
assert.match(note, /title="Bulleted list" data-cmd="insertUnorderedList"><svg/);
assert.match(note, /title="Align left"/);
assert.match(note, /title="Align center"/);
assert.match(note, /title="Align right"/);
assert.match(main, /resizable: true/);
assert.match(main, /window\.setResizable\(true\)/);
// The note window is frameless and opaque, so the note colour reaches the
// surface through the renderer rather than the native window background. The
// window must still receive the palette it needs to draw its colour dots.
//
// The background must stay OPAQUE. An alpha-0 background without
// `transparent: true` makes Chromium composite an uninitialised (white) region
// over the text, which showed up as a white box and ghosted characters.
assert.match(main, /backgroundColor: '#18181b'/);
assert.doesNotMatch(
  main,
  /backgroundColor: '#00000000'/,
  'an alpha-0 background reintroduces the white-box compositing bug',
);
// thickFrame keeps OS resize hit-testing active on a frameless window, which
// makes every resize drag the most expensive repaint the window performs.
assert.match(main, /thickFrame: false/);
assert.doesNotMatch(main, /thickFrame: true/);
assert.match(main, /palette: palette\.join\(','\)/);
assert.doesNotMatch(main, /setBackgroundColor\(notes\[index\]\.color\)/);
assert.match(note, /style\.setProperty\('--c'/, 'renderer paints the note colour onto the glass');
assert.match(note, /id="dots"/, 'colour dots come from the shared palette');
assert.match(main, /notes:toggle-always-on-top/);
assert.match(note, /id="pinNote"/);
assert.match(note, /Always on top: off/);

// --- Frosted-glass palette and note window ---------------------------
// The palette moved from six flat tab colours to the mockup's five, so notes
// saved with legacy colours must be re-tinted on launch, and only once.
assert.match(
  main,
  /migrateNoteColors\(existing\)/,
  'legacy note colours must be migrated on startup',
);
assert.match(main, /function migrateNoteColors/);
assert.match(
  main,
  /if \(migrateNoteColors\(existing\)\) saveNotes\(existing\)/,
  'migration must only write when something actually changed, so it stays idempotent',
);
assert.match(main, /function nearestPaletteColor/, 'legacy colours map to the nearest new one');
// The palette is passed to the renderer so the dots cannot drift from the
// colours the main process assigns to new notes.
assert.match(main, /palette: palette\.join\(','\)/);
assert.match(note, /params\.get\('palette'\)/);

// --- Editor repaint regressions ---------------------------------------
// The save round-trip broadcasts notes:changed back to this same window. If
// apply() then reassigns editor.innerHTML, the contenteditable is rebuilt
// mid-repaint and the user sees ghosted text that clears seconds later.
// Applying only genuine changes is what keeps typing smooth.
assert.match(
  note,
  /if \(nextContent !== renderedContent\)/,
  'apply() must not rewrite editor.innerHTML when content is unchanged',
);
assert.match(note, /if \(nextTitle !== renderedTitle\)/, 'same guard for the title field');
assert.doesNotMatch(
  note,
  /^\s*editor\.innerHTML = n\.content/m,
  'no unconditional innerHTML assignment in apply()',
);
assert.match(note, /renderedContent = nextContent/, 'tracks what has been rendered');
// innerText forces a synchronous layout flush, so it must not run per keystroke.
assert.match(
  note,
  /function scheduleWordCount\(\)/,
  'word count must be debounced rather than read on every keystroke',
);
assert.match(note, /setTimeout\(countWords, 250\)/);
assert.doesNotMatch(
  note,
  /save\([^)]*\)\s*\{\s*saveState\.textContent[^}]*countWords\(\);/s,
  'save() must not call countWords() directly',
);
assert.match(note, /function markEdited\(\)/, 'saved echo is marked as our own');
assert.match(note, /markEdited\(\);\s*\n\s*await window\.tabbin\.update/, 'mark before update');
assert.equal(pkg.build.productName, 'Tabbin');
assert.ok(!pkg.build.linux);
assert.match(pkg.build.nsis.include, /installer\.nsh/);
console.log('PASS: Tabbin rich-text, drag reorder, transparent dock, native-resizable notes, per-note pinning, and installer configuration');
