import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

let document: Document;

beforeAll(() => {
  const htmlPath = path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const dom = new JSDOM(html);
  document = dom.window.document;
});

describe('Renderer Layout', () => {
  it('has a title bar', () => {
    expect(document.getElementById('titleBar')).not.toBeNull();
  });

  it('has minimize and close buttons', () => {
    expect(document.getElementById('btnMinimize')).not.toBeNull();
    expect(document.getElementById('btnClose')).not.toBeNull();
  });

  it('has beam status indicators', () => {
    expect(document.getElementById('beamStatusDot')).not.toBeNull();
    expect(document.getElementById('beamStatusLabel')).not.toBeNull();
  });

  it('has sidebar with four navigation buttons in Coach, Settings, History, System order', () => {
    const navs = document.querySelectorAll('.nav-item[data-page]');
    expect(navs.length).toBe(4);
    const pages = Array.from(navs).map((l) => (l as HTMLElement).dataset.page);
    expect(pages).toEqual(['coach', 'settings', 'history', 'system']);
  });

  it('has MapSense avatar in sidebar', () => {
    const img = document.querySelector('.nav-avatar') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.alt).toBe('MapSense');
    // The sidebar mark is the app icon itself: the bell on transparency, so it
    // sits directly on the sidebar with no plate behind it.
    expect(img.getAttribute('src')).toBe('assets/bell.png');
  });

  it('has four page sections', () => {
    expect(document.getElementById('pageCoach')).not.toBeNull();
    expect(document.getElementById('pageHistory')).not.toBeNull();
    expect(document.getElementById('pageSettings')).not.toBeNull();
    expect(document.getElementById('pageSystem')).not.toBeNull();
  });

  it('coach page has region gate and coach content', () => {
    expect(document.getElementById('regionGate')).not.toBeNull();
    expect(document.getElementById('coachContent')).not.toBeNull();
  });

  it('coach page has MAS display', () => {
    expect(document.getElementById('masValue')).not.toBeNull();
    expect(document.getElementById('masBarFill')).not.toBeNull();
  });

  it('coach page has training buttons', () => {
    expect(document.getElementById('btnStartTraining')).not.toBeNull();
    expect(document.getElementById('btnStopTraining')).not.toBeNull();
    expect(document.getElementById('btnManualGlance')).not.toBeNull();
  });

  it('has 9 metric cells', () => {
    const cells = document.querySelectorAll('.mc');
    expect(cells.length).toBe(9);
  });

  it('coach page has a hero header with artwork', () => {
    const hero = document.getElementById('coachHero');
    expect(hero).not.toBeNull();
    const img = hero!.querySelector('img.coach-hero__img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(hero!.querySelector('.coach-hero__title')).not.toBeNull();
    // The hero uses the derived artwork whose left edge is already feathered
    // (scripts/make-hero-art.js), never the raw source jpg: a CSS mask over the
    // source would erase the bell, which sits at the artwork's left edge.
    expect(img.getAttribute('src')).toBe('assets/mapsense-hero.png');
  });

  it('puts the ad banner directly under the hero, above the session content', () => {
    const children = Array.from(document.getElementById('pageCoach')!.children).map((e) => e.id);
    expect(children.indexOf('adBanner')).toBe(children.indexOf('coachHero') + 1);
    expect(children.indexOf('adBanner')).toBeLessThan(children.indexOf('coachContent'));
  });

  it('splits metrics into 4 primary KPI cards and 5 secondary chips', () => {
    expect(document.querySelectorAll('#metricsGrid .mc--kpi').length).toBe(4);
    expect(document.querySelectorAll('#metricsChips .mc--chip').length).toBe(5);
  });

  it('primary KPI cards each show a benchmark bar with a target band', () => {
    const benches = document.querySelectorAll('#metricsGrid .kpi-bench');
    expect(benches.length).toBe(4);
    benches.forEach((b) => {
      expect(b.querySelector('.kpi-bench__target')).not.toBeNull();
      expect(b.querySelector('.kpi-bench__fill')).not.toBeNull();
      expect(b.querySelector('.kpi-bench__label')?.textContent?.length).toBeGreaterThan(0);
    });
  });

  it('MAS card has a session-over-session delta chip', () => {
    expect(document.getElementById('masDelta')).not.toBeNull();
  });

  it('history page has a 4-stat summary strip', () => {
    const summary = document.getElementById('historySummary');
    expect(summary).not.toBeNull();
    expect(summary!.querySelectorAll('.sum-stat').length).toBe(4);
    expect(document.getElementById('sumSessions')).not.toBeNull();
    expect(document.getElementById('sumBestMas')).not.toBeNull();
    expect(document.getElementById('sumAvgMas')).not.toBeNull();
    expect(document.getElementById('sumTime')).not.toBeNull();
  });

  it('history chart has a metric picker container', () => {
    expect(document.getElementById('chartMetricPicker')).not.toBeNull();
  });

  it('all metric cells have tooltips', () => {
    const cells = document.querySelectorAll('.mc');
    cells.forEach((cell) => {
      expect((cell as HTMLElement).title.length).toBeGreaterThan(0);
    });
  });

  it('history page has chart canvas and list', () => {
    expect(document.getElementById('historyChart')).not.toBeNull();
    expect(document.getElementById('historyList')).not.toBeNull();
    expect(document.getElementById('btnClearHistory')).not.toBeNull();
    expect(document.getElementById('btnShareReddit')).not.toBeNull();
  });

  it('settings page has card-based layout', () => {
    // Startup + Updates moved to the System page (2 cards there).
    const cards = document.querySelectorAll('#pageSettings .s-card');
    expect(cards.length).toBe(7);
    expect(document.querySelectorAll('#pageSystem .s-card').length).toBe(2);
  });

  it('settings page has all controls', () => {
    expect(document.getElementById('settingMode')).not.toBeNull();
    expect(document.getElementById('settingTimeout')).not.toBeNull();
    expect(document.getElementById('settingTolerance')).not.toBeNull();
    expect(document.getElementById('settingVolume')).not.toBeNull();
    expect(document.getElementById('btnPickSound')).not.toBeNull();
    expect(document.getElementById('settingPreset')).not.toBeNull();
    expect(document.getElementById('btnSelectRegion')).not.toBeNull();
    expect(document.getElementById('settingIrlEnabled')).not.toBeNull();
    expect(document.getElementById('settingIrlPort')).not.toBeNull();
    expect(document.getElementById('settingIrlUrl')).not.toBeNull();
    expect(document.getElementById('settingHotkey')).not.toBeNull();
    expect(document.getElementById('btnCmpSettings')).not.toBeNull();
  });

  it('has toggle pill buttons for alert modes', () => {
    const pills = document.querySelectorAll('.toggle-pill');
    expect(pills.length).toBe(4);
    const modes = Array.from(pills).map((p) => (p as HTMLElement).dataset.mode);
    expect(modes).toContain('silent');
    expect(modes).toContain('audio');
    expect(modes).toContain('visual');
    expect(modes).toContain('irl');
  });

  it('toggle pills have tooltips', () => {
    document.querySelectorAll('.toggle-pill').forEach((pill) => {
      expect((pill as HTMLElement).title.length).toBeGreaterThan(0);
    });
  });

  it('has onboarding modal with 5 steps and progress dots', () => {
    expect(document.getElementById('onboardingModal')).not.toBeNull();
    for (let i = 1; i <= 5; i++) {
      expect(document.getElementById(`onboardingStep${i}`), `step ${i}`).not.toBeNull();
    }
    expect(document.querySelectorAll('#obDots .ob-dot').length).toBe(5);
  });

  it('onboarding steps use correct class for JS toggling', () => {
    const steps = document.querySelectorAll('.onboarding-step');
    expect(steps.length).toBe(5);
  });

  it('onboarding explains all four alert modes', () => {
    const modes = document.querySelectorAll('#onboardingStep3 .ob-mode');
    expect(modes.length).toBe(4);
    const text = document.getElementById('onboardingStep3')!.textContent!;
    for (const mode of ['Audio', 'Visual', 'IRL', 'Silent']) {
      expect(text).toContain(mode);
    }
  });

  it('onboarding pro step names Beam Eye Tracker in full', () => {
    expect(document.getElementById('onboardingStep4')!.textContent).toContain('Beam Eye Tracker');
  });

  it('has audio element for alerts', () => {
    expect(document.getElementById('alertAudioEl')).not.toBeNull();
  });

  it('system page has the feedback rows (board, Discord, email, About)', () => {
    for (const id of ['btnFeedbackBoard', 'btnDiscord', 'btnSupportEmail', 'btnAbout']) {
      expect(document.querySelector(`#pageSystem #${id}`), id).not.toBeNull();
    }
    expect(document.getElementById('supportEmailDesc')!.textContent).toBe(
      'support@getmapsense.com',
    );
  });

  it('has ad banner with upgrade button', () => {
    expect(document.getElementById('adBanner')).not.toBeNull();
    expect(document.getElementById('btnUpgradePro')).not.toBeNull();
  });

  it('settings cards have hint descriptions', () => {
    const hints = document.querySelectorAll('#pageSettings .s-card__hint');
    expect(hints.length).toBeGreaterThanOrEqual(7);
  });

  it('has update banner with install and dismiss buttons', () => {
    expect(document.getElementById('updateBanner')).not.toBeNull();
    expect(document.getElementById('updateBannerText')).not.toBeNull();
    expect(document.getElementById('btnInstallUpdate')).not.toBeNull();
    expect(document.getElementById('btnDismissUpdate')).not.toBeNull();
  });

  it('system page has the update row, version, and autostart toggle', () => {
    for (const id of [
      'btnCheckUpdates',
      'updateStatusLabel',
      'appVersionLabel',
      'settingLaunchAtStartup',
    ]) {
      expect(document.querySelector(`#pageSystem #${id}`), id).not.toBeNull();
    }
  });

  it('has pro upgrade modal', () => {
    expect(document.getElementById('proModal')).not.toBeNull();
    expect(document.getElementById('btnStartTrial')).not.toBeNull();
    expect(document.getElementById('btnCloseProModal')).not.toBeNull();
  });

  it('has plan label in privacy card', () => {
    expect(document.getElementById('planLabel')).not.toBeNull();
  });

  it('has a Start with Windows toggle, on by default (tray-resident app)', () => {
    const toggle = document.getElementById('settingLaunchAtStartup') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.type).toBe('checkbox');
    expect(toggle.checked).toBe(true);
  });

  it('has an anonymous-usage-data opt-out toggle', () => {
    const toggle = document.getElementById('settingAnalytics') as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.type).toBe('checkbox');
    // Opt-out model: checked (sending) by default.
    expect(toggle.checked).toBe(true);
  });

  it('ad banner contains the Overwolf owadview element in an IAB-sized slot', () => {
    // Overwolf only serves ads into standard IAB-sized containers; owadview
    // must sit inside the fixed-size .ad-slot wrapper.
    const owadview = document.querySelector('#adBanner .ad-slot owadview');
    expect(owadview).not.toBeNull();
  });

  it('loads no remote scripts, styles, or fonts (offline-safe)', () => {
    const external = document.querySelectorAll(
      'script[src^="http"], link[href^="http"]',
    );
    expect(external.length).toBe(0);
  });

  it('bundles Chart.js from local vendor directory', () => {
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(
      (s) => s.getAttribute('src'),
    );
    expect(scripts).toContain('vendor/chart.umd.min.js');
  });

  it('CSP forbids remote script sources and eval', () => {
    const csp =
      document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute('content') ?? '';
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('https://cdn');
  });
});
