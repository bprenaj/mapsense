import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..');

describe('Smoke Tests', () => {
  it('package.json exists and has required scripts', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('mapsense');
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
    expect(pkg.scripts.lint).toBeDefined();
  });

  it('tsconfig.json exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tsconfig.json'))).toBe(true);
  });

  it('all source entry points exist', () => {
    const required = [
      'src/main/index.ts',
      'src/main/preload.ts',
      'src/main/overlayPreload.ts',
      'src/main/ipc.ts',
      'src/renderer/index.html',
      'src/renderer/app.ts',
      'src/renderer/styles.css',
      'src/renderer/alert-overlay.html',
      'src/renderer/alertOverlay.ts',
      'src/renderer/region-overlay.html',
      'src/renderer/regionOverlay.ts',
      'src/renderer/update-flyout.html',
      'src/renderer/updateFlyout.ts',
    ];
    for (const f of required) {
      expect(fs.existsSync(path.join(ROOT, f)), `Missing: ${f}`).toBe(true);
    }
  });

  it('all service files exist', () => {
    const services = [
      'beamBridge.ts',
      'sessionEngine.ts',
      'store.ts',
      'entitlement.ts',
      'migration.ts',
      'alertManager.ts',
      'irlWebhook.ts',
      'tray.ts',
      'overlayFactory.ts',
    ];
    for (const f of services) {
      expect(
        fs.existsSync(path.join(ROOT, 'src', 'main', 'services', f)),
        `Missing service: ${f}`,
      ).toBe(true);
    }
  });

  it('all shared modules exist', () => {
    const shared = ['types.ts', 'schemas.ts', 'mas.ts', 'region.ts', 'constants.ts', 'gamePresets.ts'];
    for (const f of shared) {
      expect(
        fs.existsSync(path.join(ROOT, 'src', 'shared', f)),
        `Missing shared: ${f}`,
      ).toBe(true);
    }
  });

  it('auto-update is wired: dependency, publish feed, updater service', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['electron-updater']).toBeDefined();
    expect(pkg.build.publish).toMatchObject({ provider: 'github', owner: 'bprenaj', repo: 'mapsense' });
    expect(fs.existsSync(path.join(ROOT, 'src', 'main', 'services', 'updater.ts'))).toBe(true);
  });

  it('build script bundles chart.js and generates the alert sound', () => {
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'copy-static.mjs'), 'utf-8');
    expect(script).toContain('chart.umd.min.js');
    expect(script).toContain('alert.wav');
  });

  it('packaged exe gets the branded icon (rcedit not disabled)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.build.icon).toBe('build/icon.ico');
    // signAndEditExecutable:false skips electron-builder's rcedit step, which is
    // exactly what stamps build/icon.ico onto the exe. Leaving it disabled ships
    // the ow-electron base (Overwolf) icon on the taskbar and Start Menu shortcut.
    expect(pkg.build.win.signAndEditExecutable).not.toBe(false);
  });

  it('app icon is bundled for the runtime window/taskbar icon', () => {
    // build/ is not inside the asar (files = dist + package.json), so the main
    // process needs icon.ico copied into dist to set the window icon.
    const copyScript = fs.readFileSync(path.join(ROOT, 'scripts', 'copy-static.mjs'), 'utf-8');
    expect(copyScript).toContain('icon.ico');
    const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf-8');
    // The window must be given an icon, loaded from the bundled assets path.
    expect(main).toContain('getWindowIconPath');
    expect(main).toMatch(/'assets',\s*'icon\.ico'/);
  });

  it('branded icons exist: app ico + tray status variants (PNG, non-empty)', () => {
    expect(fs.existsSync(path.join(ROOT, 'build', 'icon.ico'))).toBe(true);
    for (const f of ['tray-tracking.png', 'tray-connecting.png', 'tray-off.png']) {
      const p = path.join(ROOT, 'build', 'tray', f);
      expect(fs.existsSync(p), `missing ${f}`).toBe(true);
      const buf = fs.readFileSync(p);
      expect(buf.length).toBeGreaterThan(100);
      // PNG magic bytes -- tray icons must be encoded images, not raw buffers
      expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47');
    }
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'copy-static.mjs'), 'utf-8');
    expect(script).toContain('tray');
  });

  it('main process is hardened: single instance, crash logging, file logger', () => {
    const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf-8');
    // One tray icon, one updater, one IRL port: never two MapSense processes.
    expect(main).toContain('requestSingleInstanceLock');
    expect(main).toContain('second-instance');
    // Crashes must leave a trace, not a silent death or raw dialog.
    expect(main).toContain('uncaughtException');
    expect(main).toContain('unhandledRejection');
    expect(main).toContain('render-process-gone');
    // Packaged runs mirror console output to <userData>/logs/main.log.
    expect(main).toContain('fileLogger.init');
    expect(main).toContain('fileLogger.hookConsole');
    expect(fs.existsSync(path.join(ROOT, 'src', 'main', 'services', 'logger.ts'))).toBe(true);
  });

  it('quit path flushes analytics with a bounded timeout', () => {
    const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf-8');
    expect(main).toContain('analytics.shutdown()');
    // The flush must be raced against a timeout so a dead network never hangs exit.
    expect(main).toMatch(/Promise\.race/);
  });

  it('release workflow gates publishing on typecheck, lint, and tests', () => {
    const wf = fs.readFileSync(
      path.join(ROOT, '..', '..', '.github', 'workflows', 'release.yml'),
      'utf-8',
    );
    const publishIdx = wf.indexOf('npm run release');
    expect(publishIdx).toBeGreaterThan(-1);
    for (const gate of ['npm run typecheck', 'npm run lint', 'npm test']) {
      const idx = wf.indexOf(gate);
      expect(idx, `release.yml missing gate: ${gate}`).toBeGreaterThan(-1);
      expect(idx, `${gate} must run before publish`).toBeLessThan(publishIdx);
    }
  });

  it('NO EM DASHES anywhere in app source or copy (SwissTropic hard rule)', () => {
    const roots = ['src', 'scripts', 'tests'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|js|mjs|html|css|json|md)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf-8');
          if (content.includes('\u2014') || content.includes('&' + 'mdash;')) {
            offenders.push(path.relative(ROOT, full));
          }
        }
      }
    };
    for (const r of roots) walk(path.join(ROOT, r));
    expect(offenders, `Em dashes are banned in all SwissTropic projects. Fix: ${offenders.join(', ')}`).toEqual([]);
  });

  it('analytics module never references gaze/region/PII field names', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src', 'main', 'services', 'analytics.ts'),
      'utf-8',
    );
    // The service must be PII-blind: it only knows an allowlist, never these.
    for (const banned of ['gaze', 'minimapRect', 'customSoundPath', 'irlWebhookUrl', 'point_of_regard']) {
      expect(src.toLowerCase(), `analytics.ts references ${banned}`).not.toContain(banned.toLowerCase());
    }
  });

  it('analytics is main-process only (no posthog import in renderer)', () => {
    for (const f of ['src/renderer/app.ts', 'src/renderer/regionOverlay.ts', 'src/renderer/alertOverlay.ts']) {
      const content = fs.readFileSync(path.join(ROOT, f), 'utf-8');
      expect(content, `${f} imports posthog`).not.toMatch(/posthog/i);
    }
  });

  it('renderer has no leftover debug instrumentation', () => {
    const files = [
      'src/main/index.ts',
      'src/main/overlayPreload.ts',
      'src/renderer/app.ts',
      'src/renderer/regionOverlay.ts',
    ];
    for (const f of files) {
      const content = fs.readFileSync(path.join(ROOT, f), 'utf-8');
      expect(content, `${f} contains debug markers`).not.toMatch(/DBG293|debug-293fda|agent log/);
    }
  });

  it('HTML files reference correct JS scripts', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf-8');
    expect(indexHtml).toContain('app.js');
    expect(indexHtml).toContain('styles.css');

    const regionHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'region-overlay.html'), 'utf-8');
    expect(regionHtml).toContain('regionOverlay.js');

    const alertHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'alert-overlay.html'), 'utf-8');
    expect(alertHtml).toContain('alertOverlay.js');

    const flyoutHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'update-flyout.html'), 'utf-8');
    expect(flyoutHtml).toContain('updateFlyout.js');
    // copy-static must bundle the flyout page or the packaged app 404s it.
    const copyStatic = fs.readFileSync(path.join(ROOT, 'scripts', 'copy-static.mjs'), 'utf-8');
    expect(copyStatic).toContain('update-flyout.html');
  });

  it('the tray opens a styled quick panel, not a native context menu', () => {
    // Tray App Standard: right-click gets the app's own panel, and the tray
    // must work without any context menu at all.
    const tray = fs.readFileSync(path.join(ROOT, 'src', 'main', 'services', 'tray.ts'), 'utf-8');
    expect(tray).toContain("this.tray.on('right-click'");
    expect(tray).not.toContain('setContextMenu');
    expect(tray).not.toContain('Menu.buildFromTemplate');

    const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf-8');
    // Created hidden at startup, so the first summon opens at the right size.
    expect(main).toContain('trayPanelWindow = createTrayPanel();');
    // Blur and Escape both close it; a panel you cannot dismiss is a trap.
    expect(main).toMatch(/win\.on\('blur', \(\) => win\.hide\(\)\)/);
    // The renderer measures itself; a hardcoded height fits one machine only.
    expect(main).toContain('IPC.PANEL_HEIGHT');
    // Quit goes through app.quit() so cleanup and install-on-quit still run.
    expect(main).toMatch(/case 'quit':[\s\S]{0,220}app\.quit\(\);/);

    const panel = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'trayPanel.ts'), 'utf-8');
    expect(panel).toContain("e.key === 'Escape'");
    // A dev run has no updater, so that row is hidden rather than dead.
    expect(panel).toMatch(/updateRow\.hidden = !state\.packaged;/);

    const copyStatic = fs.readFileSync(path.join(ROOT, 'scripts', 'copy-static.mjs'), 'utf-8');
    expect(copyStatic).toContain('tray-panel.html');
  });

  it('one function owns start/stop training, and every input delegates to it', () => {
    // The hotkey used to carry its own copy of the toggle; adding the tray
    // panel as a third input is exactly how those drift apart.
    const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf-8');
    expect(main).toContain('function toggleTraining(): void');
    expect(main).toContain('globalShortcut.register(settings.hotkey, toggleTraining);');
    expect(main).toMatch(/case 'toggleTraining':\s*\n\s*toggleTraining\(\);/);
  });

  it('renderer console warnings and errors reach the app log', () => {
    // Electron's file logger only wraps MAIN-process console, so without this
    // forward a renderer-side failure leaves no trace in main.log at all.
    const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf-8');
    expect(main).toContain("win.webContents.on('console-message'");
    expect(main).toMatch(/forwardRendererConsole\(win, 'Renderer'\)/);
  });

  it('the custom sound picker reports every outcome instead of failing silently', () => {
    const main = fs.readFileSync(path.join(ROOT, 'src', 'main', 'index.ts'), 'utf-8');
    for (const marker of ['Custom sound: opening picker', 'Custom sound: cancelled',
      'Custom sound: picker failed']) {
      expect(main, `Missing picker log: ${marker}`).toContain(marker);
    }
    // The renderer must not let a rejected invoke become an unhandled
    // rejection, which is what turns a broken picker into a dead button.
    const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'app.ts'), 'utf-8');
    const handler = renderer.slice(renderer.indexOf("$('btnPickSound')"));
    expect(handler.slice(0, 600)).toContain('catch');
  });

  it('every image the renderer references is actually bundled', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf-8');
    const copyStatic = fs.readFileSync(path.join(ROOT, 'scripts', 'copy-static.mjs'), 'utf-8');
    const referenced = [...indexHtml.matchAll(/src="assets\/([^"]+)"/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const file of referenced) {
      // Either committed under src/renderer/assets (copied wholesale) or named
      // by copy-static, which derives it from build/ or images/.
      const committed = fs.existsSync(path.join(ROOT, 'src', 'renderer', 'assets', file));
      expect(committed || copyStatic.includes(file), `Unbundled asset: ${file}`).toBe(true);
    }
  });

  it('the app mark is the bell alone, generated from one source', () => {
    // The plate is stripped from the designer's artwork by strip-icon-bg.js and
    // build/icon-src is the single source for the ico, the tray, and the
    // sidebar mark, so the four never drift apart.
    for (const f of ['scripts/render-mark.js', 'scripts/make-hero-art.js',
      'build/icon-src/original/icon-master.svg', 'build/icon-src/icon-256.png']) {
      expect(fs.existsSync(path.join(ROOT, f)), `Missing: ${f}`).toBe(true);
    }
    const copyStatic = fs.readFileSync(path.join(ROOT, 'scripts', 'copy-static.mjs'), 'utf-8');
    expect(copyStatic).toContain("'icon-256.png'");
    expect(copyStatic).toContain("'bell.png'");
  });
});
