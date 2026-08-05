import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  shell,
  globalShortcut,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { IPC } from './ipc';
import {
  loadSettings,
  patchSettings,
  loadHistory,
  addSessionRecord,
  clearHistory,
  loadEntitlementTier,
  saveEntitlementTier,
  getInstallId,
  loadLastVersion,
  saveLastVersion,
} from './services/store';
import { getEntitlement, setEntitlement, isPaid, initEntitlement } from './services/entitlement';
import { migrateLegacyData, migrateRetiredBrandData } from './services/migration';
import { BeamBridge } from './services/beamBridge';
import { SessionEngine } from './services/sessionEngine';
import { AlertManager } from './services/alertManager';
import { IrlWebhook } from './services/irlWebhook';
import { TrayManager } from './services/tray';
import { UpdaterService, updaterCacheDir } from './services/updater';
import { AnalyticsService } from './services/analytics';
import { fileLogger } from './services/logger';
import { createOverlayWindow } from './services/overlayFactory';
import { getPreset, presetToRect } from '../shared/gamePresets';
import { POSTHOG_KEY, POSTHOG_HOST, isAnalyticsConfigured } from '../shared/analyticsConfig';
import type { EntitlementTier, TrainingMode } from '../shared/constants';
import type { MinimapRect, MapSenseSettings } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let alertOverlayWindow: BrowserWindow | null = null;
let updateFlyoutWindow: BrowserWindow | null = null;
let lastFlyoutVersion: string | null = null;
let regionOverlayWindow: BrowserWindow | null = null;
let regionResolve: ((rect: MinimapRect | null) => void) | null = null;
let regionPromise: Promise<MinimapRect | null> | null = null;
let registeredHotkey: string | null = null;

const beamBridge = new BeamBridge();
const sessionEngine = new SessionEngine();
const irlWebhook = new IrlWebhook();
const trayManager = new TrayManager();
const updater = new UpdaterService();
const analytics = new AnalyticsService();

const alertManager = new AlertManager({
  playAudio: (soundPath, volume) => {
    mainWindow?.webContents.send(IPC.PLAY_ALERT, { soundPath, volume });
  },
  stopAudio: () => {
    mainWindow?.webContents.send(IPC.STOP_ALERT);
  },
  showVisualAlert: (show) => {
    alertOverlayWindow?.webContents.send(IPC.ALERT_STATE, show);
    if (show) {
      alertOverlayWindow?.showInactive();
    } else {
      alertOverlayWindow?.hide();
    }
  },
  onIrlAlert: (active) => {
    if (active) irlWebhook.onAlertStart();
    else irlWebhook.onAlertStop();
  },
});

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function getOverlayPreloadPath(): string {
  return path.join(__dirname, 'overlayPreload.js');
}

function getRendererPath(file: string): string {
  return path.join(__dirname, '..', 'renderer', file);
}

/** Paid coaching requires entitlement; everything else falls back to free. */
function effectiveTrainingMode(settings: MapSenseSettings): TrainingMode {
  return settings.trainingMode === 'paid' && isPaid() ? 'paid' : 'free';
}

function configureSession(settings: MapSenseSettings): void {
  sessionEngine.configure({
    mode: effectiveTrainingMode(settings),
    timeoutS: settings.timeoutSeconds,
    tolerancePx: settings.tolerancePx,
    minimapRect: settings.minimapRect,
    regionName: settings.regionName,
  });
  alertManager.configure(settings.alertModes, settings.volume, settings.customSoundPath);
}

const RENDERER_LOG_BURST = 40;
const RENDERER_LOG_WINDOW_MS = 10_000;

/**
 * Mirror a renderer's console warnings and errors into the app log.
 *
 * Electron's file logger only wraps MAIN-process console, so a bug that lives
 * in a renderer (a dead click handler, a rejected IPC call) leaves zero trace
 * in main.log, which is exactly the "it does nothing and I have no logs" report.
 * Info is dropped so the file is not drowned, and a burst limit stops an error
 * loop from filling the disk.
 */
