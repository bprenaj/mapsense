import { cpSync, mkdirSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'src', 'renderer');
const dest = resolve(root, 'dist', 'renderer');
const imgSrc = resolve(root, '..', '..', 'images');

mkdirSync(resolve(dest, 'assets'), { recursive: true });

const staticFiles = [
  'index.html',
  'styles.css',
  'alert-overlay.html',
  'region-overlay.html',
  'update-flyout.html',
];

for (const f of staticFiles) {
  const s = resolve(src, f);
  if (existsSync(s)) cpSync(s, resolve(dest, f));
}

const assetDir = resolve(src, 'assets');
if (existsSync(assetDir)) {
  cpSync(assetDir, resolve(dest, 'assets'), { recursive: true });
}

// The sidebar mark is the app icon itself (build/icon-src is the single source
// of truth, per the Brand Tokens Rule), not a second copy of the artwork.
const bellSrc = resolve(root, 'build', 'icon-src', 'icon-256.png');
if (existsSync(bellSrc)) {
  cpSync(bellSrc, resolve(dest, 'assets', 'bell.png'));
} else {
  console.warn('[copy-static] WARNING: build/icon-src/icon-256.png missing');
}

const imageMap = {
  "MapSense's Bell - Main Image.jpg": 'mapsense-main.jpg',
  // The Coach hero reads src/renderer/assets/mapsense-hero.png instead, which
  // scripts/make-hero-art.js derives from mapsense-header-cropped.jpg.
};

for (const [from, to] of Object.entries(imageMap)) {
  const s = resolve(imgSrc, from);
  if (existsSync(s)) cpSync(s, resolve(dest, 'assets', to));
}

// Tray icons (branded, with status bubble) live next to the compiled main.
const trayScriptDir = resolve(root, 'build', 'tray');
const trayDest = resolve(root, 'dist', 'main', 'assets');
mkdirSync(trayDest, { recursive: true });
if (existsSync(trayScriptDir)) {
  cpSync(trayScriptDir, trayDest, { recursive: true });
} else {
  console.warn('[copy-static] WARNING: build/tray icons missing');
}

// Branded app icon, bundled so the window/taskbar/Alt-Tab icon is set at
// runtime. build/ is not inside the asar (files = dist + package.json), so the
// main process cannot read build/icon.ico directly once packaged; copy it in.
const appIconSrc = resolve(root, 'build', 'icon.ico');
if (existsSync(appIconSrc)) {
  cpSync(appIconSrc, resolve(trayDest, 'icon.ico'));
} else {
  console.warn('[copy-static] WARNING: build/icon.ico missing');
}

// Bundle Chart.js locally -- the app must not load remote scripts.
const chartSrc = resolve(root, 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js');
mkdirSync(resolve(dest, 'vendor'), { recursive: true });
if (existsSync(chartSrc)) {
  cpSync(chartSrc, resolve(dest, 'vendor', 'chart.umd.min.js'));
} else {
  console.warn('[copy-static] WARNING: chart.js not found in node_modules');
}

// Generate the default alert bell (deterministic synth, 44.1kHz 16-bit mono).
// 200ms of leading silence avoids the Chromium audio-start click.
writeFileSync(resolve(dest, 'assets', 'alert.wav'), generateBellWav());

function generateBellWav() {
  const sampleRate = 44100;
  const silenceS = 0.2;
  const toneS = 1.1;
  const total = Math.round(sampleRate * (silenceS + toneS));
  const silenceSamples = Math.round(sampleRate * silenceS);
  const pcm = new Int16Array(total);

  // Bell-like tone: fundamental + inharmonic partials with exponential decay.
  const partials = [
    { f: 880, a: 1.0, d: 3.0 },
    { f: 1320, a: 0.5, d: 4.5 },
    { f: 1760, a: 0.35, d: 6.0 },
    { f: 2217, a: 0.2, d: 8.0 },
  ];
  for (let i = silenceSamples; i < total; i++) {
    const t = (i - silenceSamples) / sampleRate;
    let v = 0;
    for (const p of partials) {
      v += p.a * Math.exp(-p.d * t) * Math.sin(2 * Math.PI * p.f * t);
    }
    const attack = Math.min(1, t / 0.005);
    pcm[i] = Math.round(Math.max(-1, Math.min(1, v * 0.45 * attack)) * 32767);
  }

  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  return buf;
}

console.log('[copy-static] Renderer assets copied.');
