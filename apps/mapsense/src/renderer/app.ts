/* Renderer script - NOT a module (no import/export, loaded via <script> tag) */

interface MinimapRect { x: number; y: number; width: number; height: number; }
interface SavedRegion { name: string; rect: MinimapRect; }
interface SessionMetrics {
  glanceCount: number; glancesPerMin: number; avgGlanceDurationMs: number;
  avgGapS: number; longestGapS: number; alertsTriggered: number;
  alertFreeStreakS: number; timeOnMapPct: number; durationS: number;
}
interface SessionRecord {
  timestamp: number; durationS: number; glanceCount: number; glancesPerMin: number;
  avgGlanceDurationMs: number; avgGapS: number; longestGapS: number;
  alertsTriggered: number; alertFreeStreakS: number; timeOnMapPct: number;
  masScore: number; regionName: string;
}
interface TrainingState {
  running: boolean; mode: string; elapsedS: number; timeSinceLastGlanceS: number;
  alertActive: boolean; metrics: SessionMetrics; masScore: number;
}
interface MapSenseSettings {
  timeoutSeconds: number; volume: number; tolerancePx: number;
  alertModes: string[]; customSoundPath: string; minimapRect: MinimapRect | null;
  regionName: string; savedRegions: SavedRegion[]; hotkey: string;
  irlEnabled: boolean; irlPort: number; irlWebhookUrl: string;
  firstRun: boolean; trainingMode: string; analyticsOptOut: boolean;
  launchAtStartup: boolean;
}
interface UpdaterState {
  status: string; availableVersion: string | null; error: string | null;
}
interface AlertSound { soundPath: string; volume: number; }
interface BootstrapPayload {
  settings: MapSenseSettings; entitlement: string; beamStatus: string; history: SessionRecord[];
  appVersion: string; updater: UpdaterState; installId: string;
}
interface MapSenseApi {
  getBootstrap(): Promise<BootstrapPayload>;
  patchSettings(patch: Partial<MapSenseSettings>): Promise<MapSenseSettings>;
  startTraining(): Promise<void>;
  stopTraining(): Promise<void>;
  markManualGlance(): Promise<void>;
  setEntitlement(tier: string): Promise<string>;
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
  onBeamStatus(cb: (status: string) => void): void;
  onSessionComplete(cb: (record: SessionRecord) => void): void;
  onUpdaterState(cb: (state: UpdaterState) => void): void;
  onPlayAlert(cb: (sound: AlertSound) => void): void;
  onStopAlert(cb: () => void): void;
}

const api = (window as unknown as { mapsenseApi: MapSenseApi }).mapsenseApi;

let currentSettings: MapSenseSettings;
let currentEntitlement = 'free';
let historyRecords: SessionRecord[] = [];
let chartInstance: { destroy: () => void } | null = null;
let updateBannerDismissed = false;
let updateCheckRequested = false;
let selectedChartMetric = 'masScore';

const DISCORD_URL = 'https://discord.gg/khk2dq8Bj3';
const FEEDBACK_URL = 'https://mapsense.featurebase.app';
const WEBSITE_URL = 'https://getmapsense.com';
const SUPPORT_EMAIL = 'support@getmapsense.com';
const REDDIT_SHARE_BASE = 'https://www.reddit.com/r/leagueoflegends/submit';
const IRL_AI_PROMPT = `I am using MapSense (https://beameyetracker.com), a desktop app that trains minimap awareness for gamers using the Beam Eye Tracker. When I forget to check my minimap, MapSense sends HTTP POST webhooks from localhost:9876 with JSON body {"event": "alert_start"} or {"event": "alert_stop"}. It also exposes GET http://localhost:9876/status for polling.

I want to build a creative, safe, desk-friendly physical alert gadget that lights up or makes noise when I get a webhook. Give me concise, exact, copy-paste-ready instructions for:
1. Hardware shopping list (Raspberry Pi, Arduino, or ESP32 based)
2. Wiring diagram for an LED strip, desk light, small buzzer, or mini flag
3. Complete Python or Arduino code that listens for the MapSense webhooks and activates the hardware
4. How to connect the device to MapSense on my local network

Keep it practical, safe, and implementable in one sitting. No theory, just step-by-step build instructions.`;

