// ─────────────────────────────────────────────────────────────
//  Dispatch Bot — WhatsApp + Gemini Vision + Google Sheets
//  Flujo: imagen Newmile → extrae número → anota en Sheet → confirma al chofer
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');
const cron       = require('node-cron');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');

// ─── LOGGING A ARCHIVO ───────────────────────────────────────
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

// ─── CONFIGURACIÓN ───────────────────────────────────────────

const SPREADSHEET_ID  = process.env.SPREADSHEET_ID;           // Sandloads TEST
const SHEET_ID_2026   = '1FlPvLr6eHExUb14CqPtPTUQmlHgUokIjLHFsidWzk-Y'; // Sandloads 2026
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const GOOGLE_CREDS    = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const TARGET_GROUPS   = (process.env.GROUP_NAMES || 'Test').split(',').map(g => g.trim());
const OWNER_PHONE     = `${process.env.OWNER_PHONE}@c.us`;

// Columnas del tab diario (índice 0-based)
const COL_DRIVER      = 2;  // C — nombre
const COL_TRUCK       = 3;  // D — truck #
const COL_RUTA        = 4;  // E — ruta
const COL_PHOTO_FIRST = 8;  // I — primera columna de números de carga

// Cache del directorio de choferes (se carga al arrancar)
let PHONE_MAP = {};  // telefono(últimos 10) → nombre del chofer principal en el sheet

async function cargarDirectorio() {
  try {
    const sheets = await getGoogleSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Choferes!A2:C100',
    });
    const rows = res.data.values || [];
    const norm = (n) => String(n).replace(/\D/g, '').slice(-10);
    PHONE_MAP = {};
    for (const row of rows) {
      const nombre    = (row[0] || '').trim();
      const telefono  = (row[1] || '').trim();
      const principal = (row[2] || '').trim() || nombre;
      if (telefono && nombre) PHONE_MAP[norm(telefono)] = principal.toLowerCase();
    }
    console.log(`Directorio cargado: ${Object.keys(PHONE_MAP).length} teléfonos.`);
  } catch (e) {
    console.error('Error cargando directorio:', e.message);
  }
}

function getTodayKey() {
  const now = new Date();
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const dd  = String(now.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}

// ─── GOOGLE SHEETS ────────────────────────────────────────────

async function getGoogleSheets() {
  const auth = new google.auth.GoogleAuth({
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

function encontrarChofer(driverRows, celular) {
  const norm = (n) => String(n).replace(/\D/g, '').slice(-10);
  const cel  = norm(celular);

  // Buscar nombre del chofer (o principal si es co-driver) en el directorio
  const nombrePrincipal = PHONE_MAP[cel];
  if (!nombrePrincipal) return null;

  console.log(`Teléfono ${cel} → chofer: ${nombrePrincipal}`);
  return driverRows.find(r => (r.rowData[COL_DRIVER] || '').trim().toLowerCase() === nombrePrincipal) || null;
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

async function anotarEnSheet(tabName, sheetRowIdx, rowData, numeroCarga) {
  const sheets = await getGoogleSheets();

  // Verificar duplicado en la fila del chofer
  const existentes = rowData.slice(COL_PHOTO_FIRST).map(v => (v || '').trim());
  if (existentes.includes(numeroCarga)) {
    console.log(`Duplicado detectado: ${numeroCarga} ya existe en fila ${sheetRowIdx + 1}`);
    return null; // señal de duplicado
  }

  let colIdx = COL_PHOTO_FIRST;
  while (colIdx < rowData.length && (rowData[colIdx] || '').trim() !== '') {
    colIdx++;
  }

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

// ─── CLAUDE VISION — EXTRAE NÚMERO DE CARGA ──────────────────

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

async function extraerNumeroCarga(imagenBase64, mimeType) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: imagenBase64 },
        },
        {
          type: 'text',
          text: `Esta es una imagen enviada por un chofer de carga de arena.

PRIMERO determina el tipo de imagen:

TIPO A — TICKET (ignorar). Señales: código QR, toneladas (tons/net tons/gross tons), texto "Damp SandCo" o "SandCo, LLC".
→ Si es TICKET: responde NO_ENCONTRADO

TIPO B — SOLICITUD NEWMILE (pantalla de la app con una sola asignación de carga).
→ Extrae el único número de 7 dígitos visible.

TIPO C — CHAT NEWMILE (conversación de la app con múltiples mensajes).
Señales: texto "Se te ha asignado una carga de X a Y", botones "Aceptar Carga", "Descargado", "¿Qué te gustaría hacer?".
→ Pueden aparecer varios números de 7 dígitos. Extrae SOLO el número de la carga NUEVA aceptada: el que aparece DESPUÉS de "Aceptar Carga" o en el mensaje de confirmación "Te estamos dirigiendo a la cargadero".
→ Ignora los números de cargas anteriores ya completadas.

El número de carga tiene EXACTAMENTE 7 dígitos (ej: 1614193, 1638661).
Responde SOLO con el número de 7 dígitos, sin texto adicional.
Si no puedes identificar el número correcto: responde NO_ENCONTRADO`,
        },
      ],
    }],
  });

  const texto = response.content[0].text.trim();
  console.log(`Claude extrajo: "${texto}"`);
  // Validar que sea exactamente 7 dígitos
  if (!/^\d{7}$/.test(texto)) return 'NO_ENCONTRADO';
  return texto;
}

