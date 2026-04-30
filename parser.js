// ─────────────────────────────────────────────
//  PARSER — Lee el Google Sheet y extrae datos
// ─────────────────────────────────────────────

const STATUSES = ["ACTIVO", "STAGE", "DONE", "ROTO", "STANDBY"];

// Mapeo de hora de ruta a número de hora
const ROUTE_HOURS = {
  "12am": 0, "1am": 1, "2am": 2, "3am": 3, "4am": 4, "5am": 5,
  "6am": 6,  "7am": 7, "8am": 8, "9am": 9, "10am": 10, "11am": 11,
  "12pm": 12, "1pm": 13, "2pm": 14, "3pm": 15, "4pm": 16, "5pm": 17,
  "6pm": 18,  "7pm": 19, "8pm": 20, "9pm": 21, "10pm": 22, "11pm": 23,
  "1 pm": 13, "2 pm": 14, "3 pm": 15, "4 pm": 16,
  "noon": 12, "midnight": 0
};

function parseRouteHour(ruta) {
  if (!ruta) return 6;
  const lower = ruta.toLowerCase();
  for (const [key, val] of Object.entries(ROUTE_HOURS)) {
    if (lower.includes(key)) return val;
  }
  return 6;
}

function getTodayString() {
  const now = new Date();
  const tz = CONFIG.TIMEZONE || "America/New_York";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, month: "2-digit", day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const month = parts.find(p => p.type === "month").value;
  const day   = parts.find(p => p.type === "day").value;
  return `${month}.${day}`;  // "04.30"
}

function getSheetName() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return CONFIG.SHEET_NAMES[month] || "Abril";
}

async function fetchSheetData() {
  const sheetName = getSheetName();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${CONFIG.GOOGLE_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.values || [];
}

function findTodayBlock(rows) {
  const today = getTodayString(); // "04.30"
  let startIdx = -1;
  let endIdx = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const cell = (rows[i][0] || "").toString().trim();
    // Headers like "04.30" or "# 04.30" or just date pattern
    if (cell.replace(/^#\s*/, "").trim() === today) {
      startIdx = i + 1;
    } else if (startIdx > -1 && /^\d{2}\.\d{2}$/.test(cell.replace(/^#\s*/, "").trim())) {
      endIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;
  return rows.slice(startIdx, endIdx);
}

function parseDriverRows(block) {
  if (!block || block.length === 0) return [];

  // Find header row: contains "Driver name" or "Chofer"
  let headerIdx = block.findIndex(r =>
    r.some(c => /driver\s*name|chofer/i.test(c || ""))
  );

  let dataRows;
  let colMap = {};

  if (headerIdx >= 0) {
    const header = block[headerIdx].map(c => (c || "").toLowerCase().trim());
    const findCol = (...keys) => {
      for (const k of keys) {
        const idx = header.findIndex(h => h.includes(k));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    colMap = {
      driver: findCol("driver", "chofer", "name"),
      truck:  findCol("truck", "camion", "#"),
      ruta:   findCol("ruta", "route"),
      qty:    findCol("qty", "total", "asign"),
      status: findCol("status", "estado"),
      photo:  findCol("photo", "foto"),
    };
    dataRows = block.slice(headerIdx + 1);
  } else {
    // No header — try to infer: Driver name,Truck #,RUTA,Qty,STATUS,PHOTO,loads...
    colMap = { driver: 0, truck: 1, ruta: 2, qty: 3, status: 4, photo: 5 };
    dataRows = block;
  }

  const drivers = [];

  for (const row of dataRows) {
    if (!row || row.length === 0) continue;

    // Skip rows that look like company/owner info (no truck number column or status)
    const rawDriver = (row[colMap.driver] || "").trim();
    const rawStatus = (row[colMap.status] || "").trim().toUpperCase();
    const rawTruck  = (row[colMap.truck]  || "").toString().trim();
    const rawRuta   = (row[colMap.ruta]   || "").trim();
    const rawQty    = parseInt(row[colMap.qty] || "5") || 5;

    if (!rawDriver) continue;
    // Skip if it looks like a company/owner row (no truck or no recognizable status)
    if (!rawTruck && !STATUSES.includes(rawStatus)) continue;
    // Skip summary / reference rows (e.g. "HVC Trucking LLC, HVC, Yanquiel...")
    if (!rawRuta && !STATUSES.includes(rawStatus)) continue;

    // Count completed loads: columns after "photo" that have load IDs
    const photoCol = colMap.photo >= 0 ? colMap.photo : 5;
    const loadCols = row.slice(photoCol + 1).filter(c => {
      const s = (c || "").toString().trim();
      return s.length > 0 && /^\d+$/.test(s);
    });
    const completedLoads = loadCols.length;

    // Detect notes: any non-empty cell before driver name column
    const noteCell = colMap.driver > 0 ? (row[0] || "").trim() : "";
    const note = noteCell && !STATUSES.includes(noteCell.toUpperCase()) ? noteCell : "";

    // Status override: if all loads done, mark DONE
    let status = rawStatus || "ACTIVO";
    if (completedLoads >= rawQty && rawQty > 0) status = "DONE";

    drivers.push({
      name:      rawDriver,
      truck:     rawTruck,
      ruta:      rawRuta,
      qty:       rawQty,
      done:      completedLoads,
      status:    status,
      startHour: parseRouteHour(rawRuta),
      note:      note,
    });
  }

  // Sort by start hour, preserve original order on tie
  drivers.sort((a, b) => a.startHour - b.startHour);

  return drivers;
}

async function loadDriverData() {
  const rows = await fetchSheetData();
  const block = findTodayBlock(rows);
  if (!block) return null; // No data for today
  return parseDriverRows(block);
}
