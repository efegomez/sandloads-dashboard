// ─────────────────────────────────────────────────────────────
//  Dispatch Bot — Telegram + Claude Vision + Google Sheets
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const { Telegraf } = require('telegraf');
const Anthropic    = require('@anthropic-ai/sdk');
const { google }   = require('googleapis');
const cron         = require('node-cron');
const fs           = require('fs');
const path         = require('path');
const https        = require('https');
const http         = require('http');

// ─── LOGGING ────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

function getLogFile() {
  const d = new Date();
  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return path.join(LOG_DIR, `${key}.log`);
}

function writeLog(level, args) {
  const ts = new Date().toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  const line = `[${ts}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
  fs.appendFileSync(getLogFile(), line);
}

const _log   = console.log.bind(console);
const _error = console.error.bind(console);
console.log   = (...a) => { _log(...a);   writeLog('INFO',  a); };
console.error = (...a) => { _error(...a); writeLog('ERROR', a); };

// ─── CONFIGURACIÓN ──────────────────────────────────────────
const SPREADSHEET_ID    = process.env.SPREADSHEET_ID;
const SHEET_ID_2026     = '1FlPvLr6eHExUb14CqPtPTUQmlHgUokIjLHFsidWzk-Y';
const CHOFERES_SHEET_ID = process.env.CHOFERES_SHEET_ID || SPREADSHEET_ID;
const ANTHROPIC_KEY     = process.env.ANTHROPIC_API_KEY;
const GOOGLE_CREDS      = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const TARGET_GROUP_IDS  = (process.env.GROUP_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const OWNER_CHAT_ID     = process.env.OWNER_CHAT_ID;
const BOT_TOKEN         = process.env.TELEGRAM_BOT_TOKEN;

// Columnas del tab diario (índice 0-based)
const COL_DRIVER      = 2;
const COL_TRUCK       = 3;
const COL_RUTA        = 4;
const COL_PHOTO_FIRST = 8;

// ─── BOT INSTANCE ───────────────────────────────────────────
const bot = new Telegraf(BOT_TOKEN);

// ─── DIRECTORIO ─────────────────────────────────────────────
// Mapea telegram_user_id → nombre principal en sheet (columna D de Choferes)
let TELEGRAM_MAP = {};

async function cargarDirectorio() {
  try {
    const sheets = await getGoogleSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CHOFERES_SHEET_ID,
      range: 'Choferes!A2:D100',
    });
    const rows = res.data.values || [];
    TELEGRAM_MAP = {};
    for (const row of rows) {
      const nombre     = (row[0] || '').trim();
      const principal  = (row[2] || '').trim() || nombre;
      const telegramId = (row[3] || '').trim();
      if (telegramId && nombre) TELEGRAM_MAP[telegramId] = principal.toLowerCase();
    }
    console.log(`Directorio cargado: ${Object.keys(TELEGRAM_MAP).length} choferes con Telegram registrado.`);
  } catch (e) {
    console.error('Error cargando directorio:', e.message);
  }
}

// ─── HELPERS ────────────────────────────────────────────────
function getTodayKey() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  return String(bogota.getMonth() + 1).padStart(2, '0') + '.' + String(bogota.getDate()).padStart(2, '0');
}

function getTomorrowKey() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  bogota.setDate(bogota.getDate() + 1);
  return String(bogota.getMonth() + 1).padStart(2, '0') + '.' + String(bogota.getDate()).padStart(2, '0');
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

// ─── GOOGLE SHEETS ──────────────────────────────────────────
async function getGoogleSheets() {
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

async function leerFilasHoy() {
  const sheets  = await getGoogleSheets();
  const tabName = getTodayKey();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A:W`,
  });
  const allRows = res.data.values || [];
  const driverRows = allRows.map((rowData, i) => ({ rowData, sheetRowIdx: i }));
  return { driverRows, tabName };
}

function encontrarChofer(driverRows, telegramUserId) {
  const nombrePrincipal = TELEGRAM_MAP[telegramUserId];
  if (!nombrePrincipal) return null;
  console.log(`Telegram ID ${telegramUserId} → chofer: ${nombrePrincipal}`);
  return driverRows.find(r => (r.rowData[COL_DRIVER] || '').trim().toLowerCase() === nombrePrincipal) || null;
}