const METRIC_RANGES: Record<string, { goodLo: number; goodHi: number; warnLo: number; warnHi: number; higherIsBetter: boolean | null }> = {
  rate:       { goodLo: 6.0, goodHi: 999, warnLo: 3.0, warnHi: 6.0, higherIsBetter: true },
  avgGap:     { goodLo: 0, goodHi: 8.0, warnLo: 8.0, warnHi: 15.0, higherIsBetter: false },
  mapTime:    { goodLo: 8.0, goodHi: 15.0, warnLo: 4.0, warnHi: 20.0, higherIsBetter: null },
  procSpeed:  { goodLo: 0, goodHi: 500, warnLo: 500, warnHi: 1000, higherIsBetter: false },
  longestGap: { goodLo: 0, goodHi: 10.0, warnLo: 10.0, warnHi: 20.0, higherIsBetter: false },
  alerts:     { goodLo: 0, goodHi: 3, warnLo: 3, warnHi: 8, higherIsBetter: false },
  alertFree:  { goodLo: 30, goodHi: 999, warnLo: 15, warnHi: 30, higherIsBetter: true },
};

// One metric plotted at a time (mixed units on one axis is unreadable);
// the picker above the chart switches series.
const CHART_METRICS = [
  { key: 'masScore', label: 'MAS', color: '#C8A246', unit: '' },
  { key: 'glancesPerMin', label: 'Check rate', color: '#00D4FF', unit: '/min' },
  { key: 'avgGapS', label: 'Response', color: '#FF617C', unit: 's' },
  { key: 'timeOnMapPct', label: 'Attention', color: '#61CBFF', unit: '%' },
  { key: 'avgGlanceDurationMs', label: 'Glance speed', color: '#BD61FF', unit: 'ms' },
  { key: 'durationS', label: 'Duration', color: '#6189FF', unit: 's' },
  { key: 'glanceCount', label: 'Glances', color: '#61FFF1', unit: '' },
  { key: 'longestGapS', label: 'Longest blind', color: '#FF61FF', unit: 's' },
  { key: 'alertsTriggered', label: 'Alerts', color: '#FFB74D', unit: '' },
  { key: 'alertFreeStreakS', label: 'Best streak', color: '#00E5A0', unit: 's' },
];

// Benchmark bars on the four primary KPI cards: value scaled onto a fixed
// track whose green band marks the target zone (matches the static markup).
const KPI_BENCH: Record<string, { barId: string; scaleMax: number }> = {
  rate: { barId: 'benchRate', scaleMax: 10 },
  avgGap: { barId: 'benchAvgGap', scaleMax: 20 },
  mapTime: { barId: 'benchMapTime', scaleMax: 30 },
  procSpeed: { barId: 'benchProcSpeed', scaleMax: 1500 },
};

function $(id: string) { return document.getElementById(id)!; }

function navigateTo(page: string): void {
  document.querySelectorAll('.page').forEach((el) => el.classList.remove('page--active'));
  document.querySelectorAll('.nav-item[data-page]').forEach((el) => el.classList.remove('nav-active'));
  $(`page${page.charAt(0).toUpperCase() + page.slice(1)}`).classList.add('page--active');
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('nav-active');
}

function updateBeamStatus(status: string): void {
  const dot = $('beamStatusDot');
  const label = $('beamStatusLabel');
  dot.className = 'beam-dot';
  switch (status) {
    case 'tracking':
      dot.classList.add('beam-dot--tracking'); label.textContent = 'Tracking'; break;
    case 'connecting':
      dot.classList.add('beam-dot--connecting'); label.textContent = 'Connecting...'; break;
    case 'not_running':
      dot.classList.add('beam-dot--off'); label.textContent = 'Not Running'; break;
    default:
      dot.classList.add('beam-dot--off'); label.textContent = 'Not Installed';
  }
}

