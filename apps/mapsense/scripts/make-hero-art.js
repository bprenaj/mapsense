/**
 * Builds the Coach hero artwork: images/mapsense-header-cropped.jpg with a
 * feathered left edge, so the art dissolves into the app's blue instead of
 * ending on a hard vertical cut.
 *
 * The feather cannot be a CSS mask over the source art. The bell sits about 45
 * pixels from the artwork's left edge, so any fade wide enough to read as a
 * fade erases the bell, which is the one thing the hero has to show. So the
 * canvas is EXTENDED leftward first, filled by clamping the artwork's own left
 * column (flat dark teal), and the alpha ramp runs across that extension and
 * stops just short of the bell. The bell and Pavlov stay fully opaque.
 *
 * Rerun when the source artwork changes:
 *   npx electron scripts/make-hero-art.js
 */

const { app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '..', '..', 'images', 'mapsense-header-cropped.jpg');
const OUT = path.join(ROOT, 'src', 'renderer', 'assets', 'mapsense-hero.png');

// The source carries a few near-black rows along the bottom edge and a similar
// sliver on the right; both would read as a frame once the art is placed.
const CROP_RIGHT = 6;
const CROP_BOTTOM = 6;
// Width of the fabricated run-out, and where the ramp reaches full opacity.
// BELL_X is the artwork column the bell starts at; the ramp must finish before it.
const EXTEND = 280;
const BELL_X = 45;
const RAMP_END = EXTEND + Math.round(BELL_X * 0.4);

const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

app
  .whenReady()
  .then(() => {
    const src = nativeImage.createFromPath(SRC);
    const { width: sw, height: sh } = src.getSize();
    const bmp = src.toBitmap();
    const w = sw - CROP_RIGHT;
    const h = sh - CROP_BOTTOM;

    const outW = EXTEND + w;
    const out = Buffer.alloc(outW * h * 4);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < outW; x++) {
        // Left of the artwork, clamp to its own first column.
        const sx = x < EXTEND ? 0 : x - EXTEND;
        const si = (y * sw + sx) * 4;
        const a = smoothstep(x / RAMP_END);
        const di = (y * outW + x) * 4;
        // Electron bitmaps are premultiplied BGRA.
        out[di] = Math.round(bmp[si] * a);
        out[di + 1] = Math.round(bmp[si + 1] * a);
        out[di + 2] = Math.round(bmp[si + 2] * a);
        out[di + 3] = Math.round(a * 255);
      }
    }

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, nativeImage.createFromBuffer(out, { width: outW, height: h }).toPNG());
    console.log(`[hero] src/renderer/assets/mapsense-hero.png written (${outW}x${h}, ramp 0..${RAMP_END})`);
    app.exit(0);
  })
  .catch((err) => {
    console.error('[hero] FAILED:', err);
    app.exit(1);
  });
