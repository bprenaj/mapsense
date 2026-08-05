/**
 * Renders the MapSense mark, the copper bell ALONE on transparency, from the
 * designer's master SVG.
 *
 * The shipped mark is never the bell on its navy plate: a plated square reads
 * as a sticker in the tray, on the taskbar and in the app's own sidebar. The
 * master carries the plate as exactly ONE element (a full-canvas rounded rect
 * filled with the background gradient) and everything else inside the bell
 * group, so the plate comes off by DELETING that element and rasterising what
 * the designer actually drew. That is exact: no colour matte, no heuristics,
 * and the cyan circuit traces on the bell survive untouched. The plate's
 * colours live on as the app's `--icon-bg-*` tokens (see BRAND-NOTE.md).
 *
 * Outputs build/icon-src/icon-*.png, which generate-icons.js turns into
 * build/icon.ico and the tray PNGs, and copy-static.mjs bundles as the
 * renderer's sidebar mark. One source, so the four can never drift.
 *
 * Rerun when the designer ships new artwork:
 *   npx electron scripts/render-mark.js
 */

const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'build', 'icon-src');
const MASTER = path.join(SRC_DIR, 'original', 'icon-master.svg');
const OUT_SIZES = [512, 256, 48, 32, 16];
// Rendered once large, then downscaled: premultiplied downscaling is clean and
// keeps the fine circuit traces legible at 16px better than a native tiny render.
const RENDER = 1024;
// The bell sits inside the plate's padding; once the plate is gone the mark is
// re-centred to fill its square, or it reads small in the tray.
const FILL = 0.94;

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Drop the full-canvas background rect. Throws if the artwork changed shape. */
function stripPlate(svg) {
  const defsEnd = svg.indexOf('</defs>');
  if (defsEnd === -1) throw new Error('master SVG has no <defs>, artwork shape changed');
  const head = svg.slice(0, defsEnd);
  const body = svg.slice(defsEnd);
  // A rect covering the whole viewBox is the plate; nothing else in the mark
  // is canvas-sized.
  const plate = /<rect\b(?=[^>]*\bwidth="64")(?=[^>]*\bheight="64")[^>]*>(?:\s*<\/rect>)?/;
  if (!plate.test(body)) {
    throw new Error('no full-canvas plate rect found in master SVG; check the artwork before shipping');
  }
  return head + body.replace(plate, '');
}

/** Crop to the mark's own bounds and re-centre it at FILL of a square canvas. */
function recentre(image) {
  const { width: w, height: h } = image.getSize();
  const bmp = image.toBitmap(); // premultiplied BGRA
  const alphaAt = (x, y) => bmp[(y * w + x) * 4 + 3];

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alphaAt(x, y) > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('rendered mark is entirely transparent');

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const side = Math.max(bw, bh);
  const pad = Math.round((side / FILL - side) / 2);
  const out = side + pad * 2;
  const ox = pad + Math.round((side - bw) / 2) - x0;
  const oy = pad + Math.round((side - bh) / 2) - y0;

  const dst = Buffer.alloc(out * out * 4);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const si = (y * w + x) * 4;
      const di = ((y + oy) * out + (x + ox)) * 4;
      dst[di] = bmp[si];
      dst[di + 1] = bmp[si + 1];
      dst[di + 2] = bmp[si + 2];
      dst[di + 3] = bmp[si + 3];
    }
  }
  console.log(`[mark] bounds ${bw}x${bh} at (${x0},${y0}) -> ${out}x${out} canvas`);
  return nativeImage.createFromBuffer(dst, { width: out, height: out });
}

app
  .whenReady()
  .then(async () => {
    const svg = stripPlate(fs.readFileSync(MASTER, 'utf8'));

    // A transparent offscreen window is the rasteriser: the SVG is inlined so
    // it renders in the page (an <img src> would isolate it), and the page
    // background stays transparent so capturePage keeps the alpha.
    const win = new BrowserWindow({
      width: RENDER,
      height: RENDER,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: { offscreen: true },
    });
    const page = `<!doctype html><meta charset="utf-8">
      <style>
        html,body{margin:0;padding:0;background:transparent;overflow:hidden}
        svg{display:block;width:${RENDER}px;height:${RENDER}px}
      </style>${svg}`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page)}`);
    await new Promise((r) => setTimeout(r, 400));

    const shot = await win.webContents.capturePage();
    win.destroy();

    const base = recentre(shot);
    for (const size of OUT_SIZES) {
      const out = base.resize({ width: size, height: size, quality: 'best' });
      fs.writeFileSync(path.join(SRC_DIR, `icon-${size}.png`), out.toPNG());
      console.log(`[mark] build/icon-src/icon-${size}.png written`);
    }
    console.log('[mark] Done.');
    app.exit(0);
  })
  .catch((err) => {
    console.error('[mark] FAILED:', err);
    app.exit(1);
  });