function forwardRendererConsole(win: BrowserWindow, tag: string): void {
  let count = 0;
  let windowStart = 0;
  // Electron 36 replaced this event's positional (level, message, line,
  // sourceId) arguments with a single details object. The dev runtime and the
  // packaged ow-electron runtime can be on different sides of that change, so
  // accept both shapes rather than betting on one.
  win.webContents.on('console-message', (...args: unknown[]) => {
    const [first, second] = args.slice(1);
    const details = (first && typeof first === 'object' ? first : null) as
      | { level?: string | number; message?: string }
      | null;
    const level = details ? details.level : first;
    const message = details ? String(details.message ?? '') : String(second ?? '');
    const isError = level === 'error' || level === 3;
    const isWarning = level === 'warning' || level === 2;
    if (!isError && !isWarning) return;

    const now = Date.now();
    if (now - windowStart > RENDERER_LOG_WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    if (count > RENDERER_LOG_BURST) return;
    if (count === RENDERER_LOG_BURST) {
      console.warn(`[${tag}] console flood, suppressing until it settles`);
      return;
    }
    (isError ? console.error : console.warn)(`[${tag}] ${message}`);
  });
}

/**
 * Branded window/taskbar/Alt-Tab icon. Set explicitly in every run: the
 * window icon is what Windows shows on the taskbar button and in Alt-Tab
 * while the app is open, and relying on the exe's embedded icon alone left
 * some contexts showing the ow-electron base icon. copy-static bundles
 * build/icon.ico into dist/main/assets so it is reachable when packaged
 * (build/ is not inside the asar); the build/ path is the dev fallback.
 */
function getWindowIconPath(): string | undefined {
  const bundled = path.join(__dirname, 'assets', 'icon.ico');
  if (fs.existsSync(bundled)) return bundled;
  const dev = path.join(__dirname, '..', '..', 'build', 'icon.ico');
  return fs.existsSync(dev) ? dev : undefined;
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#080E24',
    show: false,
    icon: getWindowIconPath(),
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(getRendererPath('index.html'));
  forwardRendererConsole(win, 'Renderer');

  // External links (Discord, Reddit share, IRL guide) go to the default
  // browser, never to a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    // Autostart boots stay in the tray silently; the user opted in and a
    // balloon every boot would be noise.
    if (!startHidden) win.show();
  });

  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
    trayManager.notifyHiddenToTray();
  });

  // A crashed renderer would otherwise leave a permanently blank window.
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Main] Renderer gone:', details.reason, `exitCode=${details.exitCode}`);
    if (details.reason !== 'clean-exit') {
      win.webContents.reload();
    }
  });

  return win;
}

