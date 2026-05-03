// ─────────────────────────────────────────────────────────────
//  Dispatch Bot — WhatsApp + Gemini Vision + Google Sheets
//  Flujo: imagen Newmile → extrae número → anota en Sheet → confirma al chofer
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Anthropic = require('@anthropic-ai/sdk');
const { google } = require('googleapis');

// ─── CONFIGURACIÓN ───────────────────────────────────────────

const SPREADSHEET_ID  = process.env.SPREADSHEET_ID;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const GOOGLE_CREDS    = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const TARGET_GROUPS   = (process.env.GROUP_NAMES || 'Test').split(',').map(g => g.trim());
const OWNER_PHONE     = `${process.env.OWNER_PHONE}@c.us`;

// Columnas (índice 0-based)
const COL_CELULAR     = 1;  // B — teléfono del chofer
const COL_DRIVER      = 2;  // C — nombre
const COL_TRUCK       = 3;  // D — truck #
const COL_RUTA        = 4;  // E — ruta
const COL_PHOTO_FIRST = 8;  // I — primera columna de números de carga

// Co-drivers: su celular → nombre del chofer principal (en minúsculas)
const CODRIVER_MAP = {
  '3527417745': 'felix milanes',
  '8324210261': 'leandro cuza',
};

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

  // Si es co-driver, buscar por nombre del chofer principal
  const principalNombre = CODRIVER_MAP[cel];
  if (principalNombre) {
    console.log(`Co-driver ${cel} → buscando principal: ${principalNombre}`);
    return driverRows.find(r => (r.rowData[COL_DRIVER] || '').trim().toLowerCase() === principalNombre) || null;
  }

  return driverRows.find(r => r.rowData[COL_CELULAR] && norm(r.rowData[COL_CELULAR]) === cel) || null;
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
          text: `Esta es una imagen enviada por un chofer de carga de arena usando la app Newmile.

PRIMERO verifica si es un TICKET o una SOLICITUD DE CARGA:
- Si la imagen contiene cualquiera de estas señales, es un TICKET — responde: NO_ENCONTRADO
  • Palabra "Windstar"
  • Palabra "Damp SandCo" o "SandCo, LLC"
  • Código QR
  • Información de toneladas (tons, toneladas, net tons, gross tons)

- Si la imagen es una solicitud de carga limpia (sin lo anterior), extrae el número de carga.

El número de carga tiene EXACTAMENTE 7 dígitos (ej: 1614193, 1636420).
Responde SOLO con el número de 7 dígitos, sin texto adicional.
Si no es solicitud de carga o no encuentras número de 7 dígitos, responde exactamente: NO_ENCONTRADO`,
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

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'dispatch-bot',
    dataPath: 'C:\\Users\\efego\\AppData\\Local\\dispatch-bot',
  }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

client.on('qr', (qr) => {
  console.log('\nEscanea este QR con WhatsApp Business → Dispositivos vinculados:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log(`Bot Dispatch listo. Escuchando grupos: ${TARGET_GROUPS.map(g => `"${g}"`).join(', ')}\n`);
});

client.on('message', async (msg) => {
  try {
    const isGroup = msg.from.endsWith('@g.us');
    if (!isGroup || !msg.hasMedia || msg.type !== 'image') return;

    const chat = await msg.getChat();
    if (!TARGET_GROUPS.some(g => chat.name.includes(g))) return;

    const remitente = msg.author || msg.from;
    console.log(`Imagen de ${remitente} en "${chat.name}"`);

    // 1. Descargar imagen
    const media = await msg.downloadMedia();
    if (!media) { console.log('No se pudo descargar la imagen'); return; }

    // 2. Extraer número con Claude
    const numeroCarga = await extraerNumeroCarga(media.data, media.mimetype);

    if (numeroCarga === 'NO_ENCONTRADO') {
      await client.sendMessage(OWNER_PHONE,'No encontré un número de carga en esa imagen. Verifica que sea la captura correcta de Newmile.');
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

    // 4. Buscar chofer — usa id.user que da el teléfono real incluso en @lid
    let celular;
    try {
      const contact = await msg.getContact();
      celular = contact.id.user || contact.number || remitente.replace(/\D/g, '');
    } catch {
      celular = remitente.replace(/\D/g, '');
    }
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
      await client.sendMessage(OWNER_PHONE, `*Duplicado ignorado*\n*${driverName}* — carga *${numeroCarga}* ya estaba registrada.`);
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

// Shutdown limpio al Ctrl+C
process.on('SIGINT', async () => {
  console.log('\nCerrando bot...');
  try { await client.destroy(); } catch {}
  process.exit(0);
});

console.log('Iniciando cliente...');
client.initialize();
