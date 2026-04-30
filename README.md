# Sandloads Dashboard

Dashboard operacional en tiempo real para seguimiento de choferes y cargas.

## Setup en 5 pasos

### 1. Clona o sube los archivos al repo

```bash
git clone https://github.com/efegomezmo/sandloads-dashboard
```

### 2. Crea una API Key de Google

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un proyecto nuevo (o usa uno existente)
3. Activa la **Google Sheets API**: *APIs & Services → Enable APIs → busca "Google Sheets API"*
4. Crea una API Key: *APIs & Services → Credentials → Create Credentials → API Key*
5. (Opcional pero recomendado) Restringe la key a tu dominio de GitHub Pages

### 3. Edita `config.js`

```js
const CONFIG = {
  GOOGLE_API_KEY: "TU_API_KEY_AQUI",   // ← pega tu key aquí
  SHEET_ID: "1FlPvLr6eHExUb14CqPtPTUQmlHgUokIjLHFsidWzk-Y",  // ya está configurado
  ...
};
```

### 4. Activa GitHub Pages

1. Ve a tu repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `(root)`
4. Guarda → tu dashboard estará en `https://efegomezmo.github.io/sandloads-dashboard`

### 5. Permisos del Sheet

El Google Sheet debe ser **accesible con la API Key**. Opciones:
- Compartir el sheet con *"cualquier persona con el enlace puede ver"*, **o**
- Usar una Service Account (más seguro para producción)

---

## Estructura de archivos

```
sandloads-dashboard/
├── index.html     → Estructura del dashboard
├── style.css      → Estilos (tema oscuro industrial)
├── config.js      → ⚙️  TU CONFIGURACIÓN AQUÍ
├── parser.js      → Lee y parsea el Google Sheet
├── dashboard.js   → Render y auto-refresh
└── README.md
```

## Formato esperado del Sheet

Cada día tiene una sección con encabezado `04.30` (mes.día):

```
Driver name | Truck # | RUTA           | Qty | STATUS | PHOTO | 1        | 2        | ...
Yordis S.   | 2947    | PB To Nash 12am| 5   | ACTIVO |       | 1629125  | 1630427  |
```

- Las columnas numéricas (1, 2, 3...) son los IDs de foto de cada carga completada
- El dashboard cuenta cuántas columnas de carga tienen valor → eso son las cargas completadas

## Comandos de refresh

Desde la UI puedes:
- Cambiar el intervalo de auto-refresh (1, 5, 10, 15, 30 min)
- Hacer refresh manual con el botón "Actualizar"