function createAlertOverlay(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = createOverlayWindow({
    name: 'mapsense-alert',
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: getOverlayPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setIgnoreMouseEvents(true);
  win.loadFile(getRendererPath('alert-overlay.html'));
  return win;
}

function forceCloseRegionOverlay(): void {
  if (regionResolve) {
    regionResolve(null);
    regionResolve = null;
  }
  if (regionOverlayWindow && !regionOverlayWindow.isDestroyed()) {
    regionOverlayWindow.close();
  }
  regionOverlayWindow = null;
  globalShortcut.unregister('Escape');
}

function createRegionOverlay(): Promise<MinimapRect | null> {
  return new Promise((resolve) => {
    regionResolve = resolve;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    regionOverlayWindow = createOverlayWindow({
      name: 'mapsense-region',
      width,
      height,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        preload: getOverlayPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    regionOverlayWindow.loadFile(getRendererPath('region-overlay.html'));

    // Safety layer 1: intercept keys at the Chromium level so Escape/Enter
    // work even if the overlay renderer never loaded.
    regionOverlayWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'Escape') {
        event.preventDefault();
        forceCloseRegionOverlay();
      } else if (input.key === 'Enter') {
        event.preventDefault();
        regionOverlayWindow?.webContents
          .executeJavaScript('window.__pendingRect || null')
          .then((rect: unknown) => {
            if (isMinimapRect(rect)) {
              if (regionResolve) {
                regionResolve(rect);
                regionResolve = null;
              }
              regionOverlayWindow?.close();
            }
          })
          .catch(() => {});
      }
    });

    // Safety layer 2: the overlay can never outlive 60 seconds.
    const safetyTimeout = setTimeout(() => {
      forceCloseRegionOverlay();
    }, 60_000);

    // Safety layer 3: global Escape works even without window focus.
    globalShortcut.register('Escape', () => {
      forceCloseRegionOverlay();
    });

    regionOverlayWindow.once('ready-to-show', () => {
      regionOverlayWindow?.show();
      regionOverlayWindow?.focus();
      regionOverlayWindow?.webContents.send(IPC.REGION_INIT, {
        screenWidth: width,
        screenHeight: height,
      });
    });

    regionOverlayWindow.on('closed', () => {
      clearTimeout(safetyTimeout);
      globalShortcut.unregister('Escape');
      regionOverlayWindow = null;
      if (regionResolve) {
        regionResolve(null);
        regionResolve = null;
      }
    });
  });
}

/**
 * Branded update flyout: a frameless card in the tray corner, shown when an
 * update is staged while the main window is hidden (the in-window banner
 * covers the visible case). Guarded on the staged VERSION so 4h re-checks
 * of the same download never re-pop it (Tray App Standard timer hygiene).
 */
const FEEDBACK_URL = 'https://mapsense.featurebase.app';
const DISCORD_URL = 'https://discord.gg/khk2dq8Bj3';
const FLYOUT_W = 356;
const FLYOUT_H = 128;

function showUpdateFlyout(version: string): void {
  const wa = screen.getPrimaryDisplay().workArea;
  const x = wa.x + wa.width - FLYOUT_W - 16;
  const y = wa.y + wa.height - FLYOUT_H - 16;

  if (updateFlyoutWindow && !updateFlyoutWindow.isDestroyed()) {
    updateFlyoutWindow.webContents.send(IPC.FLYOUT_INIT, version);
    updateFlyoutWindow.showInactive();
    return;
  }

  updateFlyoutWindow = new BrowserWindow({
    width: FLYOUT_W,
    height: FLYOUT_H,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: getOverlayPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  updateFlyoutWindow.loadFile(getRendererPath('update-flyout.html'));
  updateFlyoutWindow.webContents.on('did-finish-load', () => {
    updateFlyoutWindow?.webContents.send(IPC.FLYOUT_INIT, version);
    // showInactive: the card must never steal focus from a game.
    updateFlyoutWindow?.showInactive();
  });
  updateFlyoutWindow.on('closed', () => {
    updateFlyoutWindow = null;
  });
}

function hideUpdateFlyout(): void {
  if (updateFlyoutWindow && !updateFlyoutWindow.isDestroyed()) {
    updateFlyoutWindow.hide();
  }
}

// ── Tray quick panel ────────────────────────────────────────────────────────
// Right-click on the tray opens this instead of a native context menu, so the
// tray carries the app's live toggles and status in the app's own brand
// (Tray App Standard). Created hidden at startup so the first summon opens at
// the right size rather than resizing in front of the user.
const PANEL_W = 306;
const PANEL_H_FALLBACK = 372;
let trayPanelWindow: BrowserWindow | null = null;
let trayPanelHeight = PANEL_H_FALLBACK;

function panelState() {
  return {
    training: sessionEngine.isRunning(),
    beamStatus: beamBridge.getStatus(),
    updater: updater.getState(),
    packaged: app.isPackaged,
  };
}

function pushPanelState(): void {
  if (trayPanelWindow && !trayPanelWindow.isDestroyed()) {
    trayPanelWindow.webContents.send(IPC.PANEL_STATE, panelState());
  }
}

function createTrayPanel(): BrowserWindow {
  const win = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H_FALLBACK,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: getOverlayPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium may treat a transparent unfocusable window as background and
      // delay its work by seconds; the panel must be instant.
      backgroundThrottling: false,
    },
  });
  win.loadFile(getRendererPath('tray-panel.html'));
  win.webContents.once('did-finish-load', () => {
    win.webContents.send(IPC.PANEL_STATE, panelState());
  });
  forwardRendererConsole(win, 'TrayPanel');
  win.on('blur', () => win.hide());
  // A dead renderer inside a transparent window looks exactly like the tray
  // ignoring clicks, so heal it rather than leaving an invisible husk.
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[TrayPanel] Renderer gone:', details.reason);
    if (details.reason !== 'clean-exit') win.webContents.reload();
  });
  win.on('closed', () => { trayPanelWindow = null; });
  return win;
}