// ─── WHATSAPP CLIENT ──────────────────────────────────────────

function makeClient() {
  return new Client({
    authStrategy: new LocalAuth({
      clientId: 'dispatch-bot',
      dataPath: 'C:\\Users\\efego\\AppData\\Local\\dispatch-bot-v2',
    }),
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1023950842-alpha.html',
    },
    puppeteer: {
      headless: true,
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--no-first-run',
        '--no-zygote',
      ],
    },
  });
}

let client = makeClient();

// ─── EMAIL DE ALERTA ─────────────────────────────────────────
const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

async function sendAlert(asunto, detalle) {
  // ALERTAS SUSPENDIDAS — reactivar quitando este return
  console.warn(`[ALERTA SUSPENDIDA] ${asunto}: ${detalle}`);
  return;
  const ts = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  try {
    await mailer.sendMail({
      from: `"Dispatch Bot" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `🚨 Bot Dispatch — ${asunto}`,
      text: `${asunto}\n\nHora: ${ts}\nDetalle: ${detalle}\n\nReinicia el bot: npm run restart`,
    });
    console.log(`Alerta enviada: ${asunto}`);
  } catch (e) {
    console.error('Error enviando alerta:', e.message);
  }
}

client.on('qr', (qr) => {
  console.log('\nEscanea este QR con WhatsApp Business → Dispositivos vinculados:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  await cargarDirectorio();
  console.log(`Bot Dispatch listo. Escuchando grupos: ${TARGET_GROUPS.map(g => `"${g}"`).join(', ')}\n`);
});

client.on('disconnected', async (reason) => {
  console.error(`Bot desconectado: ${reason}`);
  await sendAlert('Bot desconectado de WhatsApp', reason);
});

client.on('auth_failure', async (msg) => {
  console.error(`Fallo de autenticación: ${msg}`);
  await sendAlert('Fallo de autenticación WhatsApp', msg);
});

client.on('message_create', async (msg) => {
  console.log(`[RAW] fromMe=${msg.fromMe} from=${msg.from} type=${msg.type} hasMedia=${msg.hasMedia}`);
  if (msg.fromMe) return;
  try {
    const chat = await msg.getChat();
    console.log(`[DEBUG] msg from=${msg.from} group=${chat.name} hasMedia=${msg.hasMedia}`);
    const isGroup = msg.from.endsWith('@g.us');
    if (!isGroup || !msg.hasMedia || msg.type !== 'image') return;

    if (!TARGET_GROUPS.some(g => chat.name.includes(g))) return;

    const remitente = msg.author || msg.from;

    // Resolver teléfono real antes de loguear (evita @lid ilegibles)
    let celular;
    try {
      const contact = await msg.getContact();
      celular = contact.id.user || contact.number || remitente.replace(/\D/g, '');
    } catch {
      celular = remitente.replace(/\D/g, '');
    }
    const normPhone = (n) => String(n).replace(/\D/g, '').slice(-10);
    const nombreLog = PHONE_MAP[normPhone(celular)] || celular;
    console.log(`Imagen de ${nombreLog} en "${chat.name}"`);

    // 1. Descargar imagen
    const media = await msg.downloadMedia();
    if (!media) { console.log('No se pudo descargar la imagen'); return; }

    // 2. Extraer número con Claude
    const numeroCarga = await extraerNumeroCarga(media.data, media.mimetype);

    if (numeroCarga === 'NO_ENCONTRADO') {
      console.log(`Imagen ignorada (${nombreLog}): ticket o no-Newmile`);
      return;
    }

    // 3. Leer bloque de hoy del sheet
    let driverRows, tabName;
    try {
      ({ driverRows, tabName } = await leerFilasHoy());
    } catch (e) {
      console.log(`Error leyendo sheet: ${e.message}`);
      await client.sendMessage(OWNER_PHONE,`No pude leer la hoja "${getTodayKey()}". Verifica que exista.`);
      return;
    }

    // 4. Buscar chofer (celular ya resuelto arriba)
    const chofer  = encontrarChofer(driverRows, celular);

    if (!chofer) {
      await client.sendMessage(OWNER_PHONE,`Tu número (${celular}) no está en el sistema de hoy. Habla con tu despachador.`);
      return;
    }

    const { rowData, sheetRowIdx } = chofer;
    const driverName = (rowData[COL_DRIVER] || 'Driver').trim().split(' ')[0];
    const truck      = rowData[COL_TRUCK]  || '-';
    const ruta       = rowData[COL_RUTA]   || '-';

    // 5. Anotar en sheet
    const numFoto = await anotarEnSheet(tabName, sheetRowIdx, rowData, numeroCarga);

    // 6. Notificar al owner
    if (numFoto === null) {
      console.log(`Duplicado ignorado: ${driverName} ya tiene ${numeroCarga}`);
      await msg.reply(`Carga *${numeroCarga}* ya fue registrada. Envía la captura correcta.`);
      return;
    }

    await client.sendMessage(
      OWNER_PHONE,
      `*Carga registrada*\n\n` +
      `*${driverName}*\n` +
      `Truck: *${truck}*\n` +
      `Ruta: *${ruta}*\n` +
      `Carga #${numFoto}: *${numeroCarga}*\n\n` +
      `Anotado en el sistema.`
    );

    console.log(`Confirmado → ${driverName} | Carga #${numFoto}: ${numeroCarga}\n`);

  } catch (err) {
    console.error('Error:', err.message);
  }
});

