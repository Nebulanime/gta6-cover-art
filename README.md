# gta6-cover-art

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/Nebulanime/gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/Nebulanime/gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Leonida Cover Studio — an offline web app that turns any photo and caption into GTA 6-style multi-panel cover art, exported as a PNG to share. Photos never leave the machine: everything runs locally in a desktop browser from static files.

## What it does

- **Any photo in, cover art out** — upload up to 4 photos (or drag & drop), or try the built-in Vice City sample scene. Click a panel in the preview to select it; zoom, pan, flip or fit each photo per panel.
- **Multi-panel GTA poster look** — Collage (classic cover grid), Hero (single full-bleed photo) and Duo layouts, with comic panel borders, bold condensed lettering, a sunburst VI badge and a Vice City sunset or neon colour grade.
- **Colour grades** — Sunset, Neon, Noir and Vice duotone grades with posterize levels, halftone print dots and film grain, all computed on canvas.
- **Editable caption** — title, subtitle, tagline, badge text and title style.
- **Post sizes, one click** — export PNG at 1080×1080, 1080×1350, 1920×1080 or 1080×1920.

## Run it

```sh
node main.ts
```

`main.ts` (Node 22, no dependencies) validates the app files, checks the app loads zero external resources, and renders a deterministic sample cover to `out/cover-sample.png` with a report at `out/report.json`. Run it twice — the outputs are byte-identical.

Then open the app — no build step, no server needed:

```sh
open app/index.html
```

or serve it statically (`python3 -m http.server -d app`) and open http://localhost:8000.

## Layout

- `main.ts` — Node 22 entrypoint (validates + renders a sample cover to `out/`)
- `app/index.html`, `app/app.js`, `app/styles.css` — the offline web app (static files only)
- `screenshots/` — the app with a photo loaded, and covers it exported

## Notes

Fan-made cover art in the style of GTA 6 posters. Not affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive. No Rockstar logo, artwork or fonts are used — all art, lettering and code here are original.

---

Entered on [make.fun](https://make.fun/?ref=0zsa1rk7&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards
