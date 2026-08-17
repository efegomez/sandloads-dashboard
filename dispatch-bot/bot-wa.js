// ─────────────────────────────────────────────────────────────
//  bot-wa.js — WhatsApp Bot (Baileys) + Claude Vision + Google Sheets
// ─────────────────────────────────────────────────────────────

require('dotenv').config();
const cron = require('node-cron');
const http = require('http');
const {
  writeLog,
  getGoogleSheets,
  leerFilasHoy,
  anotarEnSheet,
  encontrarChoferPorNombre,
  extraerDatosImagen,
  copiarProgramacionManana,
  COL_DRIVER,
  COL_TRUCK,
  COL_RUTA,
} = require('./shared');

// ─── CONFIGURACIÓN ──────────────────────────────────────────
const SPREADSHEET_ID    = process.env.SPREADSHEET_ID;
const CHOFERES_SHEET_ID = process.env.CHOFERES_SHEET_ID || SPREADSHEET_ID;
const TARGET_GROUP_IDS  = (process.env.WA_GROUP_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const OWNER_WA_NUMBER   = process.env.OWNER_WA_NUMBER;
const OWNER_WA_LID      = process.env.OWNER_WA_LID;
const PORT              = process.env.PORT || 3000;
const DRY_RUN           = process.env.DRY_RUN === 'true';

const COL_WA_PHONE = 4;

// ─── LOGGING ────────────────────────────────────────────────
const _log   = console.log.bind(console);
const _error = console.error.bind(console);
console.log   = (...a) => { _log(...a);   writeLog('INFO',  a); };
console.error = (...a) => { _error(...a); writeLog('ERROR', a); };

// ─── DIRECTORIO WA ──────────────────────────────────────────
let WA_MAP        = {};
let NAME_TO_PHONE = {};

const pendingPhotos = {};

async function cargarDirectorioWA() {
  try {
    const sheets = await getGoogleSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: CHOFERES_SHEET_ID,
      range: 'Choferes!A2:E100',
    });
    const rows = res.data.values || [];
    WA_MAP        = {};
    NAME_TO_PHONE = {};
    for (const row of rows) {
      const nombre = (row[1] || '').trim();
      const phone  = (row[COL_WA_PHONE] || '').trim();
      if (phone && nombre) {
        WA_MAP[phone]                      = nombre.toLowerCase();
        NAME_TO_PHONE[nombre.toLowerCase()] = phone;
      }
    }
    console.log(`Directorio WA cargado: ${Object.keys(WA_MAP).length} choferes registrados.`);
  } catch (e) {
    console.error('Error cargando directorio WA:', e.message);
  }
}

// ─── HELPERS ────────────────────────────────────────────────
function phoneFromJid(jid) {
  return (jid || '').split('@')[0].split(':')[0];
}

let globalSock = null;

async function sendWAMessage(jid, text) {
  if (DRY_RUN) { console.log(`[DRY_RUN] NO enviado a ${jid}: ${text}`); return; }
  if (!globalSock) { console.error('[WA] Socket no disponible para enviar mensaje'); return; }
  await globalSock.sendMessage(jid, { text });
}

// Cola de notificaciones al owner — máximo 1 cada 2 segundos para evitar ráfagas
let _notifyQueue = Promise.resolve();
async function notificarOwner(text) {
  if (!OWNER_WA_LID && !OWNER_WA_NUMBER) {
    console.log('[OWNER]', text);
    return;
  }
  _notifyQueue = _notifyQueue.then(() => new Promise(resolve => {
    setTimeout(async () => {
      try {
        if (!globalSock) { console.error('[WA] Socket no disponible para notificar owner'); resolve(); return; }
        const ownerJidDestino = OWNER_WA_LID
          ? `${OWNER_WA_LID}@lid`
          : `${OWNER_WA_NUMBER}@s.whatsapp.net`;
        await globalSock.sendMessage(ownerJidDestino, { text });
      } catch (e) {
        console.error('[OWNER] Error enviando notificación:', e.message);
      }
      resolve();
    }, 2000);
  }));
  return _notifyQueue;
}

// ─── CRON NOCTURNO (10 PM Colombia) ─────────────────────────
cron.schedule('0 22 * * *', async () => {
  try {
    await copiarProgramacionManana(SPREADSHEET_ID, notificarOwner);
  } catch (err) {
    console.error('[CRON] Error en copia nocturna:', err.message);
    await notificarOwner(`Error en copia nocturna: ${err.message}`);
  }
}, { timezone: 'America/Bogota' });
console.log('Cron nocturno activo — copia programacion a las 10 PM (Bogota).');