function showTrayPanel(): void {
  if (!trayPanelWindow || trayPanelWindow.isDestroyed()) {
    trayPanelWindow = createTrayPanel();
  }
  const win = trayPanelWindow;
  const cursor = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(cursor).workArea;
  // Clamp to the work area: the reported height only fits if the screen has
  // room for it, and a panel running off-screen is unreachable.
  const h = Math.min(trayPanelHeight, wa.height - 8);
  const x = Math.min(Math.max(wa.x + 4, cursor.x - PANEL_W / 2), wa.x + wa.width - PANEL_W - 4);
  // A top taskbar puts the tray at the top, so anchor below the cursor there
  // and above it otherwise.
  const anchorBelow = cursor.y < wa.y + wa.height / 2;
  const y = anchorBelow
    ? Math.min(cursor.y + 10, wa.y + wa.height - h - 4)
    : Math.max(wa.y + 4, cursor.y - h - 10);

  win.setBounds({ x: Math.round(x), y: Math.round(y), width: PANEL_W, height: Math.round(h) });
  pushPanelState();
  win.show();
  // Focus is required for blur-to-hide to work at all. Unlike the update
  // flyout, this panel is opened by a deliberate click, so taking focus is
  // what the user asked for.
  win.focus();
}

function hideTrayPanel(): void {
  if (trayPanelWindow && !trayPanelWindow.isDestroyed()) trayPanelWindow.hide();
}

/**
 * ONE toggle, shared by the hotkey, the tray panel, and the window. Three
 * inputs each reimplementing start/stop is how they drift apart.
 */
function toggleTraining(): void {
  if (sessionEngine.isRunning()) {
    sessionEngine.stop();
    alertManager.dismiss();
  } else {
    configureSession(loadSettings());
    sessionEngine.start();
  }
  pushPanelState();
}

function cmpRequired(): boolean {
  try {
    const owElectron = require('@overwolf/ow-electron');
    return owElectron?.isCMPRequired?.() ?? false;
  } catch {
    return false; // not running under ow-electron
  }
}

/** Static props attached to every analytics event. */
function analyticsBaseProps() {
  return {
    appVersion: app.getVersion(),
    osPlatform: process.platform,
    entitlementTier: getEntitlement(),
  };
}

