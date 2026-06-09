# Contexto del workspace — Fernando Gómez

## Quién soy
Trabajo con clientes en proyectos de software y operaciones. Uso Claude Code para debug, features, análisis y automatizaciones.

## Estructura del repo

```
Claude/                          ← repo GitHub Pages (efegomez/sandloads-dashboard)
│
├── clientes/
│   ├── TREC/
│   │   ├── dashboard/           ← copia vieja (no editar — editar index.html en raíz)
│   │   └── dispatch-bot/        ← bot Telegram + cron Google Sheets (corre en Fly.io)
│   ├── Bloom/                   ← cotizador Bloom Design Studio (efegomez/cotizador-bloom)
│   ├── Alejandro/               ← proyectos cliente Alejandro
│   ├── Lys/                     ← proyectos cliente Lys
│   └── Anita/
│       └── vita-simulador/      ← simulador cliente Anita
│
├── herramientas/
│   └── Agentes/                 ← experimentos con agentes IA
│
├── aprendizaje/
│   ├── Curso/
│   ├── Especializacion/
│   └── awesome-llm-apps/        ← referencia LLM apps
│
├── personal/
│   └── Colpensiones/            ← documentos pensión personal
│
├── CONTEXT.md                   ← este archivo
├── CLAUDE.md                    ← instrucciones para Claude Code
└── ONBOARDING.md                ← guía para equipo nuevo
```

## Credenciales
**NUNCA en git.** Guardadas en `C:\Users\efego\Boveda\` (fuera del repo).
Incluye: `.env` del dispatch-bot, `credentials.json` GCP, API keys.

## Proyectos activos

### TREC — Sandloads Dashboard
- Dashboard: `index.html` en raíz del repo, publicado en GitHub Pages
- Bot: `clientes/TREC/dispatch-bot/` — **corre en Fly.io**, no local. Cron 10 PM Bogotá
- Sheets: "Sandloads 2026" (master) → "Sandloads TEST" (bot)
- Runbook: `clientes/TREC/dispatch-bot/RUNBOOK.md`

### Personal
- `personal/Colpensiones/` — documentos trámite pensión

### Bloom — Cotizador
- Repo: `efegomez/cotizador-bloom`
- Single-file React 18, no build step, GitHub Pages

## Comandos frecuentes

```powershell
# Arrancar dispatch-bot
cd "C:\Users\efego\Claro drive\Claude\clientes\TREC\dispatch-bot"
npm start  # solo si debug local — producción corre en Fly.io

# Deploy dashboard (raíz del repo)
git add . && git commit -m "..." && git push origin main
```

## Notas para Claude
- `dispatch-bot` puede estar corriendo al iniciar sesión — no matar procesos node sin confirmar
- Nunca commitear archivos de `C:\Users\efego\Boveda\`
- Editar dashboard en raíz (`index.html`), NO en `clientes/TREC/dashboard/` (copia vieja)
