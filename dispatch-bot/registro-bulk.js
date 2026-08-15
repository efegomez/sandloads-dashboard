// registro-bulk.js — Registro masivo de teléfonos WA en hoja Choferes
// Uso: node /app/registro-bulk.js
require('dotenv').config();
const { google } = require('googleapis');

const CHOFERES_SHEET_ID = process.env.CHOFERES_SHEET_ID || process.env.SPREADSHEET_ID;

const DRIVERS = [
  { nombre: 'Abel Querol',          phone: '7868039907' },
  { nombre: 'Alejandro Rodriguez',  phone: '7864705400' },
  { nombre: 'Alexei Ruiz',          phone: '4326642168' },
  { nombre: 'Antonio Silverio',     phone: '7868182488' },
  { nombre: 'Aristides Araujo',     phone: '7868571274' },
  { nombre: 'Arley Castañeda',      phone: '4322028417' },
  { nombre: 'Bryan Rodriguez',      phone: '3055131243' },
  { nombre: 'Dannier Vasquez',      phone: '7868560049' },
  { nombre: 'Denis Gonzalez',       phone: '8324723301' },
  { nombre: 'Dusnie Oliva',         phone: '4322362640' },
  { nombre: 'Eddy del Sol',         phone: '4322571216' },
  { nombre: 'Ernesto Bacallao',     phone: '7866765279' },
  { nombre: 'Frank Almaguer',       phone: '7867603833' },
  { nombre: 'Hayle Cardenas',       phone: '4324449713' },
  { nombre: 'Jesus Pena Valdes',    phone: '4322154097' },
  { nombre: 'Jorge Barcenas',       phone: '4074357224' },
  { nombre: 'Jorge Santiesteban',   phone: '4322824190' },
  { nombre: 'Jose Parajo',          phone: '4324441459' },
  { nombre: 'Juan Damera',          phone: '7867587079' },
  { nombre: 'Juan Guardiola',       phone: '9569626138' },
  { nombre: 'Juan Miguel',          phone: '7867024889' },
  { nombre: 'Juan Ramos',           phone: '7043523726' },
  { nombre: 'Julio Martinez',       phone: '4327039472' },
  { nombre: 'Lazaro Ayala',         phone: '4324441685' },
  { nombre: 'Leandro Cuza',         phone: '5125541682' },
  { nombre: 'Livan Odesa',          phone: '8063179228' },
  { nombre: 'Maikel Crespo',        phone: '4326386294' },
  { nombre: 'Manuel Morell',        phone: '7867974447' },
  { nombre: 'Miguel Pena',          phone: '4329677060' },
  { nombre: 'Nelson Oreste Roig',   phone: '8134685581' },
  { nombre: 'Oscar Vargas',         phone: '4322324061' },
  { nombre: 'Pedro Ponce',          phone: '7863597021' },
  { nombre: 'Raciel querol',        phone: '4328034175' },
  { nombre: 'Rafael Dieguez',       phone: '4329007904' },
  { nombre: 'Raunel Artiles',       phone: '3054900148' },
  { nombre: 'Yanquiel Gomez',       phone: '4322509201' },
  { nombre: 'Yasiel Barrio',        phone: '6054641046' },
  { nombre: 'Yasmani Armas',        phone: '7868460127' },
  { nombre: 'Yasmani Rodriguez',    phone: '5022941239' },
  { nombre: 'Yasniel Pineiro',      phone: '4323122990' },
  { nombre: 'Yoandry Fuentes',      phone: '8324210261' },
  { nombre: 'Yodeyby Barbuzano',    phone: '4328897099' },
  { nombre: 'Yomnier Regojo',       phone: '7863980377' },
  { nombre: 'Yordis Sanchez',       phone: '6203909266' },
  { nombre: 'Yosvani Diaz',         phone: '7864846295' },
  { nombre: 'Yuniel Silverio',      phone: '7864434356' },
];

async function getGoogleSheets() {
  const auth = process.env.GOOGLE_CREDENTIALS_JSON
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
    : new google.auth.GoogleAuth({
        keyFile: './credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function main() {
  console.log(`Conectando a hoja Choferes (${CHOFERES_SHEET_ID})...`);
  const sheets = await getGoogleSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: CHOFERES_SHEET_ID,
    range: 'Choferes!A2:E100',
  });
  const rows = res.data.values || [];
  console.log(`${rows.length} filas leídas.\n`);

  let ok = 0;
  const noEncontrados = [];

  for (const driver of DRIVERS) {
    const nameLower = driver.nombre.toLowerCase().trim();
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i][0] || '').toLowerCase().trim() === nameLower) {
        rowIndex = i + 2;
        break;
      }
    }
    if (rowIndex === -1) {
      noEncontrados.push(driver.nombre);
      continue;
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId: CHOFERES_SHEET_ID,
      range: `Choferes!E${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[driver.phone]] },
    });
    console.log(`OK: ${driver.nombre} -> ${driver.phone}`);
    ok++;
  }

  console.log(`\n=== Resultado: ${ok}/${DRIVERS.length} registrados ===`);
  if (noEncontrados.length) {
    console.log(`\nNO ENCONTRADOS (${noEncontrados.length}) - verifica el nombre en la hoja:`);
    noEncontrados.forEach(n => console.log(`  - ${n}`));
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
