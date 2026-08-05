import { contextBridge, ipcRenderer } from 'electron';

const CH_REGION_CONFIRM = 'overlay:regionConfirm';
const CH_REGION_CANCEL = 'overlay:regionCancel';
const CH_REGION_INIT = 'overlay:regionInit';
const CH_ALERT_STATE = 'overlay:alertState';

contextBridge.exposeInMainWorld('regionOverlayApi', {
  confirmRegion: (rect: { x: number; y: number; width: number; height: number }) => {
    ipcRenderer.send(CH_REGION_CONFIRM, rect);
  },
  cancelRegion: () => {
    ipcRenderer.send(CH_REGION_CANCEL);
  },
  onInit: (cb: (data: { screenWidth: number; screenHeight: number }) => void) => {
    ipcRenderer.on(CH_REGION_INIT, (_e, data) => cb(data));
  },
});

contextBridge.exposeInMainWorld('alertOverlayApi', {
  onOverlayState: (cb: (active: boolean) => void) => {
    ipcRenderer.on(CH_ALERT_STATE, (_e, active) => cb(active));
  },
});

const CH_FLYOUT_INIT = 'flyout:init';
const CH_FLYOUT_INSTALL = 'flyout:install';
const CH_FLYOUT_LATER = 'flyout:later';

contextBridge.exposeInMainWorld('updateFlyoutApi', {
  onInit: (cb: (version: string) => void) => {
    ipcRenderer.on(CH_FLYOUT_INIT, (_e, version) => cb(version));
  },
  install: () => {
    ipcRenderer.send(CH_FLYOUT_INSTALL);
  },
  later: () => {
    ipcRenderer.send(CH_FLYOUT_LATER);
  },
});

const CH_PANEL_STATE = 'panel:state';
const CH_PANEL_ACTION = 'panel:action';
const CH_PANEL_HEIGHT = 'panel:height';

contextBridge.exposeInMainWorld('trayPanelApi', {
  onState: (cb: (state: unknown) => void) => {
    ipcRenderer.on(CH_PANEL_STATE, (_e, state) => cb(state));
  },
  action: (name: string) => {
    ipcRenderer.send(CH_PANEL_ACTION, name);
  },
  reportHeight: (height: number) => {
    ipcRenderer.send(CH_PANEL_HEIGHT, height);
  },
});