function isMinimapRect(value: unknown): value is MinimapRect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number'
  );
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.GET_BOOTSTRAP, () => ({
    settings: loadSettings(),
    entitlement: getEntitlement(),
    beamStatus: beamBridge.getStatus(),
    history: loadHistory(),
    appVersion: app.getVersion(),
    updater: updater.getState(),
    installId: getInstallId(),
  }));

  ipcMain.handle(IPC.PATCH_SETTINGS, (_e, patch: Partial<MapSenseSettings>) => {
    const updated = patchSettings(patch);
    applySettings(updated);
    return updated;
  });

  ipcMain.handle(IPC.START_TRAINING, () => {
    configureSession(loadSettings());
    sessionEngine.start();
    pushPanelState();
  });

  ipcMain.handle(IPC.STOP_TRAINING, () => {
    sessionEngine.stop();
    alertManager.dismiss();
    pushPanelState();
  });

  ipcMain.handle(IPC.SET_ENTITLEMENT, (_e, tier: EntitlementTier) => {
    return setEntitlement(tier);
  });

  ipcMain.handle(IPC.PICK_CUSTOM_SOUND, async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      console.warn('[Main] Custom sound: no main window, picker not opened');
      return '';
    }
    // A modal dialog is parented to the window, so a minimized or background
    // parent can leave the picker with nowhere visible to appear. Foreground
    // the parent first, then log the outcome: chosen, cancelled, and failed
    // are indistinguishable from the outside, which is what makes a broken
    // picker look like a dead button.
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    console.log('[Main] Custom sound: opening picker');
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose Alert Sound',
        filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac'] }],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        console.log('[Main] Custom sound: cancelled');
        return '';
      }
      console.log(`[Main] Custom sound: chose ${result.filePaths[0]}`);
      return result.filePaths[0];
    } catch (err) {
      console.error('[Main] Custom sound: picker failed', err);
      throw err;
    }
  });

  ipcMain.handle(IPC.OPEN_REGION_OVERLAY, () => {
    // Reuse the in-flight overlay if invoked again (e.g. double-click on the
    // button); a second createRegionOverlay would overwrite regionResolve and
    // strand the first invoke's promise forever.
    if (!regionPromise) {
      regionPromise = createRegionOverlay().finally(() => {
        regionPromise = null;
      });
    }
    return regionPromise;
  });

  ipcMain.handle(IPC.APPLY_PRESET, (_e, key: string) => {
    const preset = getPreset(key);
    const current = loadSettings();
    if (!preset || key === 'custom') return current;
    const { width, height } = screen.getPrimaryDisplay().size;
    const rect = presetToRect(preset, width, height);
    const updated = patchSettings({ minimapRect: rect, regionName: preset.name });
    applySettings(updated);
    return updated;
  });

  ipcMain.handle(IPC.CLEAR_HISTORY, () => {
    clearHistory();
  });

  ipcMain.handle(IPC.CHECK_CMP_REQUIRED, () => cmpRequired());

  ipcMain.on(IPC.TRACK_EVENT, (_e, event: string, props: Record<string, unknown>) => {
    analytics.capture(event, props);
  });

  ipcMain.handle(IPC.SET_ANALYTICS_OPTOUT, (_e, optOut: boolean) => {
    patchSettings({ analyticsOptOut: optOut });
    analytics.setOptedOut(optOut);
  });

  ipcMain.handle(IPC.OPEN_CMP_WINDOW, () => {
    try {
      const owElectron = require('@overwolf/ow-electron');
      owElectron?.openCMPWindow?.();
    } catch {
      /* not in ow-electron runtime */
    }
  });

  ipcMain.handle(IPC.UPDATER_CHECK, () => {
    updater.check();
  });

  ipcMain.handle(IPC.UPDATER_INSTALL, () => {
    updater.installNow();
  });

  ipcMain.on(IPC.MINIMIZE_WINDOW, () => {
    mainWindow?.minimize();
  });

  ipcMain.on(IPC.CLOSE_WINDOW, () => {
    mainWindow?.hide();
  });

  ipcMain.on(IPC.REGION_CONFIRM, (_e, rect: MinimapRect) => {
    if (regionResolve) {
      regionResolve(rect);
      regionResolve = null;
    }
    regionOverlayWindow?.close();
  });

  ipcMain.on(IPC.REGION_CANCEL, () => {
    if (regionResolve) {
      regionResolve(null);
      regionResolve = null;
    }
    regionOverlayWindow?.close();
  });
}

function applySettings(settings: MapSenseSettings): void {
  irlWebhook.configure(settings.irlEnabled, settings.irlPort, settings.irlWebhookUrl);
  alertManager.configure(settings.alertModes, settings.volume, settings.customSoundPath);
  applyLaunchAtStartup(settings.launchAtStartup);

  // Swap only our own hotkey; never unregisterAll -- the region overlay's
  // temporary Escape shortcut must survive settings changes.
  if (registeredHotkey && registeredHotkey !== settings.hotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }

  if (settings.hotkey && settings.hotkey !== registeredHotkey) {
    try {
      globalShortcut.register(settings.hotkey, toggleTraining);
      registeredHotkey = settings.hotkey;
    } catch (err: unknown) {
      console.error('[Main] Failed to register hotkey:', (err as Error).message);
    }
  }
}

/**
 * "Start with Windows": HKCU Run value named after the AppUserModelId,
 * written by Electron. Packaged only -- a dev run would register the bare
 * electron.exe. --hidden makes boot launches open straight to the tray
 * (see startHidden below). build/installer.nsh removes the Run value on
 * uninstall; keep the two in sync.
 */
function applyLaunchAtStartup(enabled: boolean): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
}

/** Boot launches (autostart) carry --hidden: tray only, no window pop-up. */
const startHidden = process.argv.includes('--hidden');

