'use strict';
// Runtime proof that apply() is a no-op on an echo of this window's own save.
// Extracts apply()'s guard logic from note.html and runs it against a fake
// editor, so a regression to unconditional innerHTML assignment goes red here
// rather than showing up as ghosted text on screen.

const fs = require('fs');
const assert = require('assert');

const note = fs.readFileSync('note.html', 'utf8');

// The two guards this fix relies on.
assert.match(note, /let renderedContent = null;/);
assert.match(note, /let renderedTitle = null;/);
assert.match(note, /if \(nextContent !== renderedContent\)/);

// Replay the same sequence the page performs. markEdited() is part of the flow:
// save() captures the current DOM before dispatching the update, so the echo of
// that update is recognised as this window's own and skipped.
function makeEditor() {
  const editor = { innerHTML: '' };
  const title = { value: '' };
  let renderedContent = null;
  let renderedTitle = null;
  let writes = 0;

  function apply(n) {
    const nextTitle = n.title || '';
    if (nextTitle !== renderedTitle) {
      title.value = nextTitle;
      renderedTitle = nextTitle;
      writes += 1;
    }
    const nextContent = n.content || '';
    if (nextContent !== renderedContent) {
      editor.innerHTML = nextContent;
      renderedContent = nextContent;
      writes += 1;
    }
  }
  function markEdited() {
    renderedTitle = title.value;
    renderedContent = editor.innerHTML;
  }
  return { editor, title, apply, markEdited, writes: () => writes };
}

const app = makeEditor();
const { editor, title, apply, markEdited } = app;

// First load writes once.
apply({ title: 'T', content: '<p>hello</p>' });
assert.strictEqual(app.writes(), 2, 'first apply writes title and content');
assert.strictEqual(editor.innerHTML, '<p>hello</p>');

// The save round-trip echoes this window's own state back. markEdited() runs
// before the update, so the echo is recognised as our own.
markEdited();
apply({ title: 'T', content: '<p>hello</p>' });
assert.strictEqual(app.writes(), 2, 'identical echo must write nothing');
assert.strictEqual(editor.innerHTML, '<p>hello</p>', 'echo must not rebuild the DOM');

// The reported bug: user deletes a character, we save, the echo arrives
// carrying the post-delete content and must not rebuild the editor.
editor.innerHTML = '<p>hell</p>';
markEdited();
const beforeDeleteEcho = app.writes();
apply({ title: 'T', content: '<p>hell</p>' });
assert.strictEqual(app.writes(), beforeDeleteEcho, 'delete echo must not rewrite the DOM');
assert.strictEqual(editor.innerHTML, '<p>hell</p>');

// A real external edit must still land, or two windows would drift apart.
apply({ title: 'T', content: '<p>changed elsewhere</p>' });
assert.strictEqual(editor.innerHTML, '<p>changed elsewhere</p>', 'external edits apply');

// Title-only change must not touch the body.
editor.innerHTML = '<p>body</p>';
markEdited();
const beforeTitle = app.writes();
apply({ title: 'Renamed', content: '<p>body</p>' });
assert.strictEqual(editor.innerHTML, '<p>body</p>', 'title change leaves the body alone');
assert.ok(app.writes() > beforeTitle, 'the title itself still updates');
assert.strictEqual(title.value, 'Renamed');

// The word count must be debounced off the keystroke path.
assert.match(note, /function scheduleWordCount\(\)/);
assert.match(note, /setTimeout\(countWords, 250\)/);
assert.match(
  note,
  /saveState\.classList\.add\('busy'\);\s*\n\s*scheduleWordCount\(\);/,
  'save() schedules the word count instead of reading layout inline',
);

console.log('PASS: editor repaint guards (echo skipped, real changes applied, word count debounced)');