// ─── PROCESAR FOTO CONOCIDA ──────────────────────────────
async function procesarFotoRegistrada(groupId, senderPhone, nombrePrincipal, resultado) {
  let driverRows, tabName;
  try {
    ({ driverRows, tabName } = await leerFilasHoy(SPREADSHEET_ID));
  } catch (e) {
    console.error(`Error leyendo sheet: ${e.message}`);
    await notificarOwner(`Error leyendo sheet del dia: ${e.message}`);
    return;
  }

  const chofer = encontrarChoferPorNombre(driverRows, nombrePrincipal);
  if (!chofer) {
    await notificarOwner(`${nombrePrincipal} registrado en WA pero no aparece en la programacion de hoy.`);
    return;
  }

  const { rowData, sheetRowIdx } = chofer;
  const driverName = (rowData[COL_DRIVER] || 'Driver').trim().split(' ')[0];
  const truck      = rowData[COL_TRUCK] || '-';
  const ruta       = rowData[COL_RUTA]  || '-';

  const numFoto = await anotarEnSheet(tabName, sheetRowIdx, rowData, resultado.numero, SPREADSHEET_ID);

  if (numFoto === null) {
    console.log(`Duplicado: ${driverName} ya tiene ${resultado.numero}`);
    await sendWAMessage(groupId, `Carga ${resultado.numero} ya fue registrada. Envia la captura correcta.`);
    return;
  }

  await sendWAMessage(groupId, `Listo ${driverName}. Carga ${resultado.numero} registrada.`);
  try {
    await notificarOwner(`Carga registrada\n\n${driverName}\nTruck: ${truck}\nRuta: ${ruta}\nCarga #${numFoto}: ${resultado.numero}`);
  } catch (ownerErr) {
    console.error(`No se pudo notificar al owner: ${ownerErr.message}`);
  }
  console.log(`Confirmado → ${driverName} | Carga #${numFoto}: ${resultado.numero}`);
}

// ─── PROCESAR FOTOS PENDIENTES TRAS REGISTRO ─────────────────
async function procesarFotosPendientes(phone) {
  const pending = pendingPhotos[phone] || [];
  delete pendingPhotos[phone];
  if (!pending.length) return;

  const nombrePrincipal = WA_MAP[phone];
  console.log(`Procesando ${pending.length} foto(s) pendiente(s) de ${nombrePrincipal}`);

  for (const { groupId, resultado } of pending) {
    try {
      await procesarFotoRegistrada(groupId, phone, nombrePrincipal, resultado);
    } catch (e) {
      console.error(`Error procesando foto pendiente de ${phone}:`, e.message);
      await notificarOwner(`Error procesando foto pendiente de +${phone}: ${e.message}`);
    }
  }
}

// ─── HANDLER: FOTO EN GRUPO ─────────────────────────────
async function procesarFoto(msg, groupId, downloadFn) {
  const senderJid   = msg.participant || msg.key.participant || msg.key.remoteJid;
  const senderPhone = phoneFromJid(senderJid);
  const nombreLog   = WA_MAP[senderPhone] || `wa_${senderPhone}`;
  console.log(`Imagen de ${nombreLog} en grupo ${groupId}`);

  const buffer    = await downloadFn(msg, 'buffer', {});
  const base64    = buffer.toString('base64');
  const resultado = await extraerDatosImagen(base64, 'image/jpeg');
  console.log(`Claude extrajo: tipo=${resultado.tipo} numero=${resultado.numero || ''}`);

  if (resultado.tipo === 'IGNORAR') {
    console.log(`Imagen ignorada (${nombreLog}): no es Newmile`);
    const quien = WA_MAP[senderPhone] || `+${senderPhone}`;
    await notificarOwner(`Imagen no-Newmile de ${quien}. No se registro automaticamente.`);
    return;
  }

  if (resultado.tipo === 'VIEJA') {
    console.log(`Captura vieja (${nombreLog}): fecha no corresponde a hoy`);
    await notificarOwner(`Captura vieja de ${nombreLog} (+${senderPhone}). No se registro.`);
    return;
  }

  const nombrePrincipal = WA_MAP[senderPhone];
  if (!nombrePrincipal) {
    if (!pendingPhotos[senderPhone]) pendingPhotos[senderPhone] = [];
    pendingPhotos[senderPhone].push({ groupId, resultado });
    await notificarOwner(
      `Foto de +${senderPhone} (sin registrar). Carga ${resultado.numero}.\nResponde:\nregistrar ${senderPhone} NombreExacto`
    );
    console.log(`Foto encolada de +${senderPhone} — pendiente de registro por owner.`);
    return;
  }

  await procesarFotoRegistrada(groupId, senderPhone, nombrePrincipal, resultado);
}