function wireEvents(): void {
  sessionEngine.on('state', (state) => {
    mainWindow?.webContents.send(IPC.ON_STATE, state);
  });

  // Single persistence path for every way a session can end (button, hotkey,
  // tray). Sub-10s sessions are noise and are not recorded.
  sessionEngine.on('sessionComplete', (record) => {
    if (record && record.durationS >= 10) {
      addSessionRecord(record);
      mainWindow?.webContents.send(IPC.ON_SESSION_COMPLETE, record);
      // Only aggregated, non-identifying metrics -- never gaze or region rect.
      analytics.capture('session_complete', {
        masScore: record.masScore,
        glancesPerMin: record.glancesPerMin,
        avgGapS: record.avgGapS,
        timeOnMapPct: record.timeOnMapPct,
        avgGlanceDurationMs: record.avgGlanceDurationMs,
        durationBucket: durationBucket(record.durationS),
        // The engine's configured mode, i.e. the mode this session actually
        // ran in (settings may say 'paid' while the session ran free).
        trainingMode: sessionEngine.getMode(),
      });
    }
  });

  sessionEngine.on('alert', (active: boolean) => {
    if (active) alertManager.trigger();
    else alertManager.dismiss();
  });

  beamBridge.onStatus = (status) => {
    mainWindow?.webContents.send(IPC.ON_BEAM_STATUS, status);
    trayManager.updateStatus(status);
    pushPanelState();
    analytics.capture('beam_status_changed', { beamStatus: status });
  };

  beamBridge.onGaze = (data) => {
    sessionEngine.onGaze(data);
  };

  beamBridge.onError = (msg) => {
    console.error('[BeamBridge]', msg);
  };
}

/** Coarse session-length bucket so exact durations never leave the machine. */
function durationBucket(durationS: number): string {
  if (durationS < 60) return 'under_1m';
  if (durationS < 300) return '1_5m';
  if (durationS < 900) return '5_15m';
  if (durationS < 1800) return '15_30m';
  return 'over_30m';
}

function initAnalytics(): void {
  const settings = loadSettings();
  analytics.init({
    isPackaged: app.isPackaged,
    isConfigured: isAnalyticsConfigured(),
    installId: getInstallId(),
    optedOut: settings.analyticsOptOut,
    // Anonymous opt-out model: consent is not blocked by default. Seam kept so
    // a future Overwolf consent-status API can flip this for denied regions.
    consentBlocked: false,
    baseProps: analyticsBaseProps(),
    getClient: () => {
      // Lazy: posthog-node is only needed in packaged, configured runs.
      const { PostHog } = require('posthog-node');
      return new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 10000 });
    },
  });

  // app_opened + first-launch-after-update, computed from the stored version.
  const previous = loadLastVersion();
  const current = app.getVersion();
  analytics.capture('app_opened', {});
  if (previous && previous !== current) {
    analytics.capture('update_installed', {});
  }
  saveLastVersion(current);
}

function initUpdater(): void {
  trayManager.setPanelHandler(showTrayPanel);
  updater.init({
    isPackaged: app.isPackaged,
    // Cache hygiene needs the packaged app-update.yml; dev runs pass null.
    cacheDir: app.isPackaged ? updaterCacheDir(process.resourcesPath) : null,
    getAutoUpdater: () => {
      // Lazy: electron-updater reads app metadata at require time and is
      // never needed in dev runs.
      const { autoUpdater } = require('electron-updater');
      return autoUpdater;
    },
    onStateChange: (state) => {
      mainWindow?.webContents.send(IPC.ON_UPDATER_STATE, state);
      pushPanelState();
      // Tray-corner flyout for tray-resident sessions; the in-window banner
      // already covers a visible window. Once per staged version.
      if (
        state.status === 'ready' &&
        state.availableVersion &&
        state.availableVersion !== lastFlyoutVersion &&
        !mainWindow?.isVisible()
      ) {
        lastFlyoutVersion = state.availableVersion;
        showUpdateFlyout(state.availableVersion);
      }
    },
  });

  ipcMain.on(IPC.FLYOUT_INSTALL, () => {
    hideUpdateFlyout();
    updater.installNow();
  });

  ipcMain.on(IPC.PANEL_HEIGHT, (_e, height: number) => {
    // The renderer measures itself: a hardcoded height only ever fits the
    // machine it was measured on, since fonts and DPI move it.
    if (typeof height === 'number' && height > 80 && height < 900) {
      trayPanelHeight = Math.round(height);
    }
  });

  ipcMain.on(IPC.PANEL_ACTION, (_e, name: string) => {
    switch (name) {
      case 'toggleTraining':
        toggleTraining();
        return;
      case 'installUpdate':
        hideTrayPanel();
        updater.installNow();
        return;
      case 'open':
        hideTrayPanel();
        mainWindow?.show();
        mainWindow?.focus();
        return;
      case 'log':
        hideTrayPanel();
        shell.openPath(path.join(app.getPath('userData'), 'logs'));
        return;
      case 'quit':
        // app.quit() runs cleanup and lets a staged update install on the way
        // out; process.exit() would skip both.
        app.quit();
        return;
      case 'feedback':
        hideTrayPanel();
        shell.openExternal(FEEDBACK_URL);
        return;
      case 'discord':
        hideTrayPanel();
        shell.openExternal(DISCORD_URL);
        return;
      case 'close':
        hideTrayPanel();
        return;
      default:
        console.warn('[TrayPanel] unknown action:', name);
    }
  });

  ipcMain.on(IPC.FLYOUT_LATER, () => {
    // Ignoring the flyout still installs on next quit (autoInstallOnAppQuit).
    hideUpdateFlyout();
  });
}

