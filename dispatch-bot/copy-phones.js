require('dotenv').config();
const { google } = require('googleapis');

const OLD_SHEET = '1gJDmCGvkgUhPMt8h5VbYNc40fT0S5ZEf3rXe6EQaadQ';
const NEW_SHEET = '1Dr0yEoQMm3d-iZjOy44HuHj_WzL0yU4BUxTiMeaGrgE';
const OLD_TAB   = '05.02';
const NEW_TAB   = '05.03';

async function run() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  // Leer hoja vieja
  const oldRes = await sheets.spreadsheets.values.get({
    spreadsheetId: OLD_SHEET,
    range: `${OLD_TAB}!A:E`,
  });
  const oldRows = oldRes.data.values || [];

  // Construir mapa nombre → teléfono
  const phoneMap = {};
  for (const row of oldRows) {
    const phone = (row[1] || '').trim();
    const name  = (row[2] || '').trim().toLowerCase();
    // Solo guardar si es número de teléfono válido (7-15 dígitos)
    if (name && /^\d{7,15}$/.test(phone)) phoneMap[name] = phone;
  }
  console.log('Teléfonos encontrados en hoja vieja:', phoneMap);

  // Leer hoja nueva
  const newRes = await sheets.spreadsheets.values.get({
    spreadsheetId: NEW_SHEET,
    range: `${NEW_TAB}!A:E`,
  });
  const newRows = newRes.data.values || [];

  // Hacer updates
  const updates = [];
  for (let i = 0; i < newRows.length; i++) {
    const name = (newRows[i][2] || '').trim().toLowerCase();
    if (!name) continue;
    // Match exacto o parcial (primer nombre)
    const firstName = name.split(' ')[0];
    const phone = phoneMap[name] || Object.entries(phoneMap).find(([k]) => k.startsWith(firstName))?.[1];
    if (phone) {
      updates.push({ range: `${NEW_TAB}!B${i + 1}`, values: [[phone]] });
      console.log(`Fila ${i+1}: ${name} → ${phone}`);
    } else {
      console.log(`Fila ${i+1}: ${name} → SIN TELÉFONO`);
    }
  }

  if (updates.length === 0) {
    console.log('No se encontraron matches.');
    return;
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: NEW_SHEET,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });

  console.log(`\nListo. ${updates.length} teléfonos copiados.`);
}

run().catch(console.error);