function encontrarChoferLaMesa(driverRows, driverName, telegramUserId) {
  const sepIdx = driverRows.findIndex(r =>
    (r.rowData[COL_DRIVER] || '').trim().toLowerCase() === 'la mesa - groupme'
  );
  if (sepIdx === -1) { console.log('Separador LA MESA - GROUPME no encontrado'); return null; }
  const laMesaRows = driverRows.slice(sepIdx + 1);

  // Primero: buscar por Telegram ID (chofer registrado con /registrar)
  if (telegramUserId) {
    const nombrePrincipal = TELEGRAM_MAP[telegramUserId];
    if (nombrePrincipal) {
      const byId = laMesaRows.find(r => (r.rowData[COL_DRIVER] || '').trim().toLowerCase() === nombrePrincipal);
      if (byId) { console.log(`La Mesa: Telegram ID ${telegramUserId} → ${nombrePrincipal}`); return byId; }
    }
  }

  // Fallback: nombre del driver extraído del ticket
  const nameLower = (driverName || '').toLowerCase().trim();
  console.log(`La Mesa: buscando por nombre "${nameLower}"`);
  return laMesaRows.find(r => (r.rowData[COL_DRIVER] || '').trim().toLowerCase() === nameLower) || null;
}

async function anotarEnSheet(tabName, sheetRowIdx, rowData, numeroCarga) {
  const sheets     = await getGoogleSheets();
  const existentes = rowData.slice(COL_PHOTO_FIRST).map(v => (v || '').trim());
  if (existentes.includes(numeroCarga)) {
    console.log(`Duplicado detectado: ${numeroCarga} ya existe en fila ${sheetRowIdx + 1}`);
    return null;
  }
  let colIdx = COL_PHOTO_FIRST;
  while (colIdx < rowData.length && (rowData[colIdx] || '').trim() !== '') colIdx++;
  const colLetra = colIdxToLetra(colIdx);
  const rowNum   = sheetRowIdx + 1;
  const range    = `${tabName}!${colLetra}${rowNum}`;
  const numFoto  = colIdx - COL_PHOTO_FIRST + 1;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[numeroCarga]] },
  });
  console.log(`Anotado ${numeroCarga} en ${range}`);
  return numFoto;
}

async function anotarLaMesa(tabName, sheetRowIdx, rowData, bolId, tons) {
  const sheets = await getGoogleSheets();

  // Verificar duplicado (columnas pares desde COL_PHOTO_FIRST)
  const existingBols = [];
  for (let i = COL_PHOTO_FIRST; i < rowData.length; i += 2) {
    if ((rowData[i] || '').trim()) existingBols.push((rowData[i] || '').trim());
  }
  if (existingBols.includes(bolId)) {
    console.log(`Duplicado La Mesa: BOL ${bolId} ya existe en fila ${sheetRowIdx + 1}`);
    return null;
  }

  // Siguiente par libre (BOL en col par, Tons en col impar)
  let colIdx = COL_PHOTO_FIRST;
  while (colIdx < rowData.length && (rowData[colIdx] || '').trim() !== '') colIdx += 2;

  const colBol  = colIdxToLetra(colIdx);
  const colTons = colIdxToLetra(colIdx + 1);
  const rowNum  = sheetRowIdx + 1;
  const tripNum = (colIdx - COL_PHOTO_FIRST) / 2 + 1;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `${tabName}!${colBol}${rowNum}`,  values: [[bolId]] },
        { range: `${tabName}!${colTons}${rowNum}`, values: [[tons]]  },
      ],
    },
  });

  console.log(`Anotado La Mesa: BOL ${bolId} / ${tons} tons en ${tabName}!${colBol}-${colTons}${rowNum}`);
  return tripNum;
}

// ─── CLAUDE VISION ──────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

async function extraerDatosImagen(imagenBase64, mimeType) {
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
          text: `Analiza esta imagen de un chofer de carga de arena. Sigue este orden EXACTO:

1. PRIMERO verifica si es ticket de La Mesa / Hibernia:
   Señales: "PO: KATHERINEJ10H", "Hibernia Resources", "Lamesa, TX", campo "BOL ID:" o "BOL #:".
   Estos tickets SÍ tienen código QR — el QR no es motivo para ignorarlos.
   → Extrae: BOL ID (7 dígitos del campo BOL ID/BOL #), Tons (número decimal columna Tons), nombre Driver.
   → Responde: LAMESA|1145740|24.64|Jesus Valdes

2. LUEGO verifica si es pantalla Newmile (app de asignación de carga):
   Señales: interfaz de app móvil, botones "Aceptar Carga", "Descargado", número de carga de 7 dígitos.
   → Extrae el número de 7 dígitos de la carga NUEVA aceptada.
   → Responde: NEWMILE|1234567

3. Si es ticket de SandCo / Damp SandCo (texto "SandCo, LLC", "Damp SandCo") o imagen no reconocida:
   → Responde: IGNORAR

Responde SOLO en el formato indicado, sin texto adicional.`,
        },
      ],
    }],
  });
  const texto = response.content[0].text.trim();
  console.log(`Claude extrajo: "${texto}"`);

  const parts = texto.split('|');
  if (parts[0] === 'NEWMILE' && /^\d{7}$/.test(parts[1])) {
    return { tipo: 'NEWMILE', numero: parts[1] };
  }
  if (parts[0] === 'LAMESA' && parts[1] && parts[2]) {
    return { tipo: 'LAMESA', bolId: parts[1].trim(), tons: parts[2].trim(), driver: (parts[3] || '').trim() };
  }
  return { tipo: 'IGNORAR' };
}