function syncSettingsToUI(s: MapSenseSettings): void {
  ($('settingMode') as HTMLSelectElement).value = s.trainingMode;
  ($('settingTimeout') as HTMLInputElement).value = String(s.timeoutSeconds);
  $('settingTimeoutValue').textContent = `${s.timeoutSeconds}s`;
  ($('settingTolerance') as HTMLInputElement).value = String(s.tolerancePx);
  $('settingToleranceValue').textContent = `${s.tolerancePx}px`;
  ($('settingVolume') as HTMLInputElement).value = String(s.volume);
  $('settingVolumeValue').textContent = `${s.volume}%`;
  syncTogglePills(s.alertModes);
  $('customSoundLabel').textContent = s.customSoundPath ? s.customSoundPath.split(/[\\/]/).pop()! : 'Default';
  ($('settingIrlEnabled') as HTMLInputElement).checked = s.irlEnabled;
  ($('settingIrlPort') as HTMLInputElement).value = String(s.irlPort);
  ($('settingIrlUrl') as HTMLInputElement).value = s.irlWebhookUrl;
  ($('settingHotkey') as HTMLInputElement).value = s.hotkey;
  // Checkbox is "send data" = the inverse of the stored opt-out flag.
  ($('settingAnalytics') as HTMLInputElement).checked = !s.analyticsOptOut;
  ($('settingLaunchAtStartup') as HTMLInputElement).checked = s.launchAtStartup;
  updateRegionUI(s);
  $('modeLabel').textContent = s.trainingMode === 'paid' ? 'Pro Mode' : 'Free Mode';
}

function syncTogglePills(modes: string[]): void {
  document.querySelectorAll('.toggle-pill').forEach((btn) => {
    const mode = (btn as HTMLElement).dataset.mode!;
    btn.classList.toggle('active', modes.includes(mode));
  });
}

function updateRegionUI(s: MapSenseSettings): void {
  const hasRegion = !!s.minimapRect;
  $('regionGate').style.display = hasRegion ? 'none' : 'flex';
  $('coachContent').style.display = hasRegion ? 'block' : 'none';
  $('regionLabel').textContent = s.regionName || (hasRegion ? 'Custom Region' : 'No region');
  if (s.savedRegions.length > 0) {
    $('savedRegionsSection').style.display = 'block';
    const sel = $('settingSavedRegion') as HTMLSelectElement;
    sel.innerHTML = s.savedRegions.map((r) => `<option value="${r.name}">${r.name}</option>`).join('');
    sel.value = s.regionName;
  }
}

function updateAdBanner(): void {
  // Ads are a free-tier surface; trial and paid are both ad-free.
  $('adBanner').style.display = currentEntitlement === 'free' ? '' : 'none';
  const plan =
    currentEntitlement === 'paid' ? 'Pro' :
    currentEntitlement === 'trial' ? 'Pro Trial' : 'Free';
  $('planLabel').textContent = `Plan: ${plan}`;
}

function isEntitledToPro(): boolean {
  return currentEntitlement === 'paid' || currentEntitlement === 'trial';
}

function showProModal(): void { $('proModal').style.display = 'flex'; }
function hideProModal(): void { $('proModal').style.display = 'none'; }

async function startProTrial(): Promise<void> {
  api.track('trial_started');
  currentEntitlement = await api.setEntitlement('trial');
  api.track('entitlement_set', { entitlementTier: currentEntitlement });
  hideProModal();
  updateAdBanner();
  await patchSetting({ trainingMode: 'paid' });
}

