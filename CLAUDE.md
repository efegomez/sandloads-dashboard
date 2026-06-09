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

Operational dashboard for TREC sand transport. Reads data from a Google Sheets tab named `MM.DD` (e.g. `05.16`) via a published CSV URL embedded in the page.

**Active files in root:** `index.html`, `style.css` (and any `config.js`, `dashboard.js`, `parser.js` if present).

`clientes/TREC/dashboard/` is an old working copy — **do not edit**; edit the root.

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

See `clientes/Bloom/Cotizador Bloom/CLAUDE.md` for full architecture. Always edit `index.html` there — never `cotizador.html` or `indexold*.html`.

## Credentials

Never in git. Stored at `C:\Users\efego\Boveda\` (outside repo).

## Files never to commit

- `clientes/TREC/dispatch-bot/.env`
- `clientes/TREC/dispatch-bot/credentials.json`
- Any `*.json` file named like a GCP service account key
