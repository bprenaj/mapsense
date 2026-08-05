import { contextBridge, ipcRenderer } from 'electron';
import type { MapSenseApi } from '../shared/types';
import type { EntitlementTier } from '../shared/constants';

const CH = {
  GET_BOOTSTRAP: 'mapsense:getBootstrap',
  PATCH_SETTINGS: 'mapsense:patchSettings',
  START_TRAINING: 'mapsense:startTraining',
  STOP_TRAINING: 'mapsense:stopTraining',
  SET_ENTITLEMENT: 'mapsense:setEntitlement',
  PICK_CUSTOM_SOUND: 'mapsense:pickCustomSound',
  OPEN_REGION_OVERLAY: 'mapsense:openRegionOverlay',
  CLEAR_HISTORY: 'mapsense:clearHistory',
  MINIMIZE_WINDOW: 'mapsense:minimizeWindow',
  CLOSE_WINDOW: 'mapsense:closeWindow',
  CHECK_CMP_REQUIRED: 'mapsense:checkCmpRequired',
  OPEN_CMP_WINDOW: 'mapsense:openCmpWindow',
  APPLY_PRESET: 'mapsense:applyPreset',
  UPDATER_CHECK: 'mapsense:updaterCheck',
  UPDATER_INSTALL: 'mapsense:updaterInstall',
  TRACK_EVENT: 'mapsense:trackEvent',
  SET_ANALYTICS_OPTOUT: 'mapsense:setAnalyticsOptOut',
  ON_STATE: 'mapsense:onState',
  ON_BEAM_STATUS: 'mapsense:onBeamStatus',
  ON_SESSION_COMPLETE: 'mapsense:onSessionComplete',
  ON_UPDATER_STATE: 'mapsense:onUpdaterState',
  PLAY_ALERT: 'mapsense:playAlert',
  STOP_ALERT: 'mapsense:stopAlert',
} as const;

const api: MapSenseApi = {
  getBootstrap: () => ipcRenderer.invoke(CH.GET_BOOTSTRAP),
  patchSettings: (patch) => ipcRenderer.invoke(CH.PATCH_SETTINGS, patch),
  startTraining: () => ipcRenderer.invoke(CH.START_TRAINING),
  stopTraining: () => ipcRenderer.invoke(CH.STOP_TRAINING),
  setEntitlement: (tier: EntitlementTier) => ipcRenderer.invoke(CH.SET_ENTITLEMENT, tier),
  pickCustomSound: () => ipcRenderer.invoke(CH.PICK_CUSTOM_SOUND),
  openRegionOverlay: () => ipcRenderer.invoke(CH.OPEN_REGION_OVERLAY),
  clearHistory: () => ipcRenderer.invoke(CH.CLEAR_HISTORY),
  minimizeWindow: () => ipcRenderer.send(CH.MINIMIZE_WINDOW),
  closeWindow: () => ipcRenderer.send(CH.CLOSE_WINDOW),
  checkCmpRequired: () => ipcRenderer.invoke(CH.CHECK_CMP_REQUIRED),
  openCmpWindow: () => ipcRenderer.invoke(CH.OPEN_CMP_WINDOW),
  applyPreset: (key: string) => ipcRenderer.invoke(CH.APPLY_PRESET, key),
  checkForUpdates: () => ipcRenderer.invoke(CH.UPDATER_CHECK),
  installUpdate: () => ipcRenderer.invoke(CH.UPDATER_INSTALL),
  track: (event: string, props?: Record<string, unknown>) =>
    ipcRenderer.send(CH.TRACK_EVENT, event, props ?? {}),
  setAnalyticsOptOut: (optOut: boolean) =>
    ipcRenderer.invoke(CH.SET_ANALYTICS_OPTOUT, optOut),
  onState: (cb) => {
    ipcRenderer.on(CH.ON_STATE, (_e, state) => cb(state));
  },
  onBeamStatus: (cb) => {
    ipcRenderer.on(CH.ON_BEAM_STATUS, (_e, status) => cb(status));
  },
  onSessionComplete: (cb) => {
    ipcRenderer.on(CH.ON_SESSION_COMPLETE, (_e, record) => cb(record));
  },
  onUpdaterState: (cb) => {
    ipcRenderer.on(CH.ON_UPDATER_STATE, (_e, state) => cb(state));
  },
  onPlayAlert: (cb) => {
    ipcRenderer.on(CH.PLAY_ALERT, (_e, sound) => cb(sound));
  },
  onStopAlert: (cb) => {
    ipcRenderer.on(CH.STOP_ALERT, () => cb());
  },
};

contextBridge.exposeInMainWorld('mapsenseApi', api);
