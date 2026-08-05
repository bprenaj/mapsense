import { describe, it, expect } from 'vitest';
import { IPC } from '../../src/main/ipc';

describe('IPC channel constants', () => {
  it('has unique values for all channels', () => {
    const values = Object.values(IPC);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all channels carry a known surface prefix', () => {
    const prefixes = ['mapsense:', 'overlay:', 'flyout:', 'panel:'];
    for (const value of Object.values(IPC)) {
      expect(prefixes.some((p) => value.startsWith(p)), `Unprefixed channel: ${value}`).toBe(true);
    }
  });

  it('has required handler channels', () => {
    expect(IPC.GET_BOOTSTRAP).toBeDefined();
    expect(IPC.PATCH_SETTINGS).toBeDefined();
    expect(IPC.START_TRAINING).toBeDefined();
    expect(IPC.STOP_TRAINING).toBeDefined();
    expect(IPC.MARK_MANUAL_GLANCE).toBeDefined();
    expect(IPC.SET_ENTITLEMENT).toBeDefined();
    expect(IPC.PICK_CUSTOM_SOUND).toBeDefined();
    expect(IPC.OPEN_REGION_OVERLAY).toBeDefined();
    expect(IPC.CLEAR_HISTORY).toBeDefined();
  });

  it('has required push channels', () => {
    expect(IPC.ON_STATE).toBeDefined();
    expect(IPC.ON_BEAM_STATUS).toBeDefined();
    expect(IPC.ON_SESSION_COMPLETE).toBeDefined();
  });

  it('has required overlay channels', () => {
    expect(IPC.REGION_CONFIRM).toBeDefined();
    expect(IPC.REGION_CANCEL).toBeDefined();
    expect(IPC.REGION_INIT).toBeDefined();
    expect(IPC.ALERT_STATE).toBeDefined();
  });
});
