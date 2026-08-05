/* Tray quick panel renderer - NOT a module (loaded via <script> tag) */

interface TrayPanelState {
  training: boolean;
  beamStatus: string;
  updater: { status: string; availableVersion: string | null };
  packaged: boolean;
}

interface TrayPanelApi {
  onState(cb: (state: TrayPanelState) => void): void;
  action(name: string): void;
  reportHeight(height: number): void;
}

const panelApi = (window as unknown as { trayPanelApi: TrayPanelApi }).trayPanelApi;

function el(id: string) { return document.getElementById(id)!; }

const BEAM_TEXT: Record<string, string> = {
  tracking: 'Tracking your gaze',
  connecting: 'Connecting...',
  not_running: 'Not running',
  not_installed: 'Not installed',
};

let latest: TrayPanelState | null = null;

function render(state: TrayPanelState): void {
  latest = state;

  (el('trainingToggle') as HTMLInputElement).checked = state.training;
  el('trainingText').textContent = state.training ? 'Running' : 'Not running';

  const beamDot = el('beamDot');
  beamDot.className = `status-dot beam-${state.beamStatus}`;
  el('beamText').textContent = BEAM_TEXT[state.beamStatus] ?? 'Unknown';

  // A dev run has no updater at all, so the row is a HIDDEN row rather than a
  // control that silently does nothing.
  const updateRow = el('updateRow');
  updateRow.hidden = !state.packaged;

  const { status, availableVersion } = state.updater;
  const updateDot = el('updateDot');
  const ready = status === 'ready';
  const busy = status === 'checking' || status === 'downloading';
  updateDot.className = `status-dot ${ready ? 'upd-ready' : busy ? 'upd-busy' : status === 'error' ? 'upd-error' : 'upd-idle'}`;
  el('updateText').textContent =
    ready ? `v${availableVersion ?? '?'} ready. Click to restart.` :
    status === 'downloading' ? 'Downloading...' :
    status === 'checking' ? 'Checking...' :
    status === 'error' ? 'Check failed. Retries on its own.' :
    'Up to date';
  (updateRow as HTMLButtonElement).disabled = !ready;
}

function wire(): void {
  el('trainingToggle').addEventListener('change', () => {
    panelApi.action('toggleTraining');
  });
  el('updateRow').addEventListener('click', () => {
    if (latest?.updater.status === 'ready') panelApi.action('installUpdate');
  });
  el('feedbackRow').addEventListener('click', () => panelApi.action('feedback'));
  el('discordRow').addEventListener('click', () => panelApi.action('discord'));
  el('openBtn').addEventListener('click', () => panelApi.action('open'));
  el('logBtn').addEventListener('click', () => panelApi.action('log'));
  el('quitBtn').addEventListener('click', () => panelApi.action('quit'));

  // Escape closes, same as clicking away.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') panelApi.action('close');
  });

  // Chromium replays the last hover state on re-show, so a row can open already
  // shaded. Hover only paints once the mouse has really moved in this showing.
  document.addEventListener('mousemove', () => {
    document.body.classList.remove('no-hover');
  }, { once: true });
}

/**
 * The window sizes itself to the card. A hardcoded height only ever fits the
 * machine it was measured on: font fallbacks and DPI change it.
 */
function reportHeight(): void {
  const scroll = document.querySelector('.scroll');
  const footer = document.querySelector('.footer');
  if (!scroll || !footer) return;
  // Measure the NATURAL height, not the card's box. The card is capped at
  // max-height:100% so it can never report more than the window it is already
  // in, which would pin the panel at its start size forever and quietly clip
  // the last row.
  const natural =
    scroll.scrollHeight +
    footer.getBoundingClientRect().height +
    2 + // panel border, top and bottom
    16; // body padding, top and bottom
  panelApi.reportHeight(Math.ceil(natural));
}

panelApi.onState((state) => {
  document.body.classList.add('no-hover');
  render(state);
  requestAnimationFrame(reportHeight);
});

wire();
