import type { AlertMode, BeamStatus, EntitlementTier, TrainingMode, UpdaterStatus } from './constants';

export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedRegion {
  name: string;
  rect: MinimapRect;
}

export interface GamePreset {
  name: string;
  minimapX: number;
  minimapY: number;
  minimapW: number;
  minimapH: number;
  description: string;
}

export interface MapSenseSettings {
  timeoutSeconds: number;
  volume: number;
  tolerancePx: number;
  alertModes: AlertMode[];
  customSoundPath: string;
  minimapRect: MinimapRect | null;
  regionName: string;
  savedRegions: SavedRegion[];
  hotkey: string;
  irlEnabled: boolean;
  irlPort: number;
  irlWebhookUrl: string;
  firstRun: boolean;
  trainingMode: TrainingMode;
  analyticsOptOut: boolean;
  launchAtStartup: boolean;
}

export interface SessionMetrics {
  glanceCount: number;
  glancesPerMin: number;
  avgGlanceDurationMs: number;
  avgGapS: number;
  longestGapS: number;
  alertsTriggered: number;
  alertFreeStreakS: number;
  timeOnMapPct: number;
  durationS: number;
}

export interface SessionRecord {
  timestamp: number;
  durationS: number;
  glanceCount: number;
  glancesPerMin: number;
  avgGlanceDurationMs: number;
  avgGapS: number;
  longestGapS: number;
  alertsTriggered: number;
  alertFreeStreakS: number;
  timeOnMapPct: number;
  masScore: number;
  regionName: string;
}

export interface TrainingState {
  running: boolean;
  mode: TrainingMode;
  elapsedS: number;
  timeSinceLastGlanceS: number;
  alertActive: boolean;
  metrics: SessionMetrics;
  masScore: number;
}

export interface GazeData {
  x: number;
  y: number;
  isTracking: boolean;
}

export interface UpdaterState {
  status: UpdaterStatus;
  availableVersion: string | null;
  error: string | null;
}

export interface AlertSound {
  soundPath: string;
  volume: number;
}

export interface BootstrapPayload {
  settings: MapSenseSettings;
  entitlement: EntitlementTier;
  beamStatus: BeamStatus;
  history: SessionRecord[];
  appVersion: string;
  updater: UpdaterState;
  installId: string;
}

export interface MapSenseApi {
  getBootstrap(): Promise<BootstrapPayload>;
  patchSettings(patch: Partial<MapSenseSettings>): Promise<MapSenseSettings>;
  startTraining(): Promise<void>;
  stopTraining(): Promise<void>;
  setEntitlement(tier: EntitlementTier): Promise<EntitlementTier>;
  pickCustomSound(): Promise<string>;
  openRegionOverlay(): Promise<MinimapRect | null>;
  clearHistory(): Promise<void>;
  minimizeWindow(): void;
  closeWindow(): void;
  checkCmpRequired(): Promise<boolean>;
  openCmpWindow(): Promise<void>;
  applyPreset(key: string): Promise<MapSenseSettings>;
  checkForUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  track(event: string, props?: Record<string, unknown>): void;
  setAnalyticsOptOut(optOut: boolean): Promise<void>;
  onState(cb: (state: TrainingState) => void): void;
  onBeamStatus(cb: (status: BeamStatus) => void): void;
  onSessionComplete(cb: (record: SessionRecord) => void): void;
  onUpdaterState(cb: (state: UpdaterState) => void): void;
  onPlayAlert(cb: (sound: AlertSound) => void): void;
  onStopAlert(cb: () => void): void;
}
