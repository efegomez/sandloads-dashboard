// ─────────────────────────────────────────────
//  SANDLOADS DASHBOARD — CONFIGURACIÓN
//  Edita estos valores antes de hacer deploy
// ─────────────────────────────────────────────

const CONFIG = {
  // 1. Tu API Key de Google (Google Cloud Console → APIs → Sheets API)
  GOOGLE_API_KEY: "AIzaSyDxNpc2JTcpmCMndsTo7t_llqbAPW8K-Eo",

  // 2. ID del Google Sheet (está en la URL del sheet)
  //    https://docs.google.com/spreadsheets/d/  →ESTE_ID←  /edit
  SHEET_ID: "1FlPvLr6eHExUb14CqPtPTUQmlHgUokIjLHFsidWzk-Y",

  // 3. Nombre de la hoja según el mes actual (ajusta si es diferente)
  //    El dashboard intentará detectarlo automáticamente
  SHEET_NAMES: {
    1:  "Enero",
    2:  "Feb",
    3:  "Mar",
    4:  "Abril",
    5:  "Mayo",
    6:  "Jun",
    7:  "Jul",
    8:  "Ago",
    9:  "Sep",
    10: "Oct",
    11: "Nov",
    12: "Dic"
  },

  // 4. Refresh por defecto en minutos (el usuario lo puede cambiar en el UI)
  DEFAULT_REFRESH_MINUTES: 5,

  // 5. Zona horaria de operaciones (para calcular "hoy")
  TIMEZONE: "America/New_York"
};