function updaterStatusText(state: UpdaterState, appVersion?: string): string {
  switch (state.status) {
    case 'checking': return 'Checking...';
    case 'downloading': return `Downloading v${state.availableVersion ?? '?'}...`;
    case 'ready': return `v${state.availableVersion ?? '?'} ready to install`;
    case 'error': return updateCheckRequested ? `Check failed: ${state.error ?? 'unknown'}` : 'Up to date';
    case 'disabled': return 'Auto-update off (dev build)';
    default: return appVersion ? `Up to date (v${appVersion})` : 'Up to date';
  }
}

function renderUpdaterState(state: UpdaterState): void {
  $('updateStatusLabel').textContent = updaterStatusText(state);
  const banner = $('updateBanner');
  if (state.status === 'ready' && !updateBannerDismissed) {
    $('updateBannerText').textContent = `MapSense v${state.availableVersion ?? ''} is ready to install.`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function collectAlertModes(): string[] {
  const modes: string[] = [];
  document.querySelectorAll('.toggle-pill.active').forEach((btn) => {
    modes.push((btn as HTMLElement).dataset.mode!);
  });
  if (modes.length === 0 || (modes.length === 1 && modes[0] === 'silent')) return ['silent'];
  return modes.filter((m) => m !== 'silent');
}

function handleTogglePill(clicked: HTMLElement): void {
  const mode = clicked.dataset.mode!;
  if (mode === 'silent') {
    document.querySelectorAll('.toggle-pill').forEach((b) => b.classList.remove('active'));
    clicked.classList.add('active');
  } else {
    document.querySelector('.toggle-pill[data-mode="silent"]')?.classList.remove('active');
    clicked.classList.toggle('active');
    const anyActive = document.querySelectorAll('.toggle-pill.active').length > 0;
    if (!anyActive) document.querySelector('.toggle-pill[data-mode="silent"]')?.classList.add('active');
  }
  patchSetting({ alertModes: collectAlertModes() });
}

async function patchSetting(patch: Partial<MapSenseSettings>): Promise<void> {
  currentSettings = await api.patchSettings(patch);
  syncSettingsToUI(currentSettings);
}

function updateTrainingState(state: TrainingState): void {
  const isRunning = state.running;
  $('btnStartTraining').style.display = isRunning ? 'none' : '';
  $('btnStopTraining').style.display = isRunning ? '' : 'none';
  $('timerDisplay').style.display = isRunning ? '' : 'none';
  $('btnManualGlance').style.display = isRunning && currentSettings.trainingMode === 'free' ? '' : 'none';

  if (isRunning) {
    $('timerValue').textContent = state.timeSinceLastGlanceS.toFixed(1);
    $('timerDisplay').classList.toggle('alert-active', state.alertActive);
    $('masValue').textContent = String(state.masScore);
    $('masBarFill').style.width = `${state.masScore}%`;
    updateMasDelta(state.masScore);

    const m = state.metrics;
    setMetric('metricRate', m.glancesPerMin, 'rate');
    setMetric('metricAvgGap', m.avgGapS, 'avgGap');
    setMetric('metricMapTime', m.timeOnMapPct, 'mapTime');
    setMetric('metricProcSpeed', m.avgGlanceDurationMs, 'procSpeed');
    $('metricDuration').textContent = String(m.durationS);
    $('metricGlances').textContent = String(m.glanceCount);
    setMetric('metricLongestGap', m.longestGapS, 'longestGap');
    setMetric('metricAlerts', m.alertsTriggered, 'alerts');
    setMetric('metricAlertFree', m.alertFreeStreakS, 'alertFree');
  }
}

/** Live comparison against the previous session's MAS. */
function updateMasDelta(masScore: number): void {
  const el = $('masDelta');
  const last = historyRecords.length > 0 ? historyRecords[historyRecords.length - 1].masScore : null;
  if (last === null || masScore === 0) {
    el.style.display = 'none';
    return;
  }
  const delta = masScore - last;
  el.style.display = '';
  el.className = 'mas-delta ' + (delta >= 0 ? 'mas-delta--up' : 'mas-delta--down');
  el.textContent = `${delta >= 0 ? '+' : ''}${delta} vs last session`;
}

function setMetric(elementId: string, value: number, metricKey: string): void {
  const el = $(elementId);
  el.textContent = String(value);

  const bench = KPI_BENCH[metricKey];
  if (bench) {
    const pct = Math.min(100, Math.max(0, (value / bench.scaleMax) * 100));
    $(bench.barId).style.width = `${pct}%`;
  }

  const range = METRIC_RANGES[metricKey];
  if (!range) return;
  el.className = 'metric-value';
  if (range.higherIsBetter === true) {
    if (value >= range.goodLo) el.classList.add('metric-value--good');
    else if (value >= range.warnLo) el.classList.add('metric-value--warn');
    else el.classList.add('metric-value--bad');
  } else if (range.higherIsBetter === false) {
    if (value <= range.goodHi) el.classList.add('metric-value--good');
    else if (value <= range.warnHi) el.classList.add('metric-value--warn');
    else el.classList.add('metric-value--bad');
  } else {
    if (value >= range.goodLo && value <= range.goodHi) el.classList.add('metric-value--good');
    else if (value >= range.warnLo && value <= range.warnHi) el.classList.add('metric-value--warn');
    else el.classList.add('metric-value--bad');
  }
}

function masColor(score: number): string {
  if (score >= 70) return 'history-item__mas--good';
  if (score >= 40) return 'history-item__mas--warn';
  return 'history-item__mas--bad';
}

function formatDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.round((totalS % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function renderSummary(): void {
  const has = historyRecords.length > 0;
  $('historySummary').style.display = has ? '' : 'none';
  if (!has) return;
  const last5 = historyRecords.slice(-5);
  $('sumSessions').textContent = String(historyRecords.length);
  $('sumBestMas').textContent = String(Math.max(...historyRecords.map((r) => r.masScore)));
  $('sumAvgMas').textContent = String(
    Math.round(last5.reduce((a, r) => a + r.masScore, 0) / last5.length),
  );
  $('sumTime').textContent = formatDuration(historyRecords.reduce((a, r) => a + r.durationS, 0));
}

function renderMetricPicker(): void {
  const picker = $('chartMetricPicker');
  picker.innerHTML = '';
  for (const m of CHART_METRICS) {
    const btn = document.createElement('button');
    btn.className = 'chart-pill' + (m.key === selectedChartMetric ? ' active' : '');
    btn.textContent = m.label;
    btn.dataset.key = m.key;
    btn.title = m.unit ? `${m.label} (${m.unit}) per session` : `${m.label} per session`;
    btn.addEventListener('click', () => {
      selectedChartMetric = m.key;
      renderMetricPicker();
      renderChart();
    });
    picker.appendChild(btn);
  }
}

function renderHistory(): void {
  $('historyEmpty').style.display = historyRecords.length === 0 ? '' : 'none';
  $('chartWrap').style.display = historyRecords.length > 1 ? '' : 'none';
  renderSummary();
  const listEl = $('historyList');
  listEl.innerHTML = historyRecords.slice().reverse().slice(0, 50).map((r) => {
    const date = new Date(r.timestamp).toLocaleString();
    const dur = `${Math.round(r.durationS / 60)}m`;
    return `<div class="history-item">
      <span class="history-item__mas ${masColor(r.masScore)}">${r.masScore}</span>
      <div class="history-item__body">
        <span class="history-item__date">${date}</span>
        <span class="history-item__stats">${dur} &middot; ${r.glanceCount} glances &middot; ${r.glancesPerMin}/min &middot; ${r.avgGapS}s avg gap</span>
        <span class="history-item__region">${r.regionName || 'Custom'}</span>
      </div>
    </div>`;
  }).join('');
  if (historyRecords.length > 1) {
    renderMetricPicker();
    renderChart();
  }
}

function renderChart(): void {
  const canvas = $('historyChart') as HTMLCanvasElement;
  if (chartInstance) chartInstance.destroy();
  const metric = CHART_METRICS.find((m) => m.key === selectedChartMetric) ?? CHART_METRICS[0];
  const sorted = [...historyRecords].sort((a, b) => a.timestamp - b.timestamp);
  const labels = sorted.map((r) => new Date(r.timestamp).toLocaleDateString());
  const data = sorted.map((r) => (r as unknown as Record<string, number>)[metric.key]);
  const useMarkers = sorted.length < 30;

  // @ts-expect-error Chart is a global from the bundled vendor/chart.umd.min.js
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: metric.label,
        data,
        borderColor: metric.color,
        backgroundColor: metric.color + '22',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: useMarkers ? 4 : 0,
        pointBackgroundColor: metric.color,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: { y: number } }) =>
              ` ${metric.label}: ${ctx.parsed.y}${metric.unit}`,
          },
        },
      },
      scales: {
        x: { ticks: { color: '#7F96B2', maxTicksLimit: 12 }, grid: { color: 'rgba(45,70,104,0.35)' } },
        y: {
          beginAtZero: true,
          ticks: { color: '#5C6B7A' },
          grid: { color: 'rgba(45,70,104,0.35)' },
          title: {
            display: !!metric.unit,
            text: metric.unit,
            color: '#5C6B7A',
            font: { size: 10 },
          },
        },
      },
    },
  });
}