// ─── HANDLER: REGISTRO POR OWNER (mensaje privado) ────────────
async function procesarRegistroOwner(texto) {
  const partes = texto.replace(/^registrar\s+/i, '').trim().split(/\s+/);
  const phone  = partes[0];
  const nombre = partes.slice(1).join(' ').trim();

  if (!phone || !nombre) {
    await notificarOwner('Formato: registrar LID NombreExacto\nEjemplo: registrar 60083052494849 Juan Perez');
    return;
  }

  try {
    const sheets      = await getGoogleSheets();
    const res         = await sheets.spreadsheets.values.get({
      spreadsheetId: CHOFERES_SHEET_ID,
      range: 'Choferes!A2:E100',
    });
    const rows        = res.data.values || [];
    const normalizar = s => s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nombreNorm = normalizar(nombre);
    let rowIndex      = -1;
    let principal     = '';

    for (let i = 0; i < rows.length; i++) {
      if (normalizar(rows[i][1] || '') === nombreNorm) {
        rowIndex  = i + 2;
        principal = (rows[i][1] || '').trim();
        break;
      }
    }

    if (rowIndex === -1) {
      await notificarOwner(`No encontre "${nombre}" en la hoja Choferes. Verifica el nombre exacto.`);
      return;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: CHOFERES_SHEET_ID,
      range: `Choferes!E${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[phone]] },
    });

    WA_MAP[phone]                      = principal.toLowerCase();
    NAME_TO_PHONE[principal.toLowerCase()] = phone;
    NAME_TO_PHONE[nombre.toLowerCase()]    = phone;

    console.log(`Registrado WA (owner): ${nombre} → ${phone}`);
    await notificarOwner(`Registrado: ${nombre} (${phone})`);

    await procesarFotosPendientes(phone);
  } catch (e) {
    console.error('Error en registro owner:', e.message);
    await notificarOwner(`Error al registrar: ${e.message}`);
  }
}

// ─── INICIAR BOT ─────────────────────────────────────────────
async function iniciarBot() {
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadMediaMessage,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = await import('@whiskeysockets/baileys');

  await cargarDirectorioWA();

  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./auth_wa');

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
  });

  globalSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('Bot WA conectado.');
      if (!TARGET_GROUP_IDS.length) {
        console.log('[ADVERTENCIA] WA_GROUP_IDS vacio — procesando todos los grupos (modo debug).');
      }
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut  = statusCode === DisconnectReason.loggedOut;
      console.log(`Conexion cerrada. StatusCode: ${statusCode}. LoggedOut: ${loggedOut}`);
      if (loggedOut) {
        console.error('Sesion WA expirada (loggedOut). Fly.io reiniciara el proceso.');
        process.exit(1);
      } else {
        console.log('Desconexion temporal — reconectando en 3s...');
        setTimeout(iniciarBot, 3000);
      }
    }
  });

  const ownerJid = OWNER_WA_NUMBER ? `${OWNER_WA_NUMBER}@s.whatsapp.net` : null;
  const ownerLid = OWNER_WA_LID ? `${OWNER_WA_LID}@lid` : null;

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (!msg.message) continue;

        const remoteJid = msg.key.remoteJid || '';
        const texto = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text || ''
        ).trim();

        if (!remoteJid.endsWith('@g.us')) {
          console.log(`[MSG] remoteJid=${remoteJid} fromMe=${msg.key.fromMe} texto="${texto.slice(0,40)}"`);
        }

        // Filtro de mensajes viejos — ignorar si tiene más de 5 minutos (evita ráfagas al reconectar)
        const msgAge = Math.floor(Date.now() / 1000) - (msg.messageTimestamp || 0);
        if (msgAge > 300) {
          console.log(`[STALE] Mensaje ignorado (${msgAge}s antiguo)`);
          continue;
        }

        // Comandos del owner — se procesan aunque fromMe=true
        const isOwner = (ownerJid && remoteJid === ownerJid) || (ownerLid && remoteJid === ownerLid);
        if (isOwner) {
          if (/^registrar\s+\S+\s+\S/i.test(texto)) {
            await procesarRegistroOwner(texto);
          } else if (/^recargar$/i.test(texto)) {
            await cargarDirectorioWA();
            await notificarOwner(`Directorio recargado: ${Object.keys(WA_MAP).length} choferes registrados.`);
          }
          continue;
        }

        if (msg.key.fromMe) continue;

        if (!remoteJid.endsWith('@g.us')) continue;

        if (TARGET_GROUP_IDS.length && !TARGET_GROUP_IDS.includes(remoteJid)) {
          console.log(`[GRUPO NO PERMITIDO] ${remoteJid}`);
          continue;
        }

        const msgType = Object.keys(msg.message)[0];

        if (msgType === 'imageMessage') {
          await procesarFoto(msg, remoteJid, downloadMediaMessage);
        }

      } catch (err) {
        console.error('Error procesando mensaje WA:', err.message);
      }
    }
  });
}

// ─── HEALTH CHECK ────────────────────────────────────────────
const healthServer = http.createServer((req, res) => {
  if (req.method === 'GET') { res.writeHead(200); res.end('OK'); return; }
  res.writeHead(404); res.end('Not found');
});
healthServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') { console.error(`Puerto ${PORT} en uso.`); return; }
  console.error(`Error health check: ${err.message}`);
});
healthServer.listen(PORT, () => console.log(`Health check en puerto ${PORT}`));

// ─── ARRANQUE ────────────────────────────────────────────────
process.once('SIGINT',  () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));

iniciarBot().catch(err => {
  console.error('Error fatal al iniciar bot WA:', err.message || err);
  process.exit(1);
});
