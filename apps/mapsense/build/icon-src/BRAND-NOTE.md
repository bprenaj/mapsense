# MapSense icon

The mark is the copper bell with its cyan circuit traces, alone, on
transparency. `icon-*.png` here are generated, never hand-edited:
`scripts/render-mark.js` takes the designer's master
(`original/icon-master.svg`), deletes the one full-canvas rect that draws the
navy plate, and rasterises the rest. `scripts/generate-icons.js` then turns
those PNGs into `build/icon.ico` and the tray variants, and `copy-static.mjs`
bundles `icon-256.png` into the renderer as the sidebar mark. One source, so
the ico, the tray, the taskbar and the app's own sidebar cannot drift.

`original/` holds the designer's artwork as shipped: the master SVG plus the
plated PNG renders (`bell-on-navy-*.png`) kept for reference. When new artwork
arrives, replace `original/` and rerun both scripts.

Bell: copper ramp (highlight #FFE2AC, mid #D99C54, shadow #220E04).
Circuits and clapper glow: `--accent` #00D4FF.

The plate's colours live on as the app's own background pair, so the running
window and the mark read as one object:

- `--icon-bg-glow: #16336E`
- `--icon-bg-edge: #080E24`

radial, 42%/55% center.