function toFileUrl(p: string): string {
  return 'file:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
}

function playAlertSound(sound: AlertSound): void {
  const audio = $('alertAudioEl') as HTMLAudioElement;
  audio.src = sound.soundPath ? toFileUrl(sound.soundPath) : 'assets/alert.wav';
  audio.volume = Math.min(1, Math.max(0, sound.volume / 100));
  audio.loop = true;
  audio.play().catch((err) => console.error('[Alert] Audio play failed:', err));
}

function stopAlertSound(): void {
  const audio = $('alertAudioEl') as HTMLAudioElement;
  audio.pause();
  audio.currentTime = 0;
}

function showOnboarding(): void { $('onboardingModal').style.display = 'flex'; }
function hideOnboarding(): void {
  $('onboardingModal').style.display = 'none';
  api.track('onboarding_completed');
  patchSetting({ firstRun: false });
}

function bindEvents(): void {
  document.querySelectorAll('.nav-item[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo((btn as HTMLElement).dataset.page!));
  });
  $('btnMinimize').addEventListener('click', () => api.minimizeWindow());
  $('btnClose').addEventListener('click', () => api.closeWindow());
  $('btnFeedbackBoard').addEventListener('click', () => window.open(FEEDBACK_URL, '_blank'));
  $('btnDiscord').addEventListener('click', () => window.open(DISCORD_URL, '_blank'));
  $('btnAbout').addEventListener('click', () => window.open(WEBSITE_URL, '_blank'));
  $('btnSupportEmail').addEventListener('click', async () => {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    const desc = $('supportEmailDesc');
    desc.textContent = 'Copied!';
    setTimeout(() => { desc.textContent = SUPPORT_EMAIL; }, 1500);
  });
  $('btnSelectRegionGate').addEventListener('click', selectRegion);
  $('btnChangeRegion').addEventListener('click', selectRegion);
  $('btnStartTraining').addEventListener('click', () => {
    api.track('training_started', { trainingMode: currentSettings.trainingMode });
    api.startTraining();
  });
  $('btnStopTraining').addEventListener('click', () => {
    api.track('training_stopped', { trainingMode: currentSettings.trainingMode });
    api.stopTraining();
  });
  $('btnManualGlance').addEventListener('click', () => api.markManualGlance());
  $('btnClearHistory').addEventListener('click', async () => { await api.clearHistory(); historyRecords = []; renderHistory(); });
  $('btnShareReddit').addEventListener('click', shareReddit);

  $('settingTimeout').addEventListener('input', (e) => { $('settingTimeoutValue').textContent = `${(e.target as HTMLInputElement).value}s`; });
  $('settingTimeout').addEventListener('change', (e) => patchSetting({ timeoutSeconds: Number((e.target as HTMLInputElement).value) }));
  $('settingTolerance').addEventListener('input', (e) => { $('settingToleranceValue').textContent = `${(e.target as HTMLInputElement).value}px`; });
  $('settingTolerance').addEventListener('change', (e) => patchSetting({ tolerancePx: Number((e.target as HTMLInputElement).value) }));
  $('settingVolume').addEventListener('input', (e) => { $('settingVolumeValue').textContent = `${(e.target as HTMLInputElement).value}%`; });
  $('settingVolume').addEventListener('change', (e) => patchSetting({ volume: Number((e.target as HTMLInputElement).value) }));
  $('settingMode').addEventListener('change', (e) => {
    const select = e.target as HTMLSelectElement;
    if (select.value === 'paid' && !isEntitledToPro()) {
      // Pro coaching needs entitlement -- pitch the trial, stay on free.
      select.value = 'free';
      showProModal();
      return;
    }
    api.track('mode_switched', { trainingMode: select.value });
    patchSetting({ trainingMode: select.value });
  });

  document.querySelectorAll('.toggle-pill').forEach((btn) => {
    btn.addEventListener('click', () => handleTogglePill(btn as HTMLElement));
  });

  // A rejected invoke inside an async click handler is an unhandled rejection:
  // the click does nothing, and nothing anywhere says why. Catch it, log it
  // (main mirrors renderer errors into main.log), and say so on screen.
  $('btnPickSound').addEventListener('click', async () => {
    try {
      const p = await api.pickCustomSound();
      if (p) await patchSetting({ customSoundPath: p });
    } catch (err) {
      console.error('[Renderer] Custom sound picker failed:', err);
      $('customSoundLabel').textContent = 'Could not open the file picker';
    }
  });
  $('settingPreset').addEventListener('change', async (e) => {
    const key = (e.target as HTMLSelectElement).value;
    if (!key) return;
    if (key === 'custom') {
      await selectRegion();
      return;
    }
    // Presets carry known minimap rects; apply directly, no overlay needed.
    api.track('preset_applied', { gamePreset: key });
    currentSettings = await api.applyPreset(key);
    syncSettingsToUI(currentSettings);
  });
  $('btnSelectRegion').addEventListener('click', selectRegion);
  $('btnDeleteRegion').addEventListener('click', () => {
    const name = ($('settingSavedRegion') as HTMLSelectElement).value;
    if (name) patchSetting({ savedRegions: currentSettings.savedRegions.filter((r) => r.name !== name) });
  });
  $('settingIrlEnabled').addEventListener('change', (e) => patchSetting({ irlEnabled: (e.target as HTMLInputElement).checked }));
  $('settingIrlPort').addEventListener('change', (e) => patchSetting({ irlPort: Number((e.target as HTMLInputElement).value) }));
  $('settingIrlUrl').addEventListener('change', (e) => patchSetting({ irlWebhookUrl: (e.target as HTMLInputElement).value }));
  $('settingHotkey').addEventListener('keydown', (e: Event) => {
    const ke = e as KeyboardEvent; ke.preventDefault();
    const parts: string[] = [];
    if (ke.ctrlKey) parts.push('Ctrl');
    if (ke.shiftKey) parts.push('Shift');
    if (ke.altKey) parts.push('Alt');
    if (ke.key && !['Control', 'Shift', 'Alt', 'Meta'].includes(ke.key)) parts.push(ke.key.length === 1 ? ke.key.toUpperCase() : ke.key);
    if (parts.length > 0) { ($('settingHotkey') as HTMLInputElement).value = parts.join('+'); patchSetting({ hotkey: parts.join('+') }); }
  });
  $('btnCmpSettings').addEventListener('click', () => api.openCmpWindow());
  $('btnUpgradePro').addEventListener('click', () => { api.track('upgrade_clicked'); showProModal(); });
  $('settingAnalytics').addEventListener('change', (e) => {
    const optOut = !(e.target as HTMLInputElement).checked;
    api.setAnalyticsOptOut(optOut);
    patchSetting({ analyticsOptOut: optOut });
  });
  $('settingLaunchAtStartup').addEventListener('change', (e) => {
    patchSetting({ launchAtStartup: (e.target as HTMLInputElement).checked });
  });
  $('btnStartTrial').addEventListener('click', startProTrial);
  $('btnCloseProModal').addEventListener('click', hideProModal);
  $('btnInstallUpdate').addEventListener('click', () => api.installUpdate());
  $('btnDismissUpdate').addEventListener('click', () => {
    updateBannerDismissed = true;
    $('updateBanner').style.display = 'none';
  });
  $('btnCheckUpdates').addEventListener('click', () => {
    updateCheckRequested = true;
    $('updateStatusLabel').textContent = 'Checking...';
    api.checkForUpdates();
  });
  const btnAskAI = document.getElementById('btnAskAI');
  if (btnAskAI) btnAskAI.addEventListener('click', () => window.open('https://chatgpt.com/?q=' + encodeURIComponent(IRL_AI_PROMPT), '_blank'));

  document.querySelectorAll('[data-onboarding-next]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = (btn as HTMLElement).dataset.onboardingNext!;
      document.querySelectorAll('.onboarding-step').forEach((s) => ((s as HTMLElement).style.display = 'none'));
      $(`onboardingStep${next}`).style.display = '';
      document.querySelectorAll('#obDots .ob-dot').forEach((d, i) => {
        d.classList.toggle('ob-dot--on', i === Number(next) - 1);
      });
    });
  });
  $('btnFinishOnboarding').addEventListener('click', hideOnboarding);
}

