import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionEngine } from '../../src/main/services/sessionEngine';

describe('SessionEngine - Paid Mode', () => {
  let engine: SessionEngine;
  const RECT = { x: 1600, y: 860, width: 310, height: 220 };

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new SessionEngine();
    engine.configure({
      mode: 'paid',
      timeoutS: 5,
      tolerancePx: 10,
      minimapRect: RECT,
    });
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  it('detects gaze entering region', () => {
    engine.start();
    engine.onGaze({ x: 1650, y: 900, isTracking: true });
    vi.advanceTimersByTime(200);
    const state = engine.getState();
    expect(state.metrics.glanceCount).toBe(1);
  });

  it('ignores gaze outside region', () => {
    engine.start();
    engine.onGaze({ x: 500, y: 500, isTracking: true });
    vi.advanceTimersByTime(200);
    expect(engine.getState().metrics.glanceCount).toBe(0);
  });

  it('respects tolerance margin', () => {
    engine.start();
    // Just outside the rect but within 10px tolerance
    engine.onGaze({ x: 1595, y: 855, isTracking: true });
    vi.advanceTimersByTime(200);
    expect(engine.getState().metrics.glanceCount).toBe(1);
  });

  it('triggers alert after timeout without glance', () => {
    const alertHandler = vi.fn();
    engine.on('alert', alertHandler);
    engine.start();
    vi.advanceTimersByTime(5100);
    expect(alertHandler).toHaveBeenCalledWith(true);
  });

  it('dismisses alert when gaze enters region', () => {
    const alertHandler = vi.fn();
    engine.on('alert', alertHandler);
    engine.start();
    vi.advanceTimersByTime(5100);
    engine.onGaze({ x: 1650, y: 900, isTracking: true });
    vi.advanceTimersByTime(100);
    expect(alertHandler).toHaveBeenCalledWith(false);
  });

  it('tracks gaze duration', () => {
    engine.start();
    engine.onGaze({ x: 1650, y: 900, isTracking: true });
    vi.advanceTimersByTime(300);
    engine.onGaze({ x: 500, y: 500, isTracking: true });
    vi.advanceTimersByTime(100);
    const state = engine.getState();
    expect(state.metrics.avgGlanceDurationMs).toBeGreaterThan(0);
  });

  it('ignores non-tracking gaze', () => {
    engine.start();
    engine.onGaze({ x: 1650, y: 900, isTracking: false });
    vi.advanceTimersByTime(200);
    expect(engine.getState().metrics.glanceCount).toBe(0);
  });

  it('computes MAS after sufficient data', () => {
    engine.start();
    for (let i = 0; i < 10; i++) {
      engine.onGaze({ x: 1650, y: 900, isTracking: true });
      vi.advanceTimersByTime(300);
      engine.onGaze({ x: 500, y: 500, isTracking: true });
      vi.advanceTimersByTime(3000);
    }
    const state = engine.getState();
    expect(state.masScore).toBeGreaterThan(0);
  });

  it('does not process gaze when no minimap rect', () => {
    engine.configure({ mode: 'paid', timeoutS: 5, tolerancePx: 10, minimapRect: null });
    engine.start();
    engine.onGaze({ x: 1650, y: 900, isTracking: true });
    vi.advanceTimersByTime(200);
    expect(engine.getState().metrics.glanceCount).toBe(0);
  });
});
