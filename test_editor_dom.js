const assert = require('assert');
const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

const note = {
  id: 'editor-dom-test',
  title: 'Editor test note',
  content: '',
  color: '#F2A38F',
  alwaysOnTop: false,
};
let createCalls = 0;
let updateCalls = 0;
let fullScreenState = false;
const windows = [];

ipcMain.handle('test:get', () => ({ ...note }));
ipcMain.handle('test:update', (_, patch) => {
  updateCalls += 1;
  return Object.assign(note, patch);
});
ipcMain.handle('test:toggle-pin', () => {
  note.alwaysOnTop = !note.alwaysOnTop;
  return { ...note };
});
ipcMain.handle('test:create', () => {
  createCalls += 1;
  return { id: `created-${createCalls}` };
});
ipcMain.handle('test:toggle-fullscreen', () => {
  fullScreenState = !fullScreenState;
  return fullScreenState;
});
ipcMain.handle('test:remove', () => true);
// Mirrors main.js's real rejection shape. Thrown from the main process so the
// error crosses a genuine IPC boundary before the renderer sees it.
ipcMain.handle('test:update-missing', () => {
  throw new Error(`NOTE_MISSING: cannot update ${note.id}`);
});
ipcMain.handle('test:broadcast', (_, notes) => {
  for (const window of windows) {
    if (!window.isDestroyed()) window.webContents.send('test:changed', notes);
  }
  return true;
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(description, read, timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await read();
    if (value) return value;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function openNote(bg) {
  const window = new BrowserWindow({
    show: false,
    width: 520,
    height: 500,
    webPreferences: {
      preload: path.join(__dirname, 'test_editor_dom_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  windows.push(window);
  await window.loadFile(path.join(__dirname, 'note.html'), {
    query: {
      id: note.id,
      palette: '#F2A38F,#9CCFA5,#8EC5E8,#F0D58A,#B9A7E8',
      bg,
    },
  });
  await window.webContents.insertCSS('*, *::before, *::after { transition: none !important; }');
  window.focus();
  window.webContents.focus();
  await waitFor('note data to load', () => window.webContents.executeJavaScript(
    `document.querySelector('#title').value === ${JSON.stringify(note.title)}`,
  ));
  return window;
}

function press(window, keyCode) {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode });
}

async function enterText(window, text, initialHtml = '') {
  await window.webContents.executeJavaScript(`(() => {
    const editor = document.querySelector('#editor');
    editor.innerHTML = ${JSON.stringify(initialHtml)};
    editor.focus();
    const target = editor.querySelector('li') || editor;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  })()`);
  for (const character of text) {
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: character });
    window.webContents.sendInputEvent({ type: 'char', keyCode: character });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: character });
  }
  await delay(50);
  return window.webContents.executeJavaScript("document.querySelector('#editor').innerHTML");
}

function luminance(rgb) {
  const linear = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function hexRgb(value) {
  return value.match(/[\da-f]{2}/gi).slice(-3).map((part) => parseInt(part, 16));
}

async function main() {
  await app.whenReady();
  try {
    const glass = await openNote('glass');

    const header = await glass.webContents.executeJavaScript(`({
      documentTitle: document.title,
      visibleTitle: document.querySelector('#windowTitle').textContent.trim(),
    })`);
    assert.strictEqual(header.documentTitle, 'Tabbin Notes');
    assert.strictEqual(header.visibleTitle, 'Tabbin Notes');
    const initialSaveState = await glass.webContents.executeJavaScript(`({
      text: document.querySelector('#saveState').textContent,
      indicator: getComputedStyle(document.querySelector('#saveState'), '::before').content,
    })`);
    assert.strictEqual(initialSaveState.text, 'Saved.');
    assert.strictEqual(initialSaveState.indicator, 'none', 'save status uses text only, with no dot indicator');

    await enterText(glass, '1. ');
    const ordered = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      const item = editor.querySelector('ol > li');
      return { exists: !!item, text: item && item.textContent, html: editor.innerHTML };
    })()`);
    assert.ok(ordered.exists, `"1. " should create an ordered list; got ${ordered.html}`);
    assert.strictEqual(ordered.text, '', `typed "1. " must be consumed, not doubled: ${ordered.html}`);

    await enterText(glass, '- ');
    const bullet = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      const item = editor.querySelector('ul > li');
      return { exists: !!item, text: item && item.textContent, html: editor.innerHTML };
    })()`);
    assert.ok(bullet.exists, `"- " should create a bullet list; got ${bullet.html}`);
    assert.strictEqual(bullet.text, '', `typed "- " must be consumed, not doubled: ${bullet.html}`);

    await enterText(glass, 'buy milk - ');
    const midLine = await glass.webContents.executeJavaScript(`({
      lists: document.querySelectorAll('#editor ul, #editor ol').length,
      text: document.querySelector('#editor').innerText,
    })`);
    assert.strictEqual(midLine.lists, 0, 'a marker after existing text must not convert the block');
    assert.strictEqual(midLine.text, 'buy milk - ', 'mid-line marker text must remain unchanged');

    await enterText(glass, '- ', '<ul><li></li></ul>');
    const nested = await glass.webContents.executeJavaScript(`({
      lists: document.querySelectorAll('#editor ul').length,
      nestedLists: document.querySelectorAll('#editor li ul, #editor li ol').length,
    })`);
    assert.strictEqual(nested.lists, 1, 'a marker inside a list must not create another list');
    assert.strictEqual(nested.nestedLists, 0, 'a marker inside a list must not nest a list');

    // To-do items: the toolbar button, the "[] " trigger, and checking an item
    // (sink to the bottom, strike through, stay put when unchecked).
    const todoFromToolbar = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = '<p>buy milk</p>';
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor.querySelector('p'));
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.querySelector('#todoBtn').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
      const item = editor.querySelector('li.todo');
      return {
        exists: !!item,
        tick: !!(item && item.querySelector('.tick')),
        spacer: !!(item && item.querySelector('.tick-space')),
        text: item ? item.textContent.trim() : '',
        html: editor.innerHTML,
      };
    })()`);
    assert.ok(todoFromToolbar.exists, `the toolbar must create a to-do item: ${todoFromToolbar.html}`);
    assert.ok(todoFromToolbar.tick, `a to-do item must carry a tick: ${todoFromToolbar.html}`);
    assert.ok(todoFromToolbar.spacer, `a to-do item must carry its zero-width caret anchor: ${todoFromToolbar.html}`);
    assert.strictEqual(todoFromToolbar.text, 'buy milk', 'the to-do text must survive conversion');

    const todoOff = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.focus();
      const item = editor.querySelector('li.todo');
      const range = document.createRange();
      range.selectNodeContents(item);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.querySelector('#todoBtn').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
      return {
        lists: editor.querySelectorAll('ul,ol').length,
        todos: editor.querySelectorAll('li.todo').length,
        paragraphs: editor.querySelectorAll('p').length,
        text: editor.textContent.trim(),
        html: editor.innerHTML,
      };
    })()`);
    assert.strictEqual(todoOff.lists, 0, `re-clicking must leave the list: ${todoOff.html}`);
    assert.strictEqual(todoOff.todos, 0, `re-clicking must remove the to-do: ${todoOff.html}`);
    assert.strictEqual(todoOff.paragraphs, 1, `re-clicking must leave one paragraph: ${todoOff.html}`);
    assert.strictEqual(todoOff.text, 'buy milk', 're-clicking must keep the text');

    const boundaryCaret = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = '<ul><li>task</li></ul>';
      editor.focus();
      const item = editor.querySelector('li');
      const range = document.createRange();
      range.setStart(item, 0);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.querySelector('#todoBtn').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
      const after = window.getSelection();
      return {
        html: editor.innerHTML,
        textCaret: after.anchorNode.nodeType === Node.TEXT_NODE,
        offset: after.anchorOffset,
      };
    })()`);
    assert.ok(boundaryCaret.textCaret, `a boundary caret must move into the item text: ${boundaryCaret.html}`);
    assert.strictEqual(boundaryCaret.offset, 0, 'the caret must land at the start of the item text');

    // The same boundary state can arrive from other paths (undo, gutter click),
    // so the selection watcher corrects it without any button press.
    await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = '<ul><li class="todo" data-done="false">'
        + '<button class="tick" contenteditable="false" tabindex="-1" aria-pressed="false"></button>task</li></ul>';
      editor.focus();
      const item = editor.querySelector('li.todo');
      const range = document.createRange();
      range.setStart(item, 0);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    })()`);
    await delay(80);
    const guardResult = await glass.webContents.executeJavaScript(`(() => {
      const selection = window.getSelection();
      return {
        textCaret: selection.anchorNode.nodeType === Node.TEXT_NODE,
        offset: selection.anchorOffset,
      };
    })()`);
    assert.ok(guardResult.textCaret, 'a boundary caret must be moved into the item text automatically');
    assert.strictEqual(guardResult.offset, 0);

    await enterText(glass, '[] ');
    const todoTrigger = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      const item = editor.querySelector('li.todo');
      return { exists: !!item, text: item ? item.textContent.trim() : '', html: editor.innerHTML };
    })()`);
    assert.ok(todoTrigger.exists, `"[] " should create a to-do item; got ${todoTrigger.html}`);
    assert.strictEqual(todoTrigger.text, '', `typed "[] " must be consumed: ${todoTrigger.html}`);

    for (const character of 'buy') {
      glass.webContents.sendInputEvent({ type: 'keyDown', keyCode: character });
      glass.webContents.sendInputEvent({ type: 'char', keyCode: character });
      glass.webContents.sendInputEvent({ type: 'keyUp', keyCode: character });
    }
    await delay(50);
    const todoTyped = await glass.webContents.executeJavaScript(`(() => {
      const item = document.querySelector('#editor li.todo');
      return {
        html: document.querySelector('#editor').innerHTML,
        text: item.textContent.trim(),
        tickFirst: item.firstChild.classList.contains('tick'),
      };
    })()`);
    assert.strictEqual(todoTyped.text, 'buy', `typing after "[] " must land in the item text: ${todoTyped.html}`);
    assert.ok(todoTyped.tickFirst, `the tick must stay the first child of the item: ${todoTyped.html}`);

    const toggled = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = '<ul>'
        + '<li class="todo" data-done="false"><button class="tick" contenteditable="false" tabindex="-1" aria-pressed="false"></button>first</li>'
        + '<li class="todo" data-done="false"><button class="tick" contenteditable="false" tabindex="-1" aria-pressed="false"></button>second</li>'
        + '<li><br></li>'
        + '</ul>';
      const first = editor.querySelector('li.todo');
      first.querySelector('.tick').click();
      const items = [...editor.querySelectorAll('li.todo')];
      const next = items[items.length - 1].nextElementSibling;
      return {
        done: first.dataset.done,
        pressed: first.querySelector('.tick').getAttribute('aria-pressed'),
        order: items.map((item) => item.textContent.trim()),
        strike: getComputedStyle(first).textDecorationLine,
        beforeBlank: !!next && !next.classList.contains('todo'),
      };
    })()`);
    assert.strictEqual(toggled.done, 'true', 'clicking the tick must mark the item done');
    assert.strictEqual(toggled.pressed, 'true', 'the tick must report its pressed state');
    assert.deepStrictEqual(toggled.order, ['second', 'first'], 'a checked item must sink below unchecked items');
    assert.match(toggled.strike, /line-through/, 'a checked item must be struck through');
    assert.ok(toggled.beforeBlank, 'a checked item must stop after the last to-do, before trailing blank lines');

    const untoggled = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      const first = editor.querySelectorAll('li.todo')[1];
      first.querySelector('.tick').click();
      const items = [...editor.querySelectorAll('li.todo')];
      return {
        done: first.dataset.done,
        order: items.map((item) => item.textContent.trim()),
        strike: getComputedStyle(first).textDecorationLine,
      };
    })()`);
    assert.strictEqual(untoggled.done, 'false', 'clicking again must uncheck the item');
    assert.deepStrictEqual(untoggled.order, ['second', 'first'], 'unchecking must not move the item again');
    assert.strictEqual(untoggled.strike, 'none', 'unchecking must remove the strike-through');

    await delay(600);
    assert.match(note.content, /class="todo"/, 'the to-do markup must be saved with the note content');
    const restored = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = ${JSON.stringify(note.content)};
      const item = editor.querySelector('li.todo');
      item.querySelector('.tick').click();
      return item.dataset.done;
    })()`);
    assert.strictEqual(restored, 'true', 'a saved to-do must stay interactive after a repaint');

    // Backspace at the start of a filled item strips the marker; the text stays.
    await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = '<ul><li class="todo" data-done="false">'
        + '<button class="tick" contenteditable="false" tabindex="-1" aria-pressed="false"></button>buy</li></ul>';
      editor.focus();
      const item = editor.querySelector('li.todo');
      const text = item.lastChild;
      const range = document.createRange();
      range.setStart(text, 0);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    })()`);
    press(glass, 'Backspace');
    await delay(50);
    const markerRemoved = await glass.webContents.executeJavaScript(`(() => {
      const item = document.querySelector('#editor li');
      return {
        todo: item.classList.contains('todo'),
        tick: !!item.querySelector('.tick'),
        text: item.textContent.trim(),
      };
    })()`);
    assert.strictEqual(markerRemoved.todo, false, 'Backspace at the start must remove the to-do marker');
    assert.strictEqual(markerRemoved.tick, false, 'the tick must be removed with the marker');
    assert.strictEqual(markerRemoved.text, 'buy', 'removing the marker must keep the item text');

    // Backspace on an empty item deletes the item and leaves a plain paragraph.
    await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = '<ul><li class="todo" data-done="false">'
        + '<button class="tick" contenteditable="false" tabindex="-1" aria-pressed="false"></button><br></li></ul>';
      editor.focus();
      const item = editor.querySelector('li.todo');
      const range = document.createRange();
      range.selectNodeContents(item);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    })()`);
    press(glass, 'Backspace');
    await delay(50);
    const emptyRemoved = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      return {
        todos: editor.querySelectorAll('li.todo').length,
        lists: editor.querySelectorAll('ul,ol').length,
        html: editor.innerHTML,
      };
    })()`);
    assert.strictEqual(emptyRemoved.todos, 0, `an empty to-do must be deletable: ${emptyRemoved.html}`);
    assert.strictEqual(emptyRemoved.lists, 0, `deleting the last item must leave a paragraph: ${emptyRemoved.html}`);

    // Enter at the end of a to-do creates the next item and leaves the caret in
    // its text, not on the cloned circle.
    await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = '<ul><li class="todo" data-done="false">'
        + '<button class="tick" contenteditable="false" tabindex="-1" aria-pressed="false"></button>task 1</li></ul>';
      editor.focus();
      const text = editor.querySelector('li.todo').lastChild;
      const range = document.createRange();
      range.setStart(text, text.textContent.length);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    })()`);
    glass.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    glass.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    glass.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    await delay(80);
    for (const character of 'task 2') {
      glass.webContents.sendInputEvent({ type: 'keyDown', keyCode: character });
      glass.webContents.sendInputEvent({ type: 'char', keyCode: character });
      glass.webContents.sendInputEvent({ type: 'keyUp', keyCode: character });
    }
    await delay(80);
    const nextItem = await glass.webContents.executeJavaScript(`(() => {
      const items = [...document.querySelectorAll('#editor li.todo')];
      const second = items[1];
      return {
        count: items.length,
        text: second ? second.textContent.trim() : '',
        tickFirst: !!second && second.firstChild.classList.contains('tick'),
        html: document.querySelector('#editor').innerHTML,
      };
    })()`);
    assert.strictEqual(nextItem.count, 2, `Enter must add a second to-do: ${nextItem.html}`);
    assert.strictEqual(nextItem.text, 'task 2', `typing must land in the new item: ${nextItem.html}`);
    assert.ok(nextItem.tickFirst, `the new item's tick must stay first: ${nextItem.html}`);

    // Checking an item moves it, and the caret must stay in that item's text
    // rather than collapsing onto the circle. Repeated clicks must keep it too.
    const caretKept = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      const item = (text) => '<li class="todo" data-done="false">'
        + '<button class="tick" contenteditable="false" tabindex="-1" aria-pressed="false"></button>' + text + '</li>';
      editor.innerHTML = '<ul>' + item('task 1.a') + item('task 1.b') + item('task 1.c') + '</ul>';
      editor.focus();
      const first = editor.querySelector('li.todo');
      const text = first.lastChild;
      const range = document.createRange();
      range.setStart(text, 2);
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      first.querySelector('.tick').click();
      const after = window.getSelection();
      const anchor = after.anchorNode;
      return {
        order: [...editor.querySelectorAll('li.todo')].map((li) => li.textContent.trim()),
        caretText: anchor.nodeType === Node.TEXT_NODE,
        caretInMoved: anchor.parentElement.closest('li') === first,
        offset: after.anchorOffset,
      };
    })()`);
    assert.deepStrictEqual(caretKept.order, ['task 1.b', 'task 1.c', 'task 1.a'], 'checking must sink the item');
    assert.ok(caretKept.caretText, 'the caret must stay in a text node after checking');
    assert.ok(caretKept.caretInMoved, 'the caret must stay in the item that was checked');
    assert.strictEqual(caretKept.offset, 2, 'the caret must keep its offset');

    const caretKeptAgain = await glass.webContents.executeJavaScript(`(() => {
      const first = document.querySelector('#editor li.todo[data-done="true"]');
      first.querySelector('.tick').click();
      const after = window.getSelection();
      const anchor = after.anchorNode;
      return {
        done: first.dataset.done,
        caretText: anchor.nodeType === Node.TEXT_NODE,
        caretInMoved: anchor.parentElement.closest('li') === first,
        offset: after.anchorOffset,
      };
    })()`);
    assert.strictEqual(caretKeptAgain.done, 'false', 'a second click must uncheck the item');
    assert.ok(caretKeptAgain.caretText, 'the caret must stay in text after a second click');
    assert.ok(caretKeptAgain.caretInMoved, 'the caret must stay in the item after a second click');
    assert.strictEqual(caretKeptAgain.offset, 2, 'the caret offset must survive a second click');

    await glass.webContents.executeJavaScript("document.querySelector('#newNote').click()");
    await waitFor('new-note action', () => createCalls === 1);
    assert.strictEqual(createCalls, 1, 'new-note button must call the existing create bridge once');

    await glass.webContents.executeJavaScript("document.querySelector('#pinNote').click()");
    await waitFor('pin state to update', () => glass.webContents.executeJavaScript(
      "document.querySelector('#pinNote').classList.contains('on')",
    ));
    await delay(200);
    const glassPin = await glass.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('#pinNote');
      return {
        background: getComputedStyle(button).backgroundColor,
        color: getComputedStyle(button).color,
        noteColor: getComputedStyle(document.body).getPropertyValue('--c').trim(),
      };
    })()`);
    const glassFill = glassPin.background.match(/[\d.]+/g).slice(0, 3).map(Number);
    assert.notStrictEqual(glassPin.background, 'rgba(0, 0, 0, 0)', 'pinned button must have a visible fill');
    assert.ok(luminance(glassFill) < luminance(hexRgb(glassPin.noteColor)), 'pinned fill must be darker than the note color');
    assert.strictEqual(glassPin.color, 'rgb(255, 255, 255)', 'pin glyph must contrast with the dark fill');

    const classic = await openNote('classic');
    await delay(200);
    const classicPin = await classic.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('#pinNote');
      return {
        active: button.classList.contains('on'),
        background: getComputedStyle(button).backgroundColor,
        color: getComputedStyle(button).color,
        noteColor: getComputedStyle(document.body).getPropertyValue('--c').trim(),
      };
    })()`);
    const classicFill = classicPin.background.match(/[\d.]+/g).slice(0, 3).map(Number);
    assert.ok(classicPin.active, 'pin state must appear in classic mode too');
    assert.notStrictEqual(classicPin.background, 'rgba(0, 0, 0, 0)', 'classic pinned button must have a visible fill');
    assert.ok(luminance(classicFill) < luminance(hexRgb(classicPin.noteColor)), 'classic pinned fill must be darker than the note color');
    assert.strictEqual(classicPin.color, 'rgb(255, 255, 255)', 'classic pin glyph must contrast with the dark fill');

    await glass.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('#title');
      title.value = 'Save success test';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const savingText = await glass.webContents.executeJavaScript("document.querySelector('#saveState').textContent");
    assert.strictEqual(savingText, 'Saving…');
    await waitFor('successful save status', () => glass.webContents.executeJavaScript(
      "document.querySelector('#saveState').textContent === 'Saved.'",
    ));

    await glass.webContents.executeJavaScript('window.tabbin.failNextUpdate()');
    await glass.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('#title');
      title.value = 'Save failure test';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const savingAgain = await glass.webContents.executeJavaScript("document.querySelector('#saveState').textContent");
    assert.strictEqual(savingAgain, 'Saving…');
    await waitFor('failed save status', () => glass.webContents.executeJavaScript(
      "document.querySelector('#saveState').textContent === 'Failed saving your note.'",
    ));
    const failedState = await glass.webContents.executeJavaScript(`({
      failed: document.querySelector('#saveState').classList.contains('failed'),
      busy: document.querySelector('#saveState').classList.contains('busy'),
    })`);
    assert.ok(failedState.failed, 'failed save receives its error styling');
    assert.ok(!failedState.busy, 'failed save leaves the busy state');

    await glass.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('#title');
      title.value = 'Retry after failure';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    const retryState = await glass.webContents.executeJavaScript(`({
      text: document.querySelector('#saveState').textContent,
      failed: document.querySelector('#saveState').classList.contains('failed'),
    })`);
    assert.strictEqual(retryState.text, 'Saving…');
    assert.ok(!retryState.failed, 'a retry clears the previous failure state');
    await waitFor('retry save status', () => glass.webContents.executeJavaScript(
      "document.querySelector('#saveState').textContent === 'Saved.'",
    ));

    // Mixed fonts: a selection takes a face inline, the title takes one for the
    // whole note, and both survive the save round-trip.
    const parisienneHtml = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.innerHTML = '<p>hello world</p>';
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor.querySelector('p'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const button = document.querySelector('#fonts button[data-font="Parisienne"]');
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      return editor.innerHTML;
    })()`);
    assert.match(parisienneHtml, /Parisienne/, `selected text must take the chosen face: ${parisienneHtml}`);
    await delay(600);
    assert.match(note.content, /Parisienne/, 'the inline font must be saved with the note content');

    const titleFontVar = await glass.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('#title');
      title.focus();
      title.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const button = document.querySelector('#fonts button[data-font="Gelasio"]');
      button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      return getComputedStyle(document.documentElement).getPropertyValue('--title-font').trim();
    })()`);
    assert.match(titleFontVar, /Gelasio/, `title face must apply immediately: ${titleFontVar}`);
    await delay(600);
    assert.strictEqual(note.titleFont, 'Gelasio', 'the title face must be saved on the note');

    // With the title focused, the menu must report the note's title face rather
    // than the editor's default.
    const titleMenu = await glass.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('#title');
      title.focus();
      title.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      document.querySelector('#fontBtn').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
      const pressed = document.querySelector('#fonts button[data-font="Gelasio"]')
        .getAttribute('aria-pressed');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return pressed;
    })()`);
    assert.strictEqual(titleMenu, 'true', 'the font menu must reflect the title face');

    // Per-selection size: A+ steps the note's base size, scales the title with
    // it (x1.5), and gives the selected range its own size.
    const sized = await glass.webContents.executeJavaScript(`(() => {
      const editor = document.querySelector('#editor');
      editor.focus();
      editor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.querySelector('.tool[data-size="1"]').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
      return {
        size: getComputedStyle(document.documentElement).getPropertyValue('--note-size').trim(),
        html: editor.innerHTML,
        titleSize: getComputedStyle(document.querySelector('#title')).fontSize,
      };
    })()`);
    assert.strictEqual(sized.size, '16px', `base size must step to 16px: ${sized.size}`);
    assert.match(sized.html, /<font size=/, `the selected range must carry its own size: ${sized.html}`);
    assert.strictEqual(sized.titleSize, '24px', 'the title scales with the body (16 x 1.5)');
    await delay(600);
    assert.strictEqual(note.fontSize, 16, 'the base size must be saved on the note');

    // Fullscreen is a momentary mode: toggled through the bridge, reflected on
    // the button, and exited by Escape.
    await glass.webContents.executeJavaScript("document.querySelector('#fullscreen').click()");
    await waitFor('fullscreen on', () => glass.webContents.executeJavaScript(
      "document.querySelector('#fullscreen').classList.contains('on')",
    ));
    assert.strictEqual(
      await glass.webContents.executeJavaScript("document.querySelector('#fullscreen').getAttribute('aria-pressed')"),
      'true',
      'the fullscreen button reflects the active state',
    );
    await glass.webContents.executeJavaScript(
      "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))",
    );
    await waitFor('fullscreen off', () => glass.webContents.executeJavaScript(
      "!document.querySelector('#fullscreen').classList.contains('on')",
    ));
    assert.strictEqual(fullScreenState, false, 'Escape exits fullscreen');

    // The permanent case. main.js throws NOTE_MISSING when the id is absent from
    // loadNotes(), which retrying can never fix. It must produce copy-your-text
    // advice rather than the generic failure, and it must survive a real IPC
    // crossing - Electron rewrites the message on the way over.
    await glass.webContents.executeJavaScript('window.tabbin.failWithMissingNote()');
    await glass.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('#title');
      title.value = 'Permanently unsaved';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor('missing-note save status', () => glass.webContents.executeJavaScript(
      "document.querySelector('#saveState').textContent === 'This note is no longer on disk. Copy your text before closing.'",
    ), 8000);
    const missingState = await glass.webContents.executeJavaScript("document.querySelector('#saveState').classList.contains('failed')");
    assert.ok(missingState, 'the missing-note failure is styled as a failure');

    // Once a broadcast says this id is gone, the window must stop trying to
    // save: the id is never renegotiated, so every later attempt fails the same
    // way forever.
    const beforeGone = updateCalls;
    await glass.webContents.executeJavaScript('window.tabbin.broadcast([])');
    await delay(100);
    await glass.webContents.executeJavaScript(`(() => {
      const title = document.querySelector('#title');
      title.value = 'Typed after deletion';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await delay(700);
    assert.strictEqual(
      updateCalls,
      beforeGone,
      'an edit after this note was deleted must not attempt another doomed save',
    );

    console.log('PASS: editor DOM covers list conversion, to-do items, note actions, pin highlight, save recovery, mixed fonts, sizes, and fullscreen');
  } finally {
    for (const window of windows) {
      if (!window.isDestroyed()) window.destroy();
    }
    app.quit();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
  app.quit();
});
