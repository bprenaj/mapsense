import { EventEmitter } from 'events';
import { computeMas, stdDev } from '../../shared/mas';
import { gazeInRegion } from '../../shared/region';
import type { MinimapRect, SessionMetrics, SessionRecord, TrainingState, GazeData } from '../../shared/types';
import type { TrainingMode } from '../../shared/constants';
import { ALERT_COOLDOWN_MS } from '../../shared/constants';

const TICK_MS = 100;
// How long a free-mode reminder stays lit before the cycle re-arms.
const FREE_PING_MS = 1800;

export class SessionEngine extends EventEmitter {
  private running = false;
  private mode: TrainingMode = 'free';
  private timeoutS = 5;
  private tolerancePx = 10;
  private minimapRect: MinimapRect | null = null;
  private regionName = '';

  private startTime = 0;
  private lastGlanceTime = 0;
  private glanceStart = 0;
  private inGlance = false;
  private alertActive = false;
  private lastAlertTime = 0;

  private glanceCount = 0;
  private gazeDurationsMs: number[] = [];
  private gapDurationsMs: number[] = [];
  private longestGapMs = 0;
  private alertsTriggered = 0;
  private bestAlertFreeMs = 0;
  private currentAlertFreeMs = 0;
  private totalGazeOnMapMs = 0;

  private tickTimer: ReturnType<typeof setInterval> | null = null;

  configure(opts: {
    mode: TrainingMode;
    timeoutS: number;
    tolerancePx: number;
    minimapRect: MinimapRect | null;
    regionName?: string;
  }): void {
    this.mode = opts.mode;
    this.timeoutS = opts.timeoutS;
    this.tolerancePx = opts.tolerancePx;
    this.minimapRect = opts.minimapRect;
    if (opts.regionName !== undefined) this.regionName = opts.regionName;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startTime = Date.now();
    this.lastGlanceTime = Date.now();
    this.resetCounters();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    this.emitState();
  }