// ─── DESCARGA FOTO TELEGRAM ─────────────────────────────────
async function downloadTelegramPhoto(fileId) {
  const fileInfo = await bot.telegram.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      res.on('error', reject);
    });
  });
}

// ─── COPIA NOCTURNA (10 PM Colombia) ────────────────────────
async function copiarProgramacionManana() {
  const tabName = getTomorrowKey();
  console.log(`[CRON] Copiando programación ${tabName} de 2026 → TEST...`);
  try {
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
      console.log(`[CRON] Tab ${tabName} no existe en Sandloads 2026 — avisando`);
      await bot.telegram.sendMessage(OWNER_CHAT_ID,
        `Copia nocturna fallida\n\nNo existe la pestaña ${tabName} en Sandloads 2026.\nCrea la programación antes de las 10 PM.`
      );
      return;
    }

    const srcMeta  = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID_2026 });
    const srcSheet = (srcMeta.data.sheets || []).find(s => s.properties.title === tabName);
    if (!srcSheet) {
      await bot.telegram.sendMessage(OWNER_CHAT_ID, `Copia nocturna fallida\n\nNo existe la pestaña ${tabName} en Sandloads 2026.`);
      return;
    }
    const srcSheetId = srcSheet.properties.sheetId;

    const meta     = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existing = (meta.data.sheets || []).find(s => s.properties.title === tabName);
    if (existing) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ deleteSheet: { sheetId: existing.properties.sheetId } }] },
      });
    }

    const copyRes = await sheets.spreadsheets.sheets.copyTo({
      spreadsheetId: SHEET_ID_2026,
      sheetId: srcSheetId,
      requestBody: { destinationSpreadsheetId: SPREADSHEET_ID },
    });
    const newSheetId = copyRes.data.sheetId;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ updateSheetProperties: { properties: { sheetId: newSheetId, title: tabName, index: 0 }, fields: 'title,index' } }],
      },
    });

    const choferes = sourceValues.slice(2).filter(r => (r[COL_DRIVER] || '').trim()).length;
    console.log(`[CRON] ${tabName} copiado — ${choferes} choferes`);
    await bot.telegram.sendMessage(OWNER_CHAT_ID,
      `Programacion ${tabName} lista\n\n${choferes} choferes copiados a Sandloads TEST.`
    );
  } catch (err) {
    console.error('[CRON] Error en copia nocturna:', err.message);
    await bot.telegram.sendMessage(OWNER_CHAT_ID, `Error en copia nocturna ${tabName}: ${err.message}`);
  }
}

cron.schedule('0 22 * * *', copiarProgramacionManana, { timezone: 'America/Bogota' });
console.log('Cron nocturno activo — copia programacion a las 10 PM (Bogota).');