// ─── COPIA NOCTURNA: Sandloads 2026 → TEST (10 PM) ───────────

function getTomorrowKey() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}

async function copiarProgramacionManana() {
  const tabName = getTomorrowKey();
  console.log(`[CRON] Copiando programación ${tabName} de 2026 → TEST...`);
  try {
    const sheets = await getGoogleSheets();

    // 1. Leer tab de mañana en Sandloads 2026
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
      await client.sendMessage(OWNER_PHONE,
        `⚠️ *Copia nocturna fallida*\n\nNo existe la pestaña *${tabName}* en Sandloads 2026.\nCrea la programación antes de las 10 PM.`
      );
      return;
    }

    // 2. Eliminar tab existente en TEST si hay
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const existing = (meta.data.sheets || []).find(s => s.properties.title === tabName);
    if (existing) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: [{ deleteSheet: { sheetId: existing.properties.sheetId } }] },
      });
    }

    // 3. Crear tab nuevo en TEST y escribir datos
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName, index: 0 } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${tabName}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: sourceValues },
    });

    const choferes = sourceValues.slice(2).filter(r => (r[COL_DRIVER] || '').trim()).length;
    console.log(`[CRON] ✓ ${tabName} copiado — ${choferes} choferes`);
    await client.sendMessage(OWNER_PHONE,
      `✅ *Programación ${tabName} lista*\n\n${choferes} choferes copiados a Sandloads TEST.`
    );
  } catch (err) {
    console.error('[CRON] Error en copia nocturna:', err.message);
    await client.sendMessage(OWNER_PHONE, `❌ Error en copia nocturna ${tabName}: ${err.message}`);
  }
}

// 10 PM hora Colombia
cron.schedule('0 22 * * *', copiarProgramacionManana, { timezone: 'America/Bogota' });
console.log('Cron nocturno activo — copia programación a las 10 PM (Bogotá).');

// Shutdown limpio al Ctrl+C
process.on('SIGINT', async () => {
  console.log('\nCerrando bot...');
  try { await client.destroy(); } catch {}
  process.exit(0);
});

// Timeout de arranque — si no conecta en 90s, sale para reiniciar limpio
const startupTimer = setTimeout(() => {
  console.error('TIMEOUT: No conectó en 90s. Corre npm run restart.');
  process.exit(1);
}, 90000);
client.once('ready', () => clearTimeout(startupTimer));
client.once('qr',   () => clearTimeout(startupTimer));

async function iniciar(intento = 1) {
  console.log(`Iniciando cliente... (intento ${intento})`);
  try {
    await client.initialize();
  } catch (err) {
    console.error(`Error al iniciar (intento ${intento}): ${err.message}`);
    if (intento < 5) {
      const delay = intento * 5000;
      console.log(`Reintentando en ${delay / 1000}s...`);
      try { await client.destroy(); } catch (_) {}
      setTimeout(() => {
        client = makeClient();
        iniciar(intento + 1);
      }, delay);
    } else {
      console.error('5 intentos fallidos. Saliendo.');
      process.exit(1);
    }
  }
}

iniciar();