  stop(): SessionRecord | null {
    if (!this.running) return null;
    this.running = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    if (this.inGlance) {
      this.endGlance();
    }

    const record = this.buildRecord();
    this.emit('sessionComplete', record);
    this.emitState();
    return record;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** The mode the engine was configured with (the mode a finished session ran in). */
  getMode(): TrainingMode {
    return this.mode;
  }

  /** Called by the Beam bridge on each gaze frame (paid mode). */
  onGaze(data: GazeData): void {
    if (!this.running || this.mode !== 'paid' || !this.minimapRect) return;

    if (data.isTracking && gazeInRegion(this.minimapRect, this.tolerancePx, data.x, data.y)) {
      if (!this.inGlance) {
        this.beginGlance();
      }
    } else {
      if (this.inGlance) {
        this.endGlance();
      }
    }
  }

  getState(): TrainingState {
    const now = Date.now();
    const elapsedS = this.running ? (now - this.startTime) / 1000 : 0;
    const timeSinceLastGlanceS = this.running ? (now - this.lastGlanceTime) / 1000 : 0;
    return {
      running: this.running,
      mode: this.mode,
      elapsedS,
      timeSinceLastGlanceS,
      alertActive: this.alertActive,
      metrics: this.getMetrics(elapsedS),
      masScore: this.getMasScore(elapsedS),
    };
  }

  private tick(): void {
    const now = Date.now();
    const gapS = (now - this.lastGlanceTime) / 1000;

    if (gapS >= this.timeoutS) {
      if (!this.alertActive && now - this.lastAlertTime >= ALERT_COOLDOWN_MS) {
        this.alertActive = true;
        this.alertsTriggered++;
        this.lastAlertTime = now;
        this.currentAlertFreeMs = 0;
        this.emit('alert', true);

        // Without an eye tracker the app cannot see whether the player looked,
        // so a free-mode reminder is a PING on a cycle, not an alarm waiting to
        // be acknowledged: nothing in free mode could ever acknowledge it, and
        // an alarm that cannot be cleared just runs forever.
        if (this.mode === 'free') {
          this.lastGlanceTime = now;
          setTimeout(() => {
            if (this.running && this.alertActive) {
              this.alertActive = false;
              this.emit('alert', false);
            }
          }, FREE_PING_MS);
        }
      }
    }

    if (!this.alertActive) {
      this.currentAlertFreeMs += TICK_MS;
      if (this.currentAlertFreeMs > this.bestAlertFreeMs) {
        this.bestAlertFreeMs = this.currentAlertFreeMs;
      }
    }

    if (this.inGlance) {
      this.totalGazeOnMapMs += TICK_MS;
    }

    this.emitState();
  }

  private beginGlance(): void {
    const now = Date.now();
    const gapMs = now - this.lastGlanceTime;
    if (this.glanceCount > 0) {
      this.gapDurationsMs.push(gapMs);
      if (gapMs > this.longestGapMs) this.longestGapMs = gapMs;
    }

    this.inGlance = true;
    this.glanceStart = now;
    this.glanceCount++;
    this.lastGlanceTime = now;

    if (this.alertActive) {
      this.alertActive = false;
      this.emit('alert', false);
    }
  }

  private endGlance(): void {
    if (!this.inGlance) return;
    const duration = Date.now() - this.glanceStart;
    this.gazeDurationsMs.push(duration);
    this.inGlance = false;
  }

  private resetCounters(): void {
    this.glanceCount = 0;
    this.gazeDurationsMs = [];
    this.gapDurationsMs = [];
    this.longestGapMs = 0;
    this.alertsTriggered = 0;
    this.bestAlertFreeMs = 0;
    this.currentAlertFreeMs = 0;
    this.totalGazeOnMapMs = 0;
    this.alertActive = false;
    this.inGlance = false;
    this.lastAlertTime = 0;
  }

  private getMetrics(elapsedS: number): SessionMetrics {
    const durationMin = elapsedS / 60;
    const glancesPerMin = durationMin > 0 ? this.glanceCount / durationMin : 0;
    const avgGlanceDurationMs =
      this.gazeDurationsMs.length > 0
        ? this.gazeDurationsMs.reduce((a, b) => a + b, 0) / this.gazeDurationsMs.length
        : 0;
    const avgGapS =
      this.gapDurationsMs.length > 0
        ? this.gapDurationsMs.reduce((a, b) => a + b, 0) / this.gapDurationsMs.length / 1000
        : 0;
    const totalMs = elapsedS * 1000;
    const timeOnMapPct = totalMs > 0 ? (this.totalGazeOnMapMs / totalMs) * 100 : 0;

    return {
      glanceCount: this.glanceCount,
      glancesPerMin: Math.round(glancesPerMin * 10) / 10,
      avgGlanceDurationMs: Math.round(avgGlanceDurationMs),
      avgGapS: Math.round(avgGapS * 10) / 10,
      longestGapS: Math.round(this.longestGapMs / 100) / 10,
      alertsTriggered: this.alertsTriggered,
      alertFreeStreakS: Math.round(this.bestAlertFreeMs / 100) / 10,
      timeOnMapPct: Math.round(timeOnMapPct * 10) / 10,
      durationS: Math.round(elapsedS),
    };
  }

  private getMasScore(elapsedS: number): number {
    if (elapsedS < 5 || this.glanceCount < 2) return 0;
    const m = this.getMetrics(elapsedS);
    const gapStdDev = stdDev(this.gapDurationsMs.map((g) => g / 1000));
    return computeMas(m.glancesPerMin, m.avgGapS, m.avgGlanceDurationMs, gapStdDev);
  }

  private buildRecord(): SessionRecord {
    const elapsedS = (Date.now() - this.startTime) / 1000;
    const m = this.getMetrics(elapsedS);
    return {
      timestamp: Date.now(),
      durationS: m.durationS,
      glanceCount: m.glanceCount,
      glancesPerMin: m.glancesPerMin,
      avgGlanceDurationMs: m.avgGlanceDurationMs,
      avgGapS: m.avgGapS,
      longestGapS: m.longestGapS,
      alertsTriggered: m.alertsTriggered,
      alertFreeStreakS: m.alertFreeStreakS,
      timeOnMapPct: m.timeOnMapPct,
      masScore: this.getMasScore(elapsedS),
      regionName: this.regionName,
    };
  }

  private emitState(): void {
    this.emit('state', this.getState());
  }
}
