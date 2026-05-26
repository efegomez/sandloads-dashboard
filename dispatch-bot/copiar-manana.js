require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_ID_2026  = '1FlPvLr6eHExUb14CqPtPTUQmlHgUokIjLHFsidWzk-Y';
const GOOGLE_CREDS   = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';
const COL_DRIVER     = 2;

async function getSheets() {
  const auth = process.env.GOOGLE_CREDENTIALS_JSON
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
    : new google.auth.GoogleAuth({
        keyFile: GOOGLE_CREDS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
  return google.sheets({ version: 'v4', auth: await auth.getClient() });
}

function getTomorrowKey() {
  const bogota = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  bogota.setDate(bogota.getDate() + 1);
  return String(bogota.getMonth() + 1).padStart(2, '0') + '.' + String(bogota.getDate()).padStart(2, '0');
}

async function run() {
  const tabName = getTomorrowKey();
  console.log(`Copiando pestana ${tabName} de Sandloads 2026 → TEST...`);
  const sheets = await getSheets();

  let sourceValues;
  try {
    const src = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID_2026,
      range: `'${tabName}'!A:W`,
    });
    sourceValues = src.data.values;
  } catch (e) {
    console.error(`Tab ${tabName} no existe en Sandloads 2026: ${e.message}`);
    process.exit(1);
  }

  if (!sourceValues || sourceValues.length === 0) {
    console.error(`Tab ${tabName} vacio en Sandloads 2026.`);
    process.exit(1);
  }

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = (meta.data.sheets || []).find(s => s.properties.title === tabName);
  if (existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ deleteSheet: { sheetId: existing.properties.sheetId } }] },
    });
    console.log(`Tab ${tabName} existente eliminado.`);
  }

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
  console.log(`Listo. ${tabName} copiado con ${choferes} choferes.`);
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
