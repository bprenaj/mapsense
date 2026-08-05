export const IPC = {
  GET_BOOTSTRAP: 'mapsense:getBootstrap',
  PATCH_SETTINGS: 'mapsense:patchSettings',
  START_TRAINING: 'mapsense:startTraining',
  STOP_TRAINING: 'mapsense:stopTraining',
  MARK_MANUAL_GLANCE: 'mapsense:markManualGlance',
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

  // Main -> Renderer push events
  ON_STATE: 'mapsense:onState',
  ON_BEAM_STATUS: 'mapsense:onBeamStatus',
  ON_SESSION_COMPLETE: 'mapsense:onSessionComplete',
  ON_UPDATER_STATE: 'mapsense:onUpdaterState',
  PLAY_ALERT: 'mapsense:playAlert',
  STOP_ALERT: 'mapsense:stopAlert',

  // Overlay channels
  REGION_CONFIRM: 'overlay:regionConfirm',
  REGION_CANCEL: 'overlay:regionCancel',
  REGION_INIT: 'overlay:regionInit',
  ALERT_STATE: 'overlay:alertState',

  // Update flyout (branded tray-corner card, shown while the window is hidden)
  FLYOUT_INIT: 'flyout:init',
  FLYOUT_INSTALL: 'flyout:install',
  FLYOUT_LATER: 'flyout:later',

  // Tray quick panel (right-click on the tray; replaces the native menu)
  PANEL_STATE: 'panel:state',
  PANEL_ACTION: 'panel:action',
  PANEL_HEIGHT: 'panel:height',
} as const;
