import { Tray, nativeImage, BrowserWindow } from 'electron';
import * as path from 'path';
import type { BeamStatus } from '../../shared/constants';

// Branded MapSense tray icons with a status bubble baked in (generated at
// build time into dist/main/assets). NOTE: nativeImage.createFromBuffer
// only decodes PNG/JPEG -- the old raw-RGBA buffer approach produced an
// empty image and an invisible tray icon.
function trayIconFor(status: BeamStatus): Electron.NativeImage {
  const file =
    status === 'tracking' ? 'tray-tracking.png' :
    status === 'connecting' ? 'tray-connecting.png' :
    'tray-off.png';
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', file));
  if (img.isEmpty()) {
    console.error(`[Tray] icon asset missing or unreadable: ${file}`);
  }
  return img;
}

function statusLabelFor(status: BeamStatus): string {
  return status === 'tracking' ? 'Beam Eye Tracker: Tracking' :
    status === 'connecting' ? 'Beam Eye Tracker: Connecting...' :
    status === 'not_running' ? 'Beam Eye Tracker: Not Running' :
    'Beam Eye Tracker: Not Installed';
}

export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private status: BeamStatus = 'not_running';
  private onOpenPanel: (() => void) | null = null;
  private hiddenNoticeShown = false;

  /** Right-click opens the app's own quick panel instead of a native menu. */
  setPanelHandler(onOpenPanel: () => void): void {
    this.onOpenPanel = onOpenPanel;
  }

  create(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.tray = new Tray(trayIconFor(this.status));
    this.tray.setToolTip(`MapSense - Minimap awareness coach\n${statusLabelFor(this.status)}`);

    // Windows convention: a single left-click opens the app.
    this.tray.on('click', () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });
    this.tray.on('right-click', () => this.onOpenPanel?.());
    this.tray.on('double-click', () => {
      this.mainWindow?.show();
      this.mainWindow?.focus();
    });
  }

  /**
   * One-time balloon the first time the window hides to the tray, so
   * first-time users know the app did not close.
   */
  notifyHiddenToTray(): void {
    if (this.hiddenNoticeShown || !this.tray || process.platform !== 'win32') return;
    this.hiddenNoticeShown = true;
    this.tray.displayBalloon({
      title: 'MapSense is still running',
      content: 'Training keeps going in the tray. Click the icon to reopen, right-click for quick controls.',
      iconType: 'info',
    });
  }

  updateStatus(status: BeamStatus): void {
    this.status = status;
    if (this.tray) {
      this.tray.setImage(trayIconFor(status));
      this.tray.setToolTip(`MapSense - Minimap awareness coach\n${statusLabelFor(status)}`);
    }
  }

  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
