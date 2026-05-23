require('dotenv').config();
const { google } = require('googleapis');

const SPREADSHEET_ID  = process.env.SPREADSHEET_ID;
const SHEET_ID_2026   = '1FlPvLr6eHExUb14CqPtPTUQmlHgUokIjLHFsidWzk-Y';
const GOOGLE_CREDS    = process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json';

function getTodayKey() {
  const d = new Date();
  return String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}

async function run() {
  const TAB = process.argv[2] || getTodayKey();
  console.log(`Copiando pestaña ${TAB} de Sandloads 2026 → TEST...`);

  const auth = process.env.GOOGLE_CREDENTIALS_JSON
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
    : new google.auth.GoogleAuth({
        keyFile: GOOGLE_CREDS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  const srcMeta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID_2026 });
  const srcSheet = (srcMeta.data.sheets || []).find(s => s.properties.title === TAB);
  if (!srcSheet) { console.error(`Tab ${TAB} no existe en Sandloads 2026`); process.exit(1); }

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = (meta.data.sheets || []).find(s => s.properties.title === TAB);
  if (existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ deleteSheet: { sheetId: existing.properties.sheetId } }] },
    });
    console.log(`Tab ${TAB} existente eliminado de TEST.`);
  }

  const copyRes = await sheets.spreadsheets.sheets.copyTo({
    spreadsheetId: SHEET_ID_2026,
    sheetId: srcSheet.properties.sheetId,
    requestBody: { destinationSpreadsheetId: SPREADSHEET_ID },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: copyRes.data.sheetId, title: TAB, index: 0 },
          fields: 'title,index',
        },
      }],
    },
  });

  console.log(`Tab ${TAB} copiado a TEST correctamente.`);
}

run().catch(e => { console.error(e.message); process.exit(1); });