async function selectRegion(): Promise<void> {
  const rect = await api.openRegionOverlay();
  if (rect) {
    const name = currentSettings.regionName || 'Region 1';
    const existing = currentSettings.savedRegions.filter((r) => r.name !== name);
    existing.push({ name, rect });
    // Region rect itself is private; only signal that a region was set.
    api.track('region_selected');
    await patchSetting({ minimapRect: rect, regionName: name, savedRegions: existing });
  }
}

function shareReddit(): void {
  if (historyRecords.length === 0) return;
  const last = historyRecords[historyRecords.length - 1];
  const title = `[MapSense] My Map Awareness Score: ${last.masScore} | ${Math.round(last.durationS / 60)}min session`;
  const text = `MAS: ${last.masScore}\nGlances/min: ${last.glancesPerMin}\nAvg response: ${last.avgGapS}s\nLongest blind: ${last.longestGapS}s\n\nTrained with MapSense - the minimap awareness coach.`;
  window.open(`${REDDIT_SHARE_BASE}?type=TEXT&title=${encodeURIComponent(title)}&text=${encodeURIComponent(text)}`, '_blank');
}

async function init(): Promise<void> {
  const data: BootstrapPayload = await api.getBootstrap();
  currentSettings = data.settings;
  currentEntitlement = data.entitlement;
  historyRecords = data.history;
  syncSettingsToUI(currentSettings);
  updateBeamStatus(data.beamStatus);
  updateAdBanner();
  renderHistory();
  bindEvents();
  $('appVersionLabel').textContent = data.appVersion;
  renderUpdaterState(data.updater);
  // Surface the Overwolf consent prompt on first run where the region requires
  // it, before ads or analytics matter.
  if (currentSettings.firstRun && (await api.checkCmpRequired())) {
    api.openCmpWindow();
  }
  if (currentSettings.firstRun) showOnboarding();
  api.onState(updateTrainingState);
  api.onBeamStatus(updateBeamStatus);
  api.onSessionComplete((record: SessionRecord) => { historyRecords.push(record); renderHistory(); });
  api.onUpdaterState(renderUpdaterState);
  api.onPlayAlert(playAlertSound);
  api.onStopAlert(stopAlertSound);
}

init();