// ─── COMANDO /registrar ──────────────────────────────────────
// Cada chofer lo usa una vez para vincular su Telegram ID al sheet
bot.command('registrar', async (ctx) => {
  const nombre = ctx.message.text.split(' ').slice(1).join(' ').trim();
  if (!nombre) return ctx.reply('Uso: /registrar TuNombreExacto\nEjemplo: /registrar Juan Perez');
  try {
    const sheets = await getGoogleSheets();
    const res    = await sheets.spreadsheets.values.get({
      spreadsheetId: CHOFERES_SHEET_ID,
      range: 'Choferes!A2:D100',
    });
    const rows        = res.data.values || [];
    const nombreLower = nombre.toLowerCase().trim();
    let rowIndex = -1;
    let principal = '';
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i][0] || '').toLowerCase().trim() === nombreLower) {
        rowIndex  = i + 2; // 1-indexed + skip header
        principal = (rows[i][2] || rows[i][0] || '').trim();
        break;
      }
    }
    if (rowIndex === -1) return ctx.reply(`No encontre "${nombre}" en el sistema. Verifica tu nombre con el despachador.`);
    const telegramId = String(ctx.from.id);
    await sheets.spreadsheets.values.update({
      spreadsheetId: CHOFERES_SHEET_ID,
      range: `Choferes!D${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[telegramId]] },
    });
    TELEGRAM_MAP[telegramId] = principal.toLowerCase();
    console.log(`Registrado: ${nombre} → Telegram ID ${telegramId}`);
    await ctx.reply(`Registrado. Bienvenido ${nombre.split(' ')[0]}.`);
  } catch (e) {
    console.error('Error en /registrar:', e.message);
    await ctx.reply('Error al registrar. Intenta de nuevo o habla con el despachador.');
  }
});

// ─── HANDLER PRINCIPAL: IMAGEN EN GRUPO ─────────────────────
bot.on('photo', async (ctx) => {
  try {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return;
    if (!TARGET_GROUP_IDS.includes(String(ctx.chat.id))) return;

    const userId    = String(ctx.from.id);
    const nombreLog = TELEGRAM_MAP[userId] || `user_${userId}`;
    console.log(`Imagen de ${nombreLog} en "${ctx.chat.title}"`);

    // Foto mas grande = mejor calidad para OCR
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    const base64    = await downloadTelegramPhoto(fileId);
    const resultado = await extraerDatosImagen(base64, 'image/jpeg');

    if (resultado.tipo === 'IGNORAR') {
      console.log(`Imagen ignorada (${nombreLog}): no reconocida`);
      return;
    }

    let driverRows, tabName;
    try {
      ({ driverRows, tabName } = await leerFilasHoy());
    } catch (e) {
      console.log(`Error leyendo sheet: ${e.message}`);
      await bot.telegram.sendMessage(OWNER_CHAT_ID, `No pude leer la hoja "${getTodayKey()}". Verifica que exista.`);
      return;
    }

    // ── TREC / NEWMILE ──────────────────────────────────────
    if (resultado.tipo === 'NEWMILE') {
      const chofer = encontrarChofer(driverRows, userId);
      if (!chofer) {
        await bot.telegram.sendMessage(OWNER_CHAT_ID,
          `Chofer no registrado\nTelegram ID: ${userId}\nNombre: ${ctx.from.first_name}\nQue envie /registrar NombreExacto`
        );
        return;
      }
      const { rowData, sheetRowIdx } = chofer;
      const driverName = (rowData[COL_DRIVER] || 'Driver').trim().split(' ')[0];
      const truck      = rowData[COL_TRUCK] || '-';
      const ruta       = rowData[COL_RUTA]  || '-';
      const numFoto    = await anotarEnSheet(tabName, sheetRowIdx, rowData, resultado.numero);
      if (numFoto === null) {
        console.log(`Duplicado ignorado: ${driverName} ya tiene ${resultado.numero}`);
        await ctx.reply(`Carga ${resultado.numero} ya fue registrada. Envia la captura correcta.`);
        return;
      }
      await bot.telegram.sendMessage(OWNER_CHAT_ID,
        `Carga registrada\n\n${driverName}\nTruck: ${truck}\nRuta: ${ruta}\nCarga #${numFoto}: ${resultado.numero}\n\nAnotado en el sistema.`
      );
      console.log(`Confirmado TREC → ${driverName} | Carga #${numFoto}: ${resultado.numero}\n`);
    }

    // ── LA MESA ─────────────────────────────────────────────
    if (resultado.tipo === 'LAMESA') {
      const chofer = encontrarChoferLaMesa(driverRows, resultado.driver, userId);
      if (!chofer) {
        await bot.telegram.sendMessage(OWNER_CHAT_ID,
          `La Mesa: chofer "${resultado.driver}" no encontrado en sheet.\nBOL: ${resultado.bolId} | Tons: ${resultado.tons}`
        );
        return;
      }
      const { rowData, sheetRowIdx } = chofer;
      const driverName = (rowData[COL_DRIVER] || 'Driver').trim().split(' ')[0];
      const truck      = rowData[COL_TRUCK] || '-';
      const tripNum    = await anotarLaMesa(tabName, sheetRowIdx, rowData, resultado.bolId, resultado.tons);
      if (tripNum === null) {
        await ctx.reply(`BOL ${resultado.bolId} ya fue registrado.`);
        return;
      }
      await bot.telegram.sendMessage(OWNER_CHAT_ID,
        `La Mesa registrado\n\n${driverName}\nTruck: ${truck}\nViaje #${tripNum}\nBOL: ${resultado.bolId}\nTons: ${resultado.tons}`
      );
      console.log(`Confirmado La Mesa → ${driverName} | BOL ${resultado.bolId} / ${resultado.tons} tons\n`);
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
});

// ─── HEALTH CHECK (Render / UptimeRobot) ────────────────────
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
}).listen(PORT, () => console.log(`Health check en puerto ${PORT}`));

// ─── ARRANQUE ───────────────────────────────────────────────
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

async function iniciar() {
  await cargarDirectorio();
  bot.launch();
  console.log(`Bot Telegram listo. Grupos permitidos: ${TARGET_GROUP_IDS.join(', ') || '(ninguno aun — agrega GROUP_CHAT_IDS al .env)'}`);
}

iniciar().catch(err => {
  console.error('Error fatal al iniciar:', err.message);
  process.exit(1);
});
