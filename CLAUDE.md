# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo overview

This folder (`C:\Users\efego\Claro drive\Claude\`) **is** the `efegomez/sandloads-dashboard` GitHub repo. Files in the root are published via GitHub Pages at `https://efegomez.github.io/sandloads-dashboard`.

Sub-projects live under `clientes/`, `herramientas/`, `aprendizaje/`, `personal/`. See `CONTEXT.md` for full map.

## Deploy

No build step. Edit files in the root, then:

```powershell
git add .
git commit -m "descripción"
git push origin main
```

GitHub Pages auto-deploys in ~1 min. Hard-refresh with Ctrl+Shift+R.

## Project 1 — Sandloads Dashboard (root)

Operational dashboard for TREC sand transport. Single self-contained `index.html` (HTML + CSS + JS inline) that reads data from a Google Sheets tab named `MM.DD` (e.g. `07.16`) via the Sheets API, using `SHEET_ID` and `API_KEY` hardcoded in the script.

**Active file: `index.html` only.** No `config.js`, `parser.js`, `dashboard.js`, or `style.css` — if those appear in the repo, they are dead code from an earlier modular version and should be deleted, not edited.

`clientes/TREC/dashboard/` is an old working copy — **do not edit**; edit the root.

**Security note:** the Google API key lives in plain text in `index.html`, which is in a public repo. It must be restricted (HTTP referrer + API restriction) in Google Cloud Console. Never let a key sit unrestricted here.

## Project 2 — Dispatch Bot (`clientes/TREC/dispatch-bot/`)

Telegram bot: chofer sends photo → Claude Vision extracts 7-digit load number → writes to Google Sheets (Sandloads TEST tab). Nightly cron at 10 PM (Bogotá) copies next day's tab from Sandloads 2026 → TEST.

**Deployed on Fly.io — does not run locally in normal operation.**

**Run locally (only if needed):**
```powershell
cd "C:\Users\efego\Claro drive\Claude\clientes\TREC\dispatch-bot"
npm start
```

**Key files:** `bot.js` (all logic), `.env` (never commit), `credentials.json` (never commit), `logs/` (daily logs), `copiar-manana.js` (manual copy if cron missed).

**Sheets:** Sandloads 2026 (master schedule) → Sandloads TEST (bot reads/writes) ← Dashboard reads from 2026.

See `clientes/TREC/dispatch-bot/RUNBOOK.md` for operations and troubleshooting.

**Do not delete:** `clientes/TREC/dispatch-bot/node_modules/`.

## Project 3 — Cotizador Bloom (`clientes/Bloom/Cotizador Bloom/`)

Quote generator for Bloom Design Studio. Single-file React 18 app (no build, JSX pre-compiled). Lives in its own git repo (`efegomez/cotizador-bloom`), deployed to GitHub Pages.

See `clientes/Bloom/Cotizador Bloom/CLAUDE.md`