async function bootstrap(): Promise<void> {
  // Retired-brand copy must land before the store is first read.
  if (migrateRetiredBrandData()) {
    console.log('[Main] Migrated settings from retired 1.0.x brand dir');
  }
  migrateLegacyData();
  initEntitlement({
    get: () => loadEntitlementTier() as EntitlementTier | null,
    set: (tier) => saveEntitlementTier(tier),
  });
  const settings = loadSettings();
  applySettings(settings);

  mainWindow = createMainWindow();
  alertOverlayWindow = createAlertOverlay();
  trayManager.create(mainWindow);
  trayPanelWindow = createTrayPanel();

  registerIpcHandlers();
  wireEvents();
  initUpdater();
  initAnalytics();

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  beamBridge.start(width, height, app.getAppPath(), process.execPath);

  // Ads go live only after Overwolf enables this uid on their backend
  // (docs/monetization-overwolf.md). The uid is derived from productName +
  // author and only exists under the ow-electron runtime; log it so the
  // packaged app's main.log always carries the value to send to Overwolf.
  const owUid = process.env.OVERWOLF_APP_UID;
  if (owUid) {
    console.log(`[Main] Overwolf app uid: ${owUid}`);
  } else {
    console.log('[Main] Plain Electron runtime (no OVERWOLF_APP_UID); owadview stays inert');
  }
}

// App identity: name in menus/notifications and the Windows AppUserModelID
// that ties taskbar grouping and toasts to the installed shortcut. Setting
// the AUMID without that shortcut (dev runs) makes the taskbar fall back to
// the exe icon, so only set it when packaged.
app.setName('MapSense');
if (app.isPackaged) {
  app.setAppUserModelId('com.swisstropic.mapsense');
}

// Packaged runs have no console; mirror all console output into
// <userData>/logs/main.log so field issues leave a trace.
if (app.isPackaged) {
  fileLogger.init({ dir: path.join(app.getPath('userData'), 'logs') });
  fileLogger.hookConsole();
}

// Last-resort handlers: log instead of dying silently (packaged) or showing
// a raw error dialog. The tray app keeps running; the log tells us why.
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason instanceof Error ? reason : String(reason));
});
app.on('child-process-gone', (_e, details) => {
  console.error('[Main] Child process gone:', details.type, details.reason);
});

// Second launches (double-clicked shortcut while already in the tray) focus
// the existing window instead of spawning a second tray icon, a second
// updater, and an IRL port conflict.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.whenReady().then(bootstrap);
}

app.on('window-all-closed', () => {
  // Keep running: MapSense lives in the tray while training.
});

let quitStarted = false;
app.on('before-quit', (e) => {
  if (quitStarted) return;
  quitStarted = true;
  // Hold the quit open just long enough to flush queued analytics (the old
  // fire-and-forget flush lost session_complete events on quit-after-training).
  // Bounded so a dead network can never hang exit; quitAndInstall still works
  // because electron-updater installs on the real quit that follows.
  e.preventDefault();

  sessionEngine.stop();
  beamBridge.stop();
  irlWebhook.shutdown();
  trayManager.destroy();
  globalShortcut.unregisterAll();
  mainWindow?.removeAllListeners('close');
  mainWindow?.destroy();
  updateFlyoutWindow?.destroy();

  const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
  void Promise.race([analytics.shutdown(), timeout]).finally(() => {
    console.log('[Main] Shutdown complete');
    app.quit();
  });
});

app.on('activate', () => {
  mainWindow?.show();
});
