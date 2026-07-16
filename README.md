# Sandloads Dashboard

Dashboard operacional en tiempo real para seguimiento de choferes y cargas (TREC).

Vive en un único archivo (`index.html`, todo el CSS y JS inline) publicado vía GitHub Pages en `https://efegomez.github.io/sandloads-dashboard`. No hay build step.

## Setup

### 1. API Key de Google

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Activa la **Google Sheets API**: *APIs & Services → Enable APIs → busca "Google Sheets API"*
3. Crea una API Key: *APIs & Services → Credentials → Create Credentials → API Key*
4. **Restringe la key** a tu dominio de GitHub Pages (Application restrictions → HTTP referrers → `https://efegomez.github.io/*`) y, si puedes, limita el API restriction solo a Google Sheets API. Esto no es opcional: la key vive en texto plano en un repo público.

### 2. Edita `index.html`

Dentro del `<script>`, cerca del inicio:

```js
const SHEET_ID  = "1FlPvLr6eHExUb14CqPtPTUQmlHgUokIjLHFsidWzk-Y";  // ya configurado
const API_KEY   = "PEGA_TU_NUEVA_API_KEY_AQUI";                    // ← pega tu key aquí
```

### 3. GitHub Pages

Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main` / `(root)`. El dashboard queda en `https://efegomez.github.io/sandloads-dashboard`.

### 4. Permisos del Sheet

El Google Sheet debe ser accesible con la API Key:
- Compartir el sheet con *"cualquier persona con el enlace puede ver"*, **o**
- Usar una Service Account (más seguro para producción, pero requiere backend — no aplica a esta versión estática)

## Estructura de archivos

```
sandloads-dashboard/
├── index.html     → Todo el dashboard: HTML + CSS + JS inline
├── CLAUDE.md       → Instrucciones para Claude Code sobre este repo
├── CONTEXT.md      → Mapa del workspace completo (multi-cliente)
├── ONBOARDING.md   → Guía de onboarding del equipo
└── README.md
```

No hay `config.js`, `parser.js`, `dashboard.js` ni `style.css` — existieron en una versión anterior modular, pero el `index.html` actual no los referencia. Si los ves en el repo remoto, son código muerto: bórralos al hacer push de esta versión.

## Formato esperado del Sheet

Cada día tiene una pestaña con encabezado `MM.DD` (mes.día), por ejemplo `07.16`:

```
Driver name | Truck # | RUTA           | Qty | STATUS | PHOTO | 1        | 2        |