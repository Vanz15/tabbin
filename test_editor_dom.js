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
const windows = [];

ipcMain.handle('test:get', () => ({ ...note }));
ipcMain.handle('test:update', (_, patch) => Object.assign(note, patch));
ipcMain.handle('test:toggle-pin', () => {
  note.alwaysOnTop = !note.alwaysOnTop;
  return { ...note };
});
ipcMain.handle('test:create', () => {
  createCalls += 1;
  return { id: `created-${createCalls}` };
});
ipcMain.handle('test:remove', () => true);

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

    console.log('PASS: editor DOM converts list markers once, keeps mid-line text, opens notes, and highlights pin state');
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
