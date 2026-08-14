// ─────────────────────────────────────────────────────────────
//  shared.js — Helpers compartidos (sin dependencias de Telegram ni Baileys)
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const { google }   = require('googleapis');
const Anthropic    = require('@anthropic-ai/sdk');
const fs           = require('fs');
const path         = require('path');
const { getTodayKey, getTomorrowKey } = require('./date-keys');

// ─── CONSTANTES ─────────────────────────────────────────────
const COL_DRIVER      = 2;
const COL_TRUCK       = 3;
const COL_RUTA        = 4;
const COL_PHOTO_FIRST = 8;
const SHEET_ID_2026   = '1FlPvLr6eHExUb14CqPtPTUQmlHgUokIjLHFsidWzk-Y';

// ─── LOGGING ────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function getLogFile() {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return path.join(LOG_DIR, `${key}.log`);
}

function writeLog(level, args) {
  const ts = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const line = `[${ts}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
  fs.appendFileSync(getLogFile(), line);
}

// ─── GOOGLE SHEETS ──────────────────────────────────────────
async function getGoogleSheets() {
  const GOOGLE_CREDS = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
  const auth = process.env.GOOGLE_CREDENTIALS_JSON
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
    : new google.auth.GoogleAuth({
        keyFile: GOOGLE_CREDS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function leerFilasHoy(spreadsheetId) {
  const sid    = spreadsheetId || process.env.SPREADSHEET_ID;
  const sheets = await getGoogleSheets();
  const tabName = getTodayKey();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `'${tabName}'!A:W`,
  });
  const allRows = res.data.values || [];
  const driverRows = allRows.map((rowData, i) => ({ rowData, sheetRowIdx: i }));
  return { driverRows, tabName };
}

function colIdxToLetra(idx) {
  let letra = '';
  let n = idx;
  while (n >= 0) {
    letra = String.fromCharCode((n % 26) + 65) + letra;
    n = Math.floor(n / 26) - 1;
  }
  return letra;
}

async function anotarEnSheet(tabName, sheetRowIdx, rowData, numeroCarga, spreadsheetId) {
  const sid        = spreadsheetId || process.env.SPREADSHEET_ID;
  const sheets     = await getGoogleSheets();
  const existentes = rowData.slice(COL_PHOTO_FIRST).map(v => (v || '').trim());
  if (existentes.includes(numeroCarga)) {
    return null; // duplicado
  }
  let colIdx = COL_PHOTO_FIRST;
  while (colIdx < rowData.length && (rowData[colIdx] || '').trim() !== '') colIdx++;
  const colLetra = colIdxToLetra(colIdx);
  const rowNum   = sheetRowIdx + 1;
  const range    = `'${tabName}'!${colLetra}${rowNum}`;
  const numFoto  = colIdx - COL_PHOTO_FIRST + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[numeroCarga]] },
  });
  return numFoto;
}

function encontrarChoferPorNombre(driverRows, nombrePrincipal) {
  if (!nombrePrincipal) return null;
  return driverRows.find(r => (r.rowData[COL_DRIVER] || '').trim().toLowerCase() === nombrePrincipal) || null;
}

// ─── CLAUDE VISION ──────────────────────────────────────────
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

async function extraerDatosImagen(imagenBase64, mimeType) {
  const anthropic = getAnthropic();

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imagenBase64 },
        },
        {
          type: 'text',
          text: `Analiza esta imagen de un chofer de carga de arena.\n\n1. Si es pantalla de la app Newmile (señales: interfaz móvil, botones "Aceptar Carga" o "Descargado", número de carga de 7 dígitos):\n   → Extrae el número de 7 dígitos y responde: NEWMILE|1234567\n\n2. Cualquier otra imagen (tickets de papel, SandCo, Damp SandCo, BOL, fotos de camión, etc.):\n   → Responde: IGNORAR\n\nResponde SOLO en el formato indicado, sin texto adicional.`,
        },
      ],
    }],
  });
  const texto = response.content[0].text.trim();
  const parts = texto.split('|');
  if (parts[0] === 'NEWMILE' && /^\d{7}$/.test(parts[1])) {
    return { tipo: 'NEWMILE', numero: parts[1] };
  }
  return { tipo: 'IGNORAR' };
}

// ─── COPIA PROGRAMACIÓN NOCTURNA ────────────────────────────
// notificarFn: async (texto) => void  — canal de notificación (WA, Telegram, etc.)
async function copiarProgramacionManana(spreadsheetId, notificarFn) {
  const tomorrowKey = getTomorrowKey();
  const todayKey    = getTodayKey();
  let tabName       = tomorrowKey;
  writeLog('INFO', [`[CRON] Copiando programación ${tabName} de 2026 → TEST...`]);

  const sheets = await getGoogleSheets();

  let sourceValues;
  try {
    const src = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID_2026,
      range: `'${tabName}'!A:W`,
    });
    sourceValues = src.data.values;
  } catch { sourceValues = null; }

  if (!sourceValues || sourceValues.length === 0) {
    if (todayKey !== tomorrowKey) {
      try {
        const fallback = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID_2026,
          range: `'${todayKey}'!A:W`,
        });
        if (fallback.data.values && fallback.data.values.length > 0) {
          writeLog('INFO', [`[CRON] No existe ${tomorrowKey}; usando ${todayKey} como fallback.`]);
          tabName      = todayKey;
          sourceValues = fallback.data.values;
        }
      } catch { /* ignore */ }
    }
  }

  if (!sourceValues || sourceValues.length === 0) {
    writeLog('INFO', [`[CRON] Tab ${tabName} no existe en Sandloads 2026 — avisando`]);
    await notificarFn(`Copia nocturna fallida\n\nNo existe la pestaña ${tabName} en Sandloads 2026.\nCrea la programación antes de las 10 PM.`);
    return;
  }

  const srcMeta  = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID_2026 });
  const srcSheet = (srcMeta.data.sheets || []).find(s => s.properties.title === tabName);
  if (!srcSheet) {
    await notificarFn(`Copia nocturna fallida\n\nNo existe la pestaña ${tabName} en Sandloads 2026.`);
    return;
  }
  const srcSheetId = srcSheet.properties.sheetId;

  const meta     = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = (meta.data.sheets || []).find(s => s.properties.title === tabName);
  if (existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ deleteSheet: { sheetId: existing.properties.sheetId } }] },
    });
  }

  const copyRes = await sheets.spreadsheets.sheets.copyTo({
    spreadsheetId: SHEET_ID_2026,
    sheetId: srcSheetId,
    requestBody: { destinationSpreadsheetId: spreadsheetId },
  });
  const newSheetId = copyRes.data.sheetId;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ updateSheetProperties: { properties: { sheetId: newSheetId, title: tabName, index: 0 }, fields: 'title,index' } }],
    },
  });

  const choferes = sourceValues.slice(2).filter(r => (r[COL_DRIVER] || '').trim()).length;
  writeLog('INFO', [`[CRON] ${tabName} copiado — ${choferes} choferes`]);
  await notificarFn(`Programacion ${tabName} lista\n\n${choferes} choferes copiados a Sandloads TEST.`);
}

module.exports = {
  COL_DRIVER,
  COL_TRUCK,
  COL_RUTA,
  COL_PHOTO_FIRST,
  SHEET_ID_2026,
  writeLog,
  getLogFile,
  getGoogleSheets,
  leerFilasHoy,
  colIdxToLetra,
  anotarEnSheet,
  encontrarChoferPorNombre,
  extraerDatosImagen,
  copiarProgramacionManana,
};
