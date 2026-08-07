# MapSense - Project Instructions

> **ABSOLUTE RULE (all SwissTropic projects): NO EM DASHES. EVER.** Not in UI copy, docs, comments, commit messages, release notes, or anywhere else. Use a comma, period, parentheses, or plain hyphen instead. CI enforces this (`tests/e2e/smoke.test.ts`); never weaken that test.

> **Migration status (updated 2026-07-24):** The active implementation is the ow-electron app in [`apps/mapsense`](apps/mapsense). The earlier incomplete Electron attempt was deleted (recoverable from git history). The Python/PySide app in [`src`](src) remains a legacy reference during cutover.

## Current Project State (Read First)

- **Active stack:** Electron + ow-electron + TypeScript
- **Legacy stack:** Python + PySide6
- **Primary product name:** MapSense
- **Free mode requirement:** timer-based cues must stay fully functional without Beam
- **Paid mode requirement:** Beam gaze-driven coaching is gated by subscription entitlement
- **Monetization direction:** Overwolf-first (`owadview`, CMP flow, Overwolf distribution path)

### UX and Terminology Guardrails

- App name in user-facing UI is **MapSense**, everywhere. The former name (the scientist's) was retired 2026-07-24 and must not reappear in any surface, code identifier, or doc.
- Brand lockup, used verbatim on every surface that pairs name + tagline (title bar, tray tooltip, hero, store copy, description): **MapSense - Minimap awareness coach**.
- Audience is 14-25 competitive gamers. No corporate openers ("Welcome to...", "Meet..."); Sam's whisper rule applies (see sam-copywriting skill).
- Say **Beam Eye Tracker** in UI text for clarity.
- Keep wording close to legacy intent; avoid novelty renaming of familiar controls.
- Keep first-run onboarding and region-first guidance flow.
- Region selection should be click-drag overlay based, not manual XYWH fields.
- Keep the full session metrics surface (MAS + 9 metrics) in PRO mode, not a reduced subset. Free mode shows only what it can actually measure (duration, reminders fired) plus one line saying why the rest is absent: with no eye tracker there are no observable glances, so every gaze-derived number would be invented (owner ruling 2026-08-05).
- Label CMP in UI as ads/privacy consent so non-technical users understand it.

### Active Documentation

- Agent operating guide: [`AGENTS.md`](AGENTS.md)
- Electron migration notes: [`docs/electron-migration.md`](docs/electron-migration.md)
- Overwolf monetization notes: [`docs/monetization-overwolf.md`](docs/monetization-overwolf.md)
- Testing strategy: [`docs/testing-strategy.md`](docs/testing-strategy.md)

## What Is MapSense

MapSense is a free Steam app by **Eyeware Tech SA** that uses eye tracking to train gamers' minimap awareness. It monitors whether the player is checking the minimap frequently enough during gameplay and triggers audio/visual/physical alerts when they aren't. Think of it as classical conditioning for map awareness.

**Based on:** [MOBA-Minimap-Awareness-Trainer](https://github.com/kenneth-ew/MOBA-Minimap-Awareness-Trainer) (MIT-licensed prototype by Kenneth/Eyeware). Credit this in the About screen and README.

## Strategic Context

MapSense is a **showcase app that drives Beam Eye Tracker adoption**:

```
User finds MapSense (free) on Steam
  -> Needs Beam Eye Tracker (free on Steam, provides tracking)
    -> User installs Beam, discovers eye tracking ecosystem
      -> Eyeware ecosystem grows
```

MapSense does NOT do eye tracking itself. It consumes gaze data from the Beam Eye Tracker SDK (`beam-eye-tracker` Python package). Beam must be running for MapSense to function.

## Publisher & Branding

- **Publisher:** Eyeware Tech SA (same as Beam Eye Tracker on Steam)
- **Product name:** MapSense
- **Price:** Free
- **Steam category:** Software (not Game)
- **Platform:** Windows x64 only
- **Website:** https://getmapsense.com (Cloudflare Pages)
- **Feedback board:** https://mapsense.featurebase.app (System page "Feedback" row)
- **Support email:** support@getmapsense.com (Cloudflare Email Routing)
- **Discord:** https://discord.gg/khk2dq8Bj3 (Beam Eye Tracker community; per the
  Tray App Standard every product eventually gets its OWN server, owner has to
  create it, then swap DISCORD_URL in `src/renderer/app.ts`)

## Supported Games

Primary targets (configure minimap location per game):
- League of Legends
- Dota 2
- Starcraft 2
- Valorant (radar)
- Counter-Strike 2 (radar)
- Overwatch
- Smite
- Any game with a minimap/radar element

## Core Functionality

### How It Works

1. User defines the minimap region on their screen (click-and-drag rectangle)
2. MapSense reads gaze data from Beam Eye Tracker SDK
3. A timer starts counting from the last time the user looked at the minimap region
4. If the timer exceeds a configurable threshold, trigger alert
5. When the user looks at the minimap, timer resets, alert stops
6. Repeat

### Map Awareness Score (MAS)

MapSense computes a composite **Map Awareness Score (0-100)** inspired by Mobalytics/Tobii esports eye tracking research. The MAS is a weighted blend:

| Component | Weight | What it measures | Benchmark |
|-----------|--------|-----------------|-----------|
| Check rate | 40% | Glances per minute | Pro: 6-8/min |
| Response time | 25% | Avg gap between glances | Lower is better |
| Processing speed | 20% | Avg glance duration | Shorter = pro-like |
| Consistency | 15% | Std dev of gap times | Lower = steadier |

### Feature Set (MVP)

- **Minimap region setup:** Click-and-drag overlay to define where the minimap is on screen
- **Configurable timeout:** How many seconds before the alert fires (default: 5s)
- **Audio alert:** Beep/alarm sound with adjustable volume
- **Visual alert:** Flashing overlay on/near the minimap region
- **IRL webhook:** Localhost HTTP server that POSTs alert events to physical devices (Raspberry Pi, Arduino, motors, LEDs)
- **Alert mode toggle:** Audio / Visual / IRL / Silent (any combination, or silent for stats-only)
- **Custom alert sound:** Upload MP3/WAV/OGG to replace the default alert
- **Beam connection status:** Show whether Beam Eye Tracker is running and connected
- **Auto-start Beam prompt:** If Beam isn't running, offer to launch it
- **Minimize to system tray:** Runs in background during gameplay
- **Start/Stop training button:** Toggle tracking on/off without closing the app
- **Map Awareness Score:** Composite 0-100 score displayed prominently
- **Session statistics:** 9 metrics (check rate, response time, processing speed, longest blind spot, tunnel vision episodes, best focus streak, map attention, glance count, duration)
- **Session history:** Persisted to disk, viewable as interactive charts with matplotlib
- **History chart:** Line chart with clickable legend to toggle metrics on/off
- **Share to Reddit:** One-click sharing of session stats + MAS to Reddit
- **Discord button:** Link to Beam Eye Tracker Discord community
- **Onboarding:** First-run 5-step guide (hook, mark minimap, alert modes, Beam Eye Tracker pro, MAS explainer) with progress dots
- **Detection margin visualization:** Shows the tolerance area on the overlay

### Feature Set (Post-MVP / Nice-to-Have)

- **Heatmap overlay:** Where on screen the player looks most (post-game review)
- **Overlay gaze bubble:** Show real-time gaze point on screen (like the Bjergsen eye-tracker VODs)
- **Streamer mode:** OBS-friendly gaze overlay for content creators
- **Per-game profiles:** Save different minimap regions and settings per game
- **Difficulty progression:** Start with generous timeout, gradually reduce as habit builds

## Tech Stack

### Decision: Python + PySide6 (Legacy Context)

Stick with Python/PySide6 (same as the prototype). Rationale:
- Beam Eye Tracker SDK is Python-native (`beam-eye-tracker` pip package)
- Faster to ship than rewriting in Electron/Tauri
- PySide6 is sufficient for the UI complexity needed
- PyInstaller for packaging to .exe

### Current Direction: ow-electron + TypeScript

The active implementation has moved to Electron/ow-electron to align with Overwolf distribution and freemium strategy.

- Main app code now lives in `apps/mapsense`
- Beam integration uses a native `koffi` bridge to `beam_eye_tracker_client.dll`
- Renderer uses secure preload IPC (`contextIsolation: true`, no renderer Node globals)
- Packaging target is `ow-electron-builder`

### Dependencies

```
beam-eye-tracker       # Eyeware Beam SDK, gaze data
PySide6                # Qt6 UI framework
matplotlib             # Session history charts
PyInstaller            # .exe packaging
pytest                 # Testing
```

### Beam Eye Tracker SDK Integration

> **Beam SDK reference:** official docs at https://docs.beam.eyeware.tech/
> (the old `../CLAUDE-BEAMSDK.md` workspace doc no longer exists). The active
> Electron app talks to the SDK through the `koffi` bridge in
> `apps/mapsense/src/main/services/beamBridge.ts`; the Python below is the
> legacy integration.

```python
from eyeware import beam_eye_tracker
import ctypes

# DPI awareness MUST be set before any UI calls
ctypes.windll.shcore.SetProcessDpiAwareness(2)

screen_width = ctypes.windll.user32.GetSystemMetrics(0)
screen_height = ctypes.windll.user32.GetSystemMetrics(1)

viewport_geometry = beam_eye_tracker.ViewportGeometry()
viewport_geometry.point_00 = beam_eye_tracker.Point(0, 0)
viewport_geometry.point_11 = beam_eye_tracker.Point(screen_width, screen_height)
api = beam_eye_tracker.API("MapSense", viewport_geometry)
```

Reading gaze data each frame:
```python
tracking_state = api.get_latest_tracking_state_set()
user_state = tracking_state.user_state()

if user_state.timestamp_in_seconds == beam_eye_tracker.NULL_DATA_TIMESTAMP():
    return  # No valid data, skip this frame

screen_gaze = user_state.unified_screen_gaze
gaze_x = screen_gaze.point_of_regard.x
gaze_y = screen_gaze.point_of_regard.y
confidence = screen_gaze.confidence  # 0=LOST, 1=LOW, 2=MEDIUM, 3=HIGH

if confidence >= 2:  # MEDIUM or HIGH
    check_if_gaze_is_in_minimap_region(gaze_x, gaze_y)
```

## Project Structure

```
mapsense/
├── images/                          # Marketing art (hero, header, store)
├── src/
│   ├── main.py                    # Entry point
│   ├── app.py                     # Application class, lifecycle
│   ├── tracker.py                 # Beam SDK integration, gaze reading loop
│   ├── minimap_detector.py        # Minimap region definition, gaze-in-region check
│   ├── alert_manager.py           # Audio + visual alert triggering + custom sound
│   ├── settings.py                # User preferences persistence
│   ├── session_history.py         # Session storage + MAS score calculation
│   ├── irl_webhook.py             # Localhost HTTP webhook for physical devices
│   ├── game_presets.py            # Pre-configured minimap positions per game
│   ├── utils.py                   # Audio generation, font loading, path helpers
│   ├── ui/
│   │   ├── main_window.py         # Main application window (frameless, custom title bar)
│   │   ├── setup_overlay.py       # Transparent overlay for minimap region selection
│   │   ├── alert_overlay.py       # Flashing overlay for visual alerts
│   │   ├── beam_status_widget.py  # Beam Eye Tracker connection indicator
│   │   ├── history_chart.py       # Matplotlib session history chart dialog
│   │   ├── onboarding.py          # First-run welcome dialog
│   │   ├── tray_icon.py           # System tray icon and menu
│   │   └── styles.py              # QSS theme, brand colours, gradient background
│   └── assets/
│       ├── alert.wav              # Default alert sound (generated on first run)
│       ├── Lato-Regular.ttf       # Bundled font
│       └── Lato-Bold.ttf          # Bundled font
├── tests/
│   ├── test_alert_manager.py
│   ├── test_game_presets.py
│   ├── test_minimap_detector.py
│   ├── test_settings.py
│   ├── test_tracker.py
│   └── test_ui_visibility.py
├── requirements.txt
├── CLAUDE.md
├── LICENSE
└── README.md
```

## Key Technical Learnings

These are hard-won lessons from development. Follow them.

### 1. DPI Coordinate Mismatch (Critical)

The Beam SDK returns **physical pixel** coordinates. PySide6 UI elements use **logical pixels**. On a 2x DPI display, these differ by a factor of 2.

**Fix:** Divide gaze coordinates by `screen.devicePixelRatio()` before checking region containment:
```python
self._dpr = self.screen().devicePixelRatio()
gaze_x = gaze.x / self._dpr
gaze_y = gaze.y / self._dpr
```

Without this, the gaze never hits the minimap region on scaled displays.

### 2. Qt Layout Auto-Resize Trap

When toggling widget visibility inside a `QVBoxLayout`, Qt automatically recalculates and resizes the parent window, causing the entire UI to shift.

**Fix:** Lock the window height with `setFixedHeight(current)` BEFORE toggling visibility, then set the new target height, then unlock:
```python
h = self.height()
self.setFixedHeight(h)  # Lock
self._panel.setVisible(True)
delta = self._panel.sizeHint().height()
self.setFixedHeight(h + delta)  # New size
self.setMinimumHeight(0)  # Unlock
self.setMaximumHeight(16777215)
```

Never use `adjustSize()` or `addStretch()` for dynamic panels. They cause unpredictable reflow.

### 3. Audio Alert Reliability

`QSoundEffect` has startup clicks and loop issues. Use `QMediaPlayer` with `QAudioOutput` instead.

**Key details:**
- Add 200ms silence at the start of the WAV to avoid QMediaPlayer startup click
- Use a retrigger cooldown (0.5s) to prevent stop/start jitter when gaze wobbles at region edge
- The WAV file is generated once and cached; delete `src/assets/alert.wav` to regenerate

### 4. SVG Favicon Rendering

`QIcon(svg_path)` works for window/tray icons, but for custom-sized display in the title bar, use `QSvgRenderer` to render to a `QPixmap` at the exact size needed.

### 5. Font Bundling

Don't `pip install` fonts. Bundle TTF files in `src/assets/` and load via `QFontDatabase.addApplicationFont()` at startup.

### 6. PowerShell Gotcha

PowerShell does not support bash heredoc (`<<'EOF'`). Use PowerShell here-strings (`@" ... "@`) for multi-line git commit messages.

### 7. QComboBox Dropdown Transparency on Frameless Windows

On frameless windows (`FramelessWindowHint`), the `QComboBox` popup inherits the window's rendering and can appear transparent. Stylesheets on `QComboBox QAbstractItemView` alone do not fix it.

**Fix:** Subclass `QComboBox` and override `showPopup()` to force the popup window opaque:
```python
class _OpaqueComboBox(QComboBox):
    def showPopup(self):
        super().showPopup()
        popup = self.view().window()
        popup.setAutoFillBackground(True)
        popup.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        popup.setStyleSheet("background-color: #1E2028; ...")
```

### 8. Global Hotkey on Windows (nativeEvent, not polling)

`RegisterHotKey(None, ...)` registers globally but Qt's event loop swallows the `WM_HOTKEY` message before a polling timer can catch it.

**Fix:** Register with the window handle (`int(self.winId())`) and override `nativeEvent` to intercept `WM_HOTKEY` (0x0312) directly. Always `UnregisterHotKey` on quit.

### 9. Tray/Taskbar Icon with Status Overlay

To overlay a colored status dot on the tray icon, copy the base `QPixmap` first (`src.copy()`) before painting. SVG-sourced pixmaps may be read-only. Use `QPainter` to draw a filled ellipse with a dark outline for contrast.

### 10. Progressive Disclosure in Debug Mode

When simulating first-time UX in debug mode, set a `_force_first_time` flag BEFORE `_build_ui()` and `_load_settings_into_ui()` are called. These methods invoke `_update_region_ui()` during init, which reads the flag. Clear it when the user completes the action (selects a region).

### 11. Blood-Panel Metric Coloring

Metrics use muted colors (not harsh traffic lights) to indicate ranges: soft green for good, soft yellow for needs-improvement, soft coral for bad. Define ranges per metric with a `higher_is_better` flag. Band metrics like "map attention" need both a too-low and too-high threshold. Apply colors in the stats refresh loop by updating `setStyleSheet` on value labels.

### 12. Conditioning Metaphor (Get It Right)

The app icon is a scientist ringing a bell (classical conditioning). The metaphor:
- **The scientist** = **MapSense** (the app doing the conditioning)
- **The dog** = **the gamer** (being trained)
- **The bell** = **the alert** (audio ding, visual flash)
- **The food** = **the minimap** (what the dog learns to check)

Never call MapSense a dog. MapSense doesn't bark (dogs bark). MapSense rings bells.

## IRL Webhook API

The IRL webhook enables physical alert devices. When enabled, MapSense:

1. Starts a local HTTP server on `localhost:9876` (configurable port)
2. Serves `GET /status` returning `{"active": true/false, "last_event": "..."}`
3. POSTs `{"event": "alert_start", "source": "MapSense"}` and `{"event": "alert_stop", ...}` to a user-configured webhook URL

Makers can build listeners on Raspberry Pi, Arduino, ESP32, etc. that trigger servos, LEDs, buzzers, or flags when the player forgets the minimap.

## Brand Colours

> Source of truth: `apps/mapsense/src/renderer/styles.css` `:root` (Brand
> Tokens Rule, org repo `team/design/design-law.md`). This table is a regenerated
> mirror; when they disagree, the CSS wins. Icon tokens come from
> `apps/mapsense/build/icon-src/BRAND-NOTE.md`.

| Role                        | Token             | Hex       |
|-----------------------------|-------------------|-----------|
| Accent (cyan)               | `--accent` / `--accent-2` | `#00D4FF` / `#33DDFF` |
| Icon/app background glow    | `--icon-bg-glow`  | `#16336E` |
| Icon/app background edge    | `--icon-bg-edge` = `--bg-0` | `#080E24` |
| Background raised           | `--bg-1`          | `#101C31` |
| Card / surface              | `--surface` / `--surface-1` | `#121F35` / `#182B47` |
| Border                      | `--line`          | `#2D4668` |
| Gold (MAS/premium)          | `--gold`          | `#C8A246` |
| Bell copper ramp (icon art) | highlight / mid / shadow | `#FFE2AC` / `#D99C54` / `#220E04` |
| Text primary / secondary / muted | `--text-0` / `--text-1` / `--text-2` | `#E6F1FF` / `#A9BFD9` / `#7F96B2` |
| Success                     | `--success`       | `#00E5A0` |
| Warning                     | `--warning`       | `#FFB74D` |
| Error                       | `--danger`        | `#FF5252` |
| Metric good / warn / bad    | `--good` / `--warn` / `--bad` | `#7ECFA0` / `#D4C46A` / `#D48A7E` |

Typography: headings and numerals **Chakra Petch**, body **Manrope** (Segoe
UI/system-ui fallback). Icon: the copper bell on the navy glow
(`build/icon-src/`, regenerated into icon.ico + tray PNGs by
`scripts/generate-icons.js`).

## UI/UX Guidelines

- **Clean, modern, dark theme** (gamers expect dark UI)
- **Minimal clicks to start:** Open app, select region, hit Start
- **First-run experience:** Onboarding dialog guides through 3 steps
- **Status always visible:** Beam connected/disconnected at top of window
- **Non-intrusive during gameplay:** Once started, the app is invisible except for alerts
- **Stats always visible:** No collapsible section, metrics are front and center

## Reference Links

- [Beam Eye Tracker Docs](https://docs.beam.eyeware.tech/)
- [Beam Python API Reference](https://docs.beam.eyeware.tech/api/python/index.html)
- [Beam on Steam](https://store.steampowered.com/app/2012120/Eyeware_Beam/)
- [Original Prototype (GitHub)](https://github.com/kenneth-ew/MOBA-Minimap-Awareness-Trainer)
- [Steamworks Documentation](https://partner.steamgames.com/doc/home)
- [PySide6 Docs](https://doc.qt.io/qtforpython-6/)
- [Mobalytics Eye Tracking (reference)](https://medium.com/@lauren.hayes/dont-go-blindly-into-summoner-s-rift-fe533864e557)
- [Overwolf SDK Introduction](https://dev.overwolf.com/ow-native/reference/ow-sdk-introduction/)
- [Overwolf Electron Technical Overview](https://dev.overwolf.com/ow-electron/getting-started/onboarding-resources/ow-electron-technical-overview/)
- [@overwolf/ow-electron npm package](https://www.npmjs.com/package/@overwolf/ow-electron)

## Testing

Legacy Python tests:
```bash
python -m pytest tests/ -v
```

Electron app (active - opus):
```bash
cd apps/mapsense
npm run typecheck
npm run lint
npm test
```

### Test structure (199 tests, 16 files)

| Suite | Files | Tests | Coverage |
|-------|-------|-------|----------|
| `tests/unit/` | 12 | 116 | MAS, region, presets, schemas, entitlement (+persistence), alertManager, analytics guards, IPC, updater state machine (+cancel/error recovery, ready-state recheck, cache hygiene), IRL webhook server (+bind retry), file logger (+rotation), uninstall cleanup cross-check |
| `tests/integration/` | 2 | 20 | Session engine free + paid modes |
| `tests/ui/` | 1 | 41 | Renderer DOM structure (all elements, metrics, onboarding, update banner, pro modal, autostart toggle, ad slot/placement, bell mark + hero artwork, offline-safety/CSP) |
| `tests/e2e/` | 1 | 22 | Smoke checks (files, scripts, HTML references, bundled-asset coverage, icon sources, auto-update wiring, main-process hardening, release-gate parity, no debug cruft) |

When adding new UI elements, add corresponding tests to `tests/ui/rendererLayout.test.ts`.
Lint runs clean with zero warnings; keep it that way.

### Field diagnostics

Packaged runs mirror all console output to `%APPDATA%/MapSense/logs/main.log`
(512KB rotation, one `.1` generation kept; `src/main/services/logger.ts`).
When a user reports a bug, ask for that file first. Uncaught exceptions,
unhandled rejections, and renderer crashes are logged there too, as are
renderer console warnings and errors (`forwardRendererConsole` in
`src/main/index.ts`). Electron's file logger only wraps MAIN-process console,
so without that forward a renderer-side failure leaves no trace at all.

### Packaged smoke test (before any release)

```bash
cd apps/mapsense
npm run package                      # NSIS installer + win-unpacked into release/
./release/win-unpacked/MapSense.exe    # must open the window, tray, and quit cleanly
```

## Releases & Auto-Update

The installed app self-updates via `electron-updater` against GitHub Releases
(`src/main/services/updater.ts`; owner/repo in package.json `build.publish` --
`bprenaj/mapsense`, public, so updates work anonymously). Checks 30s after launch
and every 4h; downloads in the background; the renderer shows a
"Restart to Update" banner (Cursor-style) plus a tray menu item when the update
is staged. Installing restarts the app immediately; ignoring it installs on quit.
Dev (unpackaged) runs disable the updater. The updater implements the
Auto-Update Standard cache-hygiene rules: it re-checks while an update is
staged (so restarts always land on the latest release) and drops the cached
`current.blockmap` before each check (so differential downloads keep working
under a fast cadence).

**Tray residency:** close hides to the tray; "Start with Windows" (on by
default, Settings toggle) registers a `--hidden` login item so boots go
straight to the tray. The uninstaller (`build/installer.nsh`, locked by
`tests/unit/uninstallCleanup.test.ts`) removes userData, the updater cache,
and the autostart Run value; verify real uninstalls with
`scripts/verify-uninstall.ps1`.

**Cutting a release** (monorepo: `npm version` silently skips the git tag
when package.json is not at the repo root, so tag by hand):

```bash
cd apps/mapsense
npm version patch --no-git-tag-version   # bumps package.json only
git add -A && git commit -m "Release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push --follow-tags                   # .github/workflows/release.yml builds + publishes
```

Publishing uploads the installer, the `.blockmap` (differential updates), and
`latest.yml` (the update feed). Never hand-edit or delete `latest.yml`.

> **Install gotcha (March 2026):** `@overwolf/ow-electron` must stay on a
> version whose runtime binary is still downloadable (403s otherwise). Pinned
> to 39.6.1. If `npm install` fails on the ow-electron postinstall, bump to the
> newest stable ow-electron release.

## Development Workflow

1. **Branch strategy:** `main` = stable/release, `dev` = active development, feature branches off `dev`
2. **Testing:** Test with Beam running + not running. Test on different screen resolutions and DPI scales.
3. **Steam builds:** Push to a `beta` branch on Steam first for internal testing, then promote to `default` for public release.
4. **Versioning:** Semantic versioning (1.0.0 for first Steam release)
