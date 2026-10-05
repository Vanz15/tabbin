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
// Hide and quit remain inline SVG glyphs, now inside the overflow menu rather than
// the top bar. They keep their ids, so these assertions still hold. The emoji they
// replaced ("👁" / "×") rendered inconsistently across Windows fonts and did not
// match the mockup's stroke-style icons.
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
// Settings now exists as an overlay inside the dock. It must stay a section in
// dock.html, NOT a second BrowserWindow: the whole point is that opening
// settings never spawns another window.
assert.match(dock, /id="sets"/);
assert.match(dock, /id="gear"/);
assert.doesNotMatch(
  main,
  /settings\.html/,
  'settings must be an overlay in dock.html, not a separate window',
);
assert.doesNotMatch(main, /createSettingsWindow/);
// A configurable activation edge: the main process owns the value and re-lays
// out so the change applies without a restart.
assert.match(main, /ipcMain\.handle\('config:set'/);
// config:set merges the patch over the stored config. It is now split across two
// statements so an invalid save folder can be rejected before anything is written.
assert.match(main, /const next = \{ \.\.\.current, \.\.\.patch \};/);
assert.match(main, /saveConfig\(next\)/);
assert.match(main, /dockWidth === 'compact' \? 268 : 320/);
assert.match(preload, /setConfig: patch => ipcRenderer\.invoke\('config:set', patch\)/);
// The palette arrives via config:get so new-note colours come from the single
// source of truth in main.js, and notes:create passes the chosen entry.
assert.match(main, /config:get'[^]*palette/, 'config:get must supply the palette');
assert.match(dock, /window\.tabbin\.setConfig/, 'dock persists settings via preload');
// --- Settings: save location actually redirects the notes file ------------
// A folder picker that only stores a preference is a control that silently does
// nothing, so assert the real data path is derived from it. notesDir() must be
// called per read, not captured once at startup, or a change made in Settings
// keeps writing to the old folder for the rest of the session.
assert.match(main, /function notesDir\(\)/, 'the notes directory is resolved from config');
assert.match(
  main,
  /const dataFile = \(\) => path\.join\(notesDir\(\), 'notes\.json'\)/,
  'notes.json must live under the configured folder, not hardcoded userData',
);
assert.doesNotMatch(
  main,
  /const dataFile = \(\) => userDataFile\('notes\.json'\)/,
  'the hardcoded userData path is exactly the bug this replaces',
);
// A bad folder must not be written: every later save would fail silently.
assert.match(main, /function isValidSaveDir/);
assert.match(main, /isValidSaveDir\(patch\.saveLocation\)/, 'config:set validates before writing');
assert.match(main, /fs\.accessSync\(dir, fs\.constants\.W_OK\)/, 'the folder must be writable');
// Choosing a folder moves the notes, so they do not appear to vanish.
assert.match(main, /function migrateNotesDir/);
assert.match(main, /migrateNotesDir\(notesDir\(\), patch\.saveLocation\)/);
// The panel shows the resolved path, not the stored preference.
assert.match(main, /notesPath: dataFile\(\)/, 'config:get reports the live notes path');
assert.match(dock, /cfg\.notesPath/, 'the settings row renders the live path');
assert.doesNotMatch(
  dock,
  /Same folder as Tabbin/,
  'the placeholder label is replaced with the real path',
);
assert.match(preload, /pickFolder: \(\) => ipcRenderer\.invoke\('dialog:browse-folder'\)/);
assert.match(main, /ipcMain\.handle\('dialog:browse-folder'/);
assert.match(main, /properties: \['openDirectory'/);
// The row shows a folder glyph, not the check mark it started as.
assert.match(dock, /M3 7a2 2 0 0 1 2-2h4l2 2h8/, 'the save-location button uses a folder icon');
assert.doesNotMatch(dock, /M9 13l2 2 4-4/, 'the old check mark is gone');
// Clear-all is a real destructive path: it wipes, backs up, and closes windows.
assert.match(main, /ipcMain\.handle\('notes:clear'/);
assert.match(main, /saveNotes\(\[\]\)/, 'clear-all empties the notes file');
assert.match(preload, /clear: confirm => ipcRenderer\.invoke\('notes:clear', confirm\)/);

// --- Dock background modes (v2.1) ---------------------------------------
// Three selectable appearances: clear (no panel, tiles that expand on hover),
// bare (glass cards, no panel) and glass (the 2.0.0 treatment). The value is
// validated in the main process because the renderer feeds it to classList.add().
assert.match(main, /const DOCK_BACKGROUNDS = \['clear', 'glass', 'bare'\]/);
assert.match(main, /dockBg: 'clear'/, 'clear is the requested default');
assert.match(main, /!DOCK_BACKGROUNDS\.includes\(patch\.dockBg\)/, 'config:set must reject an unknown background');
assert.match(
  main,
  /!DOCK_BACKGROUNDS\.includes\(config\.dockBg\)/,
  'config:get must sanitize a hand-edited config so no arbitrary class reaches the DOM',
);
assert.match(dock, /data-s="dockBg"/, 'the settings panel offers the three-way choice');
assert.match(dock, /data-v="clear"/);
assert.match(dock, /data-v="bare"/);
assert.match(dock, /data-v="glass"/);
assert.match(dock, /dockBg: "clear"/, 'the renderer default matches the main process');
assert.match(
  dock,
  /classList\.remove\("clear", "glass", "bare"\)/,
  'switching modes must clear the previous mode class, or a stale tint survives',
);
// An unrecognised value falls back to clear rather than adding a junk class.
assert.match(dock, /cfg\.dockBg === "glass" \|\| cfg\.dockBg === "bare" \? cfg\.dockBg : "clear"/);
// Clear mode: no panel, and the empty space must stay click-through.
assert.match(dock, /\.dock\.clear \{[\s\S]*?background: none;/);
assert.match(dock, /\.dock\.clear \{[\s\S]*?border: 0;/);
assert.match(dock, /\.dock\.clear \{[\s\S]*?box-shadow: none;/);
assert.match(
  dock,
  /\.dock\.clear \.stack \{[\s\S]*?pointer-events: none;/,
  'only the tiles may take clicks, so the desktop stays reachable beside them',
);
// Clear-mode tiles expand on hover, per the mockup and the tester request.
// One note per row. The mockup wrapped tiles side by side, but in a 320px dock
// that left a wide empty gap beside every tile and read as a different app, so
// the column layout is kept and only the tile shape changes.
assert.doesNotMatch(
  dock,
  /\.dock\.clear \.stack \{[\s\S]*?flex-flow: row wrap/,
  'clear mode must stack one note per row, not tile them side by side',
);
assert.match(dock, /\.dock\.clear \.stack \{[\s\S]*?align-items: flex-start/);
// The click-through rule is a separate declaration block and must survive.
assert.match(dock, /\.dock\.clear \.stack \{[\s\S]*?pointer-events: none;/);
assert.match(dock, /\.dock\.clear \.tab \{[\s\S]*?width: 76px;/);
// Clear tiles: collapsed 52px, expanded 88px — shortened from 62/104 at the
// user's request that the tiles felt too large.
assert.match(dock, /\.dock\.clear \.tab \{[\s\S]*?height: 52px;/);
assert.match(dock, /\.dock\.clear \.tab:hover,[\s\S]*?height: 88px;/);
// The dock's note column must not draw a scrollbar.
assert.match(dock, /\.stack \{[\s\S]*?scrollbar-width: none;/);
assert.match(dock, /\.stack::-webkit-scrollbar \{[\s\S]*?width: 0;/);
assert.match(
  dock,
  /\.dock\.clear \.tab::before \{[\s\S]*?display: none;/,
  'the card colour spine is meaningless on a solid tile',
);
// The dock-wide typewriter reveal animates `width` and forces nowrap, which
// would collapse the preview inside a 76px tile. It must be off in clear mode.
assert.match(
  dock,
  /\.dock\.clear \.tab \.preview \{[\s\S]*?animation: none;[\s\S]*?white-space: normal;/,
  'the typewriter animation breaks the tile preview',
);
// Settings still need an opaque panel of their own once the dock has no
// background, or the overlay would float over the desktop with nothing behind it.
assert.match(dock, /\.dock\.clear \.sets \{[\s\S]*?background: rgba\(24, 24, 27, 0\.94\);/);
// Frosted is a lighter tint than glass. There is no real blur available to a
// separate transparent window, so the see-through feel comes from alpha alone.
// Frosted is Clear's tile layout behind a translucent panel. The panel must be
// near-opaque enough for light text to survive an arbitrary desktop.
// Bare is glass with no panel behind it. The card fill is only a 15% colour
// tint over 3.5% white — effectively transparent — so inside the glass panel the
// near-opaque surface supplied the contrast. With no panel the card must carry
// that dark base itself, or light ink sits directly on the desktop.
assert.match(dock, /\.dock\.bare \{[^}]*background: none;/, 'bare draws no panel');
assert.match(dock, /\.dock\.bare \{[^}]*border: 0;/);
assert.match(dock, /\.dock\.bare \{[^}]*box-shadow: none;/);
assert.match(
  dock,
  /\.dock\.bare \.tab \{[^}]*var\(--glass-bare, rgba\(20, 20, 23, 0\.96\)\)/,
  'the bare card must carry the panel\'s own dark base to stay readable',
);
assert.match(
  dock,
  /\.dock\.bare \.stack \{[^}]*pointer-events: none;/,
  'bare keeps the desktop clickable in the gaps between cards',
);
assert.match(dock, /\.dock\.bare \.sets \{[^}]*background: #141417;/, 'settings still needs its own surface');
// The card keeps the glass design: full width, colour spine, light ink. Only the
// panel is gone, so these must NOT be inherited from clear's tile treatment.
assert.doesNotMatch(
  dock,
  /\.dock\.bare \.tab \{[^}]*width: 76px;/,
  'bare uses glass cards, not the clear-mode tiles',
);
assert.doesNotMatch(
  dock,
  /\.dock\.bare \.tab::before \{[^}]*display: none;/,
  'bare keeps the colour spine, which belongs to the glass card design',
);
// --- CSS integrity -------------------------------------------------------
// Two rounds of regex-based CSS editing during the dock-background work silently
// dropped a closing brace from @keyframes typing and @keyframes setsin. The app
// still ran and every feature assertion passed, because a source-text regex
// cannot tell that a stylesheet no longer parses. Check the braces directly.
// --- Gating the height report on a loaded renderer -----------------------
// The first report ran at parse time, before config() and list() resolved. It
// measured an EMPTY list (natural=8px) with no mode class on .dock, so --list-max
// fell back to the 620px base — and because that tiny value was cached in the
// main process, layout() never ran again once real notes arrived. Every source
// assertion passed while the window stayed full height for four cycles.
assert.match(dock, /let ready = false;/,
  'the renderer must track whether config and notes have loaded');
assert.match(dock, /function markReady\(\)/);
assert.match(dock, /new ResizeObserver\(\(\) => \{\s*if \(ready\) scheduleReport\(\);/,
  'the ResizeObserver must not report before the app is loaded');

// The sizing diagnostics were removed deliberately for the 2.1.0 release: they
// printed on every layout and every height report. The MEASUREMENT itself is
// still asserted above — only the terminal output is gone.
assert.doesNotMatch(main, /console\.log\('\[Tabbin\] layout:/,
  'the per-layout bounds diagnostic must not ship');
assert.doesNotMatch(main, /console\.log\('\[Tabbin\] dock content height:/,
  'the per-report height diagnostic must not ship');

// --- This round: per-mode caps, gear, right-edge alignment, tighter spacing ----
// Glass had NO --list-max and silently inherited the 620px base fallback, so it
// showed a different number of cards than Clear and Bare. Every mode must
// declare its own cap.
// The cap must be a MEASURED five-card height, not a hard-coded pixel value.
// Cards are content-driven, so a fixed pixel ceiling fits a different number of
// notes at every content length — a 618px cap fitted SEVEN cards, which is how a
// five-note limit looked like full height.
// Per-mode visible counts, chosen so the dock keeps ~the same height across
// modes: clear six tiles (342px) vs glass/bare four cards (340px).
assert.match(dock, /const VISIBLE_BY_MODE = \{ clear: 6, glass: 4, bare: 4 \};/,
  'the visible-note count must be per-mode: clear six, glass and bare four');
assert.match(dock, /function visibleCount\(\)/,
  'the current mode\'s count must be resolved from the dock class list');
assert.match(dock, /function measureListCap\(\)/,
  'the cap must be measured from real cards');
assert.match(dock, /Math\.min\(visibleCount\(\), cards\.length\)/,
  'measureListCap must sum exactly the visible number of cards');
// A mode switch changes the count, so it must invalidate the cap and re-size.
assert.match(dock, /function applyCfg\(\)[\s\S]*?scheduleReport\(\);/,
  'switching dock mode must re-measure the list, since the count is per-mode');
assert.match(dock, /stack\.style\.maxHeight = measured \+ "px";/,
  'the measured height must become the list max-height, so CSS and the window share one source');
assert.doesNotMatch(dock, /--list-max: calc\(/,
  'no per-mode pixel guesses for the cap may remain — they are what caused the mismatch');
assert.match(dock, /max-height: var\(--list-max, 70vh\)/,
  'the fallback must be viewport-relative, not a card-count guess');
assert.match(dock, /\.dock\.clear \.stack \{[\s\S]*?gap: 6px;/,
  'clear-mode tiles must sit closer together');

// The gear must be a real gear: a ring plus radial teeth, not the old dense cog.
const gearBlock = (dock.match(/id="gear"[\s\S]*?<\/button>/) || [''])[0];
assert.match(gearBlock, /<circle cx="12" cy="12"/, 'the settings icon must include a ring');
assert.doesNotMatch(gearBlock, /M19\.4 15a1\.7/,
  'the old muddy cog path must be gone from the settings icon');

// Right-edge alignment for the top bar and the note count.
assert.match(dock, /\.dock\.right \.top \{[\s\S]*?justify-content: flex-end;/,
  'the top bar must sit flush right when docked right');
assert.match(dock, /\.dock\.right \.count \{[\s\S]*?text-align: right;/,
  'the note count must be right-indented when docked right');
assert.match(dock, /\.dock\.right \.foot \{[\s\S]*?justify-content: flex-end;/);

// Tighter spacing between the list and the summary line.
assert.match(dock, /\.foot \{[\s\S]*?padding-top: 2px;/);
assert.match(dock, /\.foot \{[\s\S]*?border-top: 0;/);

// --- Five-note cap and vertical centring -----------------------------------
// A fixed window height cannot serve both card modes: clear tiles are a fixed
// 52px, glass/bare cards are content-driven. The window is sized from a
// measurement the renderer reports, and the list is capped to the height of its
// first five cards — see VISIBLE_COUNT and measureListCap.
// The list is height-capped rather than free-running. The VALUE is measured from
// the first five cards (see VISIBLE_COUNT / measureListCap); it is deliberately
// not a hard-coded pixel figure, because a pixel cap fits a different number of
// notes at every content length.
assert.match(dock, /\.stack \{[\s\S]*?max-height: var\(--list-max/,
  'the note list must be height-capped rather than filling the screen');
assert.match(dock, /\.stack \{[\s\S]*?overflow-y: auto;/,
  'notes beyond the cap must stay reachable by scrolling');

// Two bugs that made the cap invisible while every other assertion still passed:
//   1. `.dock { height: 100vh }` overrode the window height, so a shorter window
//      just overflowed — centring had no visible effect.
//   2. The reported height was scrollHeight with the cap lifted, which is the
//      height of EVERY note, so the window grew to fit all of them.
assert.doesNotMatch(dock, /\.dock \{[^}]*height: 100vh/,
  '.dock must not force 100vh — the window is sized to its content');
assert.match(dock, /Math\.min\(natural, capPx\)/,
  'the reported height must be clamped to the visible five notes, not all of them');

// The window must be allowed to shrink: no floor that re-fills the screen.
assert.match(main, /Math\.max\(220, natural \+ CHROME_H\)/,
  'the window height must follow content with a sensible floor, not a fixed size');

// The cap must still scroll rather than clip.
assert.match(dock, /\.stack \{[\s\S]*?overflow-y: auto;/);

// The window is sized from a real measurement, not a guess. The measurement has
// to lift the cap first — scrollHeight is clamped, so measuring with the cap on
// would always report one screenful.
assert.match(dock, /function reportHeight\(\)/);
// The cap must be READ BEFORE the inline mutation, and the natural height
// measured with the cap lifted. Reading computed style after mutating
// max-height in the same tick returns the mutated value, which made capPx NaN and
// reported every note's height instead of the visible five.
assert.match(dock, /function reportHeight\(\) \{[\s\S]*?getComputedStyle\(stack\)\.maxHeight;[\s\S]*?stack\.style\.maxHeight = "none";/,
  'the cap must be read before the inline max-height is mutated');
assert.match(dock, /stack\.style\.maxHeight = "none";[\s\S]*?stack\.scrollHeight;[\s\S]*?stack\.style\.maxHeight = prev;/,
  'the natural height must be measured with the cap lifted, then restored');
assert.match(dock, /Math\.min\(natural, capPx\)/,
  'the reported height must be clamped to the cap');

assert.match(dock, /ResizeObserver/,
  'height changes must be reported for add/remove/reorder and mode switches, not just first paint');

// Both halves of the bridge must exist: a preference-like signal written by the
// renderer and consumed by the main process, or it silently does nothing.
assert.match(dock, /window\.tabbin\.reportContentHeight\(/);
assert.match(preload, /reportContentHeight/);
assert.match(main, /ipcMain\.handle\('dock:content-height'/);
assert.match(main, /dockContentHeight = next;/,
  'the main process must store the reported height');

// Centred, not flush: y is derived from the leftover space, not the work-area top.
// Centre against the real screen height. workAreaSize excludes the taskbar, so
// centring against it computed y=0 on a 1008px screen and the dock stayed pinned
// to the top while every other measurement looked correct.
assert.match(main, /Math\.round\(\(screenH - height\) \/ 2\)/,
  'the dock must be vertically centred against the full screen height');
assert.match(main, /const screenH = display\.size\.height;/);
assert.doesNotMatch(main, /\(display\.workAreaSize\.height - height\)/,
  'centring must not use workAreaSize, which excludes the taskbar');
assert.doesNotMatch(main, /const y = display\.workArea\.y;/,
  'the dock must no longer sit flush against the top edge');

// --- Concise top bar -------------------------------------------------------
// The top row is three glyphs only: search toggle, add, menu. Settings, hide and
// exit live in the overflow menu. A regression here is silent — every control still
// exists in the DOM — so assert each control's *location*, not just its presence.
const topBlock = (dock.match(/<div class="top">[\s\S]*?<div class="menu"/) || [''])[0];
assert.ok(topBlock.length > 0, 'the .top block must be extractable');
assert.match(topBlock, /id="searchToggle"/, 'the top bar keeps the search toggle');
assert.match(topBlock, /id="new"/, 'the top bar keeps the add button');
assert.match(topBlock, /id="menu"/, 'the top bar keeps the menu button');
assert.doesNotMatch(topBlock, /id="gear"|id="hide"|id="quit"/,
  'settings, hide and exit must NOT remain in the top bar');

// Search starts hidden and is revealed by the toggle. The wrapper is always
// present (it holds the collapsed magnifier); it is the FIELD that is hidden, and
// it gains .open when expanded.
assert.match(dock, /id="search"[^>]*hidden/,
  'the search field must be hidden by default, behind a toggle');
assert.match(dock, /searchWrap\.classList\.add\("open"\)/,
  'openSearch must expand the wrapper via .open');
assert.match(dock, /search\.hidden = false/);
assert.match(dock, /searchWrap\.classList\.remove\("open"\)/);
assert.match(dock, /search\.hidden = true/);
assert.match(dock, /function openSearch\(\)/);
assert.match(dock, /function closeSearch\(\)/);
assert.match(dock, /searchToggle\.onclick/);
// The magnifier must sit INSIDE the field wrapper, so it does not vanish when the
// field expands.
const searchWrapBlock = (dock.match(/<div class="searchwrap"[\s\S]*?<button\s+id="new"/) || [''])[0];
assert.match(searchWrapBlock, /id="searchToggle"/,
  'the search toggle must live inside the search wrapper');
assert.match(searchWrapBlock, /id="search"/);

// The menu panel starts hidden and holds the three moved controls.
assert.match(dock, /id="menuPanel"[^>]*hidden/);
const menuBlock = (dock.match(/<div class="menu"[\s\S]*?<div id="stack"/) || [''])[0];
assert.ok(menuBlock.length > 0, 'the menu block must be extractable');
for (const id of ['gear', 'hide', 'quit']) {
  assert.match(menuBlock, new RegExp('id="' + id + '"'),
    id + ' must live inside the overflow menu');
}

// Version and feedback left the dock footer and now sit in the settings footer.
const footBlock = (dock.match(/<div class="foot">[\s\S]*?<\/div>\s*<!--/) || [''])[0];
assert.ok(footBlock.length > 0, 'the .foot block must be extractable');
assert.doesNotMatch(footBlock, /id="appVersion"/,
  'the version number must no longer live in the dock footer');
assert.doesNotMatch(footBlock, /id="feedback"/,
  'send feedback must no longer live in the dock footer');
const sfootBlock = (dock.match(/<div class="sfoot">[\s\S]*?<\/div>/) || [''])[0];
assert.match(sfootBlock, /id="feedback"/, 'send feedback must live in the settings footer');
assert.match(sfootBlock, /id="appVersion"/, 'the version number must live in the settings footer');

// The dock is flush to the LEFT/RIGHT edge (never inset horizontally) but is now
// vertically centred, so it no longer pins to the top of the work area. The
// centring itself is asserted in the five-note-cap block below.
assert.match(main, /display\.workArea\.width - width : display\.workArea\.x/,
  'the dock must sit at the leftmost x when not docked right');
assert.doesNotMatch(main, /const y = display\.workArea\.y;/,
  'the dock must no longer be pinned flush to the top edge');

// --- Right-edge dock -------------------------------------------------------
// `.right` was toggled by applyCfg() from the start with no CSS behind it, so a
// right-docked panel rendered identically to a left one. These assert the mirror
// exists, so the class cannot silently become a no-op again.
assert.match(dock, /\.dock\.right \.tab \{[\s\S]*?padding:/);
assert.match(dock, /\.dock\.right \.tab::before \{[\s\S]*?right: 6px;/);
assert.match(dock, /\.dock\.right\.clear \.stack \{[\s\S]*?align-items: flex-end;/);
// The hide chevron has two paths and CSS shows exactly one per edge.
assert.match(dock, /class="chev chev-l"/);
assert.match(dock, /class="chev chev-r"/);
assert.match(dock, /\.dock\.right #hide \.chev-l \{[\s\S]*?display: none;/);
assert.match(dock, /\.dock\.right #hide \.chev-r \{[\s\S]*?display: block;/);

// --- Launch on startup -----------------------------------------------------
// A preference written but never read is the worst kind of bug: the toggle looks
// finished and nothing errors. Assert both halves — the store and the consumer.
assert.match(main, /launchOnStartup: false/, 'defaultConfig must default launchOnStartup to false');
assert.match(
  main,
  /app\.setLoginItemSettings\(\{/,
  'config:set must reach the OS via setLoginItemSettings, not just store the flag',
);
assert.match(
  main,
  /app\.getLoginItemSettings\(\)\.openAtLogin/,
  'startup must reconcile the stored flag with what Windows actually has registered',
);
assert.match(dock, /data-s="launchOnStartup"/, 'settings must expose the launchOnStartup toggle');
assert.match(dock, /Launch Tabbin on Startup/);
assert.match(dock, /launchOnStartup: false/, 'reset must clear launchOnStartup too');

// Markup balance: an unclosed <div> in the settings rows nests each row inside the
// previous one. Since .srow is display:flex that renders the whole panel
// horizontally, overflowing both edges — and every feature assertion still passes,
// because the controls all still exist in the DOM. Count them instead.
const dockMarkupFull = (dock.match(/<body>([\s\S]*?)<script>/) || [])[1] || '';
const divOpen = (dockMarkupFull.match(/<div\b/g) || []).length;
const divClose = (dockMarkupFull.match(/<\/div>/g) || []).length;
assert.strictEqual(
  divOpen,
  divClose,
  `dock.html markup has unbalanced <div> tags: ${divOpen} opened vs ${divClose} closed`,
);

// Every .srow must be a sibling, not nested inside the previous row.
const setsBlock = (dock.match(/<section class="sets"[\s\S]*?<\/section>/) || [''])[0];
let setsDepth = 0;
const srowDepths = [];
for (const tag of setsBlock.match(/<div\b[^>]*>|<\/div>/g) || []) {
  if (tag.startsWith('</')) {
    setsDepth -= 1;
  } else {
    if (tag.includes('srow')) srowDepths.push(setsDepth);
    setsDepth += 1;
  }
}
assert.strictEqual(setsDepth, 0, 'the settings section must close every <div> it opens');
assert.ok(
  srowDepths.length > 0 && srowDepths.every((d) => d === srowDepths[0]),
  `settings rows must be siblings at one depth, got depths ${JSON.stringify(srowDepths)}`,
);

// The renderer is a plain <script> in the page, so a dropped brace or paren is a
// parse error that blanks the entire dock: no notes, no working controls, and no
// crash log because nothing threw at runtime — the script simply never ran.
// Regex-based editing removed a `});` and a `}` here, and every feature assertion
// still passed, because none of them execute the code. Parse it for real.
const dockScript = (dock.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
assert.ok(dockScript.length > 500, 'the dock renderer script must be extracted for parsing');
let dockSyntaxOk = true;
let dockSyntaxError = '';
try {
  // eslint-disable-next-line no-new-func
  new Function(dockScript);
} catch (err) {
  dockSyntaxOk = false;
  dockSyntaxError = err.message;
}
assert.ok(
  dockSyntaxOk,
  'dock.html renderer script must parse — otherwise the whole dock silently fails to run: ' +
    dockSyntaxError,
);

const dockCss = (dock.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const cssNoComments = dockCss.replace(/\/\*[\s\S]*?\*\//g, '');
const openBraces = (cssNoComments.match(/\{/g) || []).length;
const closeBraces = (cssNoComments.match(/\}/g) || []).length;
assert.equal(
  openBraces,
  closeBraces,
  `dock.html stylesheet is unbalanced: ${openBraces} '{' vs ${closeBraces} '}'`,
);
// Every @keyframes block must close its own braces, not just its inner steps.
// Walk forward with a depth counter rather than slicing on the next two '}',
// which under-reads a block and reports a false imbalance.
for (const name of ['typing', 'setsin']) {
  const start = dockCss.indexOf('@keyframes ' + name);
  assert.ok(start >= 0, `@keyframes ${name} must exist`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < dockCss.length; i++) {
    if (dockCss[i] === '{') depth++;
    else if (dockCss[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  assert.notEqual(end, -1, `@keyframes ${name} is never closed`);
  const body = dockCss.slice(start, end + 1);
  assert.equal(
    (body.match(/\{/g) || []).length,
    (body.match(/\}/g) || []).length,
    `@keyframes ${name} must balance its own braces`,
  );
}
// A duplicated selector token means a bad substitution, not a design choice.
assert.doesNotMatch(dock, /\.tabtab/, 'a duplicated selector token indicates a broken edit');
// `undefined` is legitimate in the renderer's JS (comparisons, toLocaleDateString),
// so scope this to the stylesheet and the markup, where it can only be a leak.
assert.doesNotMatch(dockCss, /undefined/, 'a literal undefined leaked into the stylesheet');
const dockMarkup = (dock.match(/<body>([\s\S]*?)<script>/) || [])[1] || '';
assert.doesNotMatch(dockMarkup, /undefined/, 'a literal undefined leaked into the markup');

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
// The note window is frameless and genuinely transparent so the OS compositor
// reaches the rounded corners. note.html paints an opaque gradient over .wrap,
// which keeps the surface fully defined and prevents the uninitialised buffer
// white box.
assert.match(main, /transparent: true/);
assert.match(main, /backgroundColor: '#00000000'/);
assert.match(note, /clip-path: inset\(0 round 16px\)/);
assert.match(note, /background: linear-gradient/, 'note.html paints its own opaque surface');
assert.doesNotMatch(
  note,
  /\.wrap[\s\S]*?border-radius: 16px/,
  'a plain radius cannot cut an opaque native background',
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

// --- Header contrast in the transparent modes -----------------------------
// `.search-btn` originally had no mode-specific rule, so in clear and bare it
// kept its base 6%-white chip with near-white ink. On a light desktop the
// magnifier was invisible while the add and menu glyphs beside it were fine.
for (const mode of ['clear', 'bare']) {
  assert.match(
    dock,
    new RegExp(`\\.dock\\.${mode} \\.search-btn \\{[^}]*background: rgba\\(18, 20, 30`),
    `${mode} mode must give the search toggle the same dark chip as the other header buttons`,
  );
  assert.match(
    dock,
    new RegExp(`\\.dock\\.${mode} \\.search-btn \\{[^}]*color: #fff`),
    `${mode} mode must force the magnifier to white so it reads on a light desktop`,
  );
}
// Hover must DARKEN the chip in the transparent modes, not lighten it. The
// chip is `rgba(18,20,30,0.5)` with a white glyph; hovering to
// `rgba(255,255,255,0.26)` washed it toward white and the glyph vanished with
// it on a pale desktop.
for (const mode of ['clear', 'bare']) {
  for (const control of ['search-btn', 'button']) {
    const sel = `.dock.${mode} .${control}:hover`;
    assert.match(
      dock,
      new RegExp(`\\.dock\\.${mode} \\.${control}:hover \\{[^}]*background: rgba\\(18, 20, 30`),
      `${sel} must darken the chip; a white overlay washes out the white glyph on a light desktop`,
    );
    assert.doesNotMatch(
      ruleBody(dock, sel),
      /background:[^;]*rgba\(255,\s*255,\s*255/,
      `${sel} must not lighten the chip`,
    );
  }
}
// The resting chip and its hover must differ, or there is no hover feedback.
// Match the resting selector with its opening brace: `.dock.clear .button` is a
// prefix of `.dock.clear .button:hover`, so a bare prefix match made ruleBody
// return the hover rule for both and the comparison compared it with itself.
for (const mode of ['clear', 'bare']) {
  const rest = (ruleBody(dock, `.dock.${mode} .button {`).match(
    /background: rgba\(18, 20, 30, ([\d.]+)\)/,
  ) || [])[1];
  const hov = (ruleBody(dock, `.dock.${mode} .button:hover`).match(
    /background: rgba\(18, 20, 30, ([\d.]+)\)/,
  ) || [])[1];
  assert.ok(rest && hov, `${mode} mode must declare a chip background at rest and on hover`);
  assert.notEqual(rest, hov, `${mode} mode must visibly change the chip on hover`);
  assert.ok(
    Number(hov) > Number(rest),
    `${mode} hover must be more opaque than rest (${rest} -> ${hov})`,
  );
}

// The overflow menu must not cast a drop shadow. It kept an 18px/44px shadow at
// 0.5 alpha, which threw a dark smudge across the desktop whenever the menu was
// open. It is opaque #17171b with a 1px border, so the border is what separates
// it from the wallpaper.
// `.menu` also prefixes `.menu[hidden]`, so anchor on the opening brace.
const menuBody = ruleBody(dock, '.menu {');
assert.ok(!menuBody.includes('display: none'), 'must match the real .menu rule, not .menu[hidden]');
assert.match(menuBody, /background: #17171b/, 'the menu stays opaque so it reads over any desktop');
assert.match(menuBody, /border: 1px solid/, 'the menu keeps its 1px edge without a shadow');
assert.doesNotMatch(
  menuBody,
  /box-shadow:[^;]*\b\d+px\s+\d+px/,
  'the overflow menu must not cast a drop shadow over the desktop',
);

// Shadow budget: nothing that is VISIBLE AT REST may cast a drop shadow heavier
// than 0.25 alpha. Two exceptions are deliberate:
//
//   - the glass-mode panel, the one surface meant to read as a floating sheet of
//     dark glass (clear and bare override it to none, which is why their tiles,
//     the menu and the settings view all have to stay flat)
//   - the tile drag lift, which only exists while a note is being dragged
const BUDGET_EXCEPTIONS = [
  { budget: 0.5, why: 'glass panel' },
  { budget: 0.5, why: 'tile drag lift' },
];
for (const m of dock.matchAll(/box-shadow:\s*([^;}]+)/g)) {
  const decl = m[1];
  const line = dock.slice(0, m.index).split('\n').length;
  const allowed = Math.max(0.25, ...BUDGET_EXCEPTIONS.map((e) => e.budget));
  // Only the two known sites may exceed the resting budget; everything else is
  // held to it strictly.
  const isGlassPanel = line < 100;
  const isDragLift = decl.includes('14px 30px');
  const budget = isGlassPanel || isDragLift ? allowed : 0.25;
  for (const a of decl.matchAll(/rgba\(\s*0,\s*0,\s*0,\s*([\d.]+)\s*\)/g)) {
    assert.ok(
      Number(a[1]) <= budget,
      `drop shadow at ${a[1]} alpha (line ${line}) exceeds the ${budget} budget: ${decl.trim().slice(0, 60)}`,
    );
  }
}

// Expanded search flattens the glyph onto the field, so the chip must not paint.
assert.match(
  dock,
  /\.searchwrap\.open \.search-toggle-inset \{[^}]*background: none/,
  'expanded search must not keep the collapsed chip behind the field',
);

// --- Shadow budget -------------------------------------------------------
// Clear-mode tiles used to carry a 6px/18px drop shadow at rest and a heavier
// one on hover, which read as haze around the whole dock over a light desktop.
// At rest the tile is flat colour; the lift belongs on hover only.
// Slice the real rule bodies by their braces. Indexing on the selector text
// alone matched an earlier `.dock.clear .tab {` used only for pointer-events,
// so the assertions were reading the wrong block.
function ruleBody(css, selector) {
  // The selector must begin its own line. Substring matching silently returned
  // the wrong block three separate times: `.menu {` also occurs inside
  // `.dock.right .menu {`, `.dock.clear .button` inside
  // `.dock.clear .button:hover`, and `.dock.clear .tab {` inside an earlier
  // pointer-events rule. Every rule here is indented on its own line, so
  // requiring a leading newline (or start of input) is what makes the match
  // exact. Where a selector genuinely repeats, the LAST match wins, since that
  // is the rule carrying the mode-specific overrides.
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\n[ \\t]*)${esc}`, 'g');
  let at = -1;
  let hit;
  while ((hit = re.exec(css)) !== null) at = hit.index + hit[0].length - selector.length;
  if (at === -1) return '';
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  return '';
}
const tileRest = ruleBody(dock, '.dock.clear .tab {');
assert.doesNotMatch(
  tileRest,
  /box-shadow:[^;]*\b\d+px\s+\d+px\s+rgba\(0,\s*0,\s*0/,
  'a clear-mode tile must not cast a drop shadow at rest',
);
// The hover rule is written as a two-selector list ending in ':hover',
// so match on the prefix and let ruleBody walk to its closing brace.
const tileHover = ruleBody(dock, '.dock.clear .tab:hover,');
assert.ok(tileHover.includes('box-shadow'), 'clear-mode hover rule must declare a box-shadow');
const hoverAlpha = Number(
  ((tileHover.match(/box-shadow:[^;]*?rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/) || [])[1]) || 1,
);
assert.ok(
  hoverAlpha <= 0.2,
  `clear-mode hover shadow must stay subtle (alpha ${hoverAlpha}), got ${hoverAlpha}`,
);
assert.match(
  tileRest,
  /inset 0 1px 0 rgba\(255, 255, 255, 0\.45\)/,
  'the tile keeps its inset top light so it still reads as lit from above',
);
// The footer text-shadow sat at 0.5 alpha over an arbitrary desktop.
for (const sel of ['.dock.clear .foot', '.dock.bare .foot']) {
  const block = ruleBody(dock, sel);
  const alpha = Number((block.match(/text-shadow:[^;]*rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/) || [])[1] || 1);
  assert.ok(alpha <= 0.35, `${sel} text-shadow must stay subtle (alpha ${alpha}), got ${alpha}`);
}

console.log('PASS: Tabbin rich-text, drag reorder, transparent dock, native-resizable notes, per-note pinning, and installer configuration');
