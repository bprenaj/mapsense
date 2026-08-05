/**
 * Generates all MapSense icons at BUILD time from build/icon-src/icon-*.png
 * (the bell alone on transparency, produced by scripts/render-mark.js from the
 * designer's master SVG; see build/icon-src/BRAND-NOTE.md):
 *
 *   - build/icon.ico              exe / installer / shortcuts / Apps list
 *   - build/tray/tray-*.png       tray icons with the status dot baked in
 *
 * Run via: npx electron scripts/generate-icons.js
 * (Electron is only used as a headless canvas for the dot compositing;
 * pattern copied from tinomo scripts/generate-icon.js.)
 *
 * Runtime code only LOADS these PNGs (Tray App Standard), so tray icons can
 * never come up empty from a failed offscreen render in the shipped app.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'build', 'icon-src');
const TRAY_DIR = path.join(ROOT, 'build', 'tray');
const ICO_SIZES = [16, 32, 48, 256];
const TRAY_SIZE = 32;
// The bell is transparent-backed and fills its own square, so it is drawn
// slightly inset and top-left anchored to leave the bottom-right corner for the
// status dot. Without the inset the dot lands on the middle of the bell's skirt.
const TRAY_BELL = 26;
const DOT_R = 6;
const DOT_C = TRAY_SIZE - DOT_R - 1;

// Status dot colors, matching the app's live tokens (styles.css): success,
// warning, and a clearly visible idle grey (Tray App Standard: idle must
// never dim into the background).
const TRAY_STATES = {
  'tray-tracking': '#00E5A0',
  'tray-connecting': '#FFB74D',
  'tray-off': '#98A6B8',
};

function createIcoBuffer(pngEntries) {
  const count = pngEntries.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let dataOffset = headerSize + dirEntrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  const dataChunks = [];

  for (const { size, data } of pngEntries) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    dirEntries.push(entry);
    dataChunks.push(data);
    dataOffset += data.length;
  }

  return Buffer.concat([header, ...dirEntries, ...dataChunks]);
}

function buildIco() {
  const entries = ICO_SIZES.map((size) => ({
    size,
    data: fs.readFileSync(path.join(SRC, `icon-${size}.png`)),
  }));
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), createIcoBuffer(entries));
  console.log(`[icons] build/icon.ico written (${ICO_SIZES.join(', ')})`);
}

/** Compose base icon + status dot on a canvas inside a hidden window. */
async function buildTrayIcons() {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  const base64 = fs.readFileSync(path.join(SRC, 'icon-48.png')).toString('base64');
  await win.loadURL('data:text/html,<html><body></body></html>');

  fs.mkdirSync(TRAY_DIR, { recursive: true });
  for (const [name, color] of Object.entries(TRAY_STATES)) {
    const dataUrl = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = ${TRAY_SIZE}; c.height = ${TRAY_SIZE};
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, ${TRAY_BELL}, ${TRAY_BELL});
          // Status dot bottom-right, dark outline for contrast on any tray.
          ctx.beginPath();
          ctx.arc(${DOT_C}, ${DOT_C}, ${DOT_R}, 0, Math.PI * 2);
          ctx.fillStyle = '${color}';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#080E24';
          ctx.stroke();
          resolve(c.toDataURL('image/png'));
        };
        img.src = 'data:image/png;base64,${base64}';
      })
    `);
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(TRAY_DIR, `${name}.png`), png);
    console.log(`[icons] build/tray/${name}.png written`);
  }
  win.destroy();
}

app
  .whenReady()
  .then(async () => {
    buildIco();
    await buildTrayIcons();
    console.log('[icons] Done.');
    app.exit(0);
  })
  .catch((err) => {
    console.error('[icons] FAILED:', err);
    app.exit(1);
  });
