const STATUSES = ["ACTIVO", "STAGE", "DONE", "ROTO", "STANDBY"];

function parseRouteHour(ruta) {
  if (!ruta) return 6;
  const lower = ruta.toLowerCase();
  const map = {
    "12am": 0, "1am": 1, "2am": 2, "3am": 3, "4am": 4, "5am": 5,
    "6am": 6, "7am": 7, "8am": 8, "9am": 9, "10am": 10, "11am": 11,
    "12pm": 12, "1pm": 13, "2pm": 14, "3pm": 15, "4pm": 16, "5pm": 17,
    "6pm": 18, "7pm": 19, "1 pm": 13, "2 pm": 14, "3 pm": 15
  };
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) return val;
  }
  return 6;
}

function getTodayTabName() {
  const tz = CONFIG.TIMEZONE || "America/New_York";
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, month: "2-digit", day: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const month = parts.find(p => p.type === "month").value;
  const day   = parts.find(p => p.type === "day").value;
  return `${month}.${day}`;
}

async function fetchSheetData() {
  const tab = getTodayTabName();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}/values/${encodeURIComponent(tab)}?key=${CONFIG.GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return { rows: data.values || [], tab };
}

function parseDriverRows(rows) {
  if (!rows || rows.length === 0) return [];
  let headerIdx = rows.findIndex(r =>
    r.some(c => /driver\s*name|chofer/i.test(c || ""))
  );
  let colMap, dataRows;
  if (headerIdx >= 0) {
    const header = rows[headerIdx].map(c => (c || "").toLowerCase().trim());
    const find = (...keys) => {
      for (const k of keys) {
        const i = header.findIndex(h => h.includes(k));
        if (i >= 0) return i;
      }
      return -1;
    };
    colMap = {
      driver: find("driver", "chofer", "name"),
      truck:  find("truck", "#"),
      ruta:   find("ruta", "route"),
      qty:    find("qty", "total"),
      status: find("status", "estado"),
      photo:  find("photo", "foto"),
    };
    dataRows = rows.slice(headerIdx + 1);
  } else {
    colMap = { driver: 0, truck: 1, ruta: 2, qty: 3, status: 4, photo: 5 };
    dataRows = rows;
  }
  const drivers = [];
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    const rawDriver = (row[colMap.driver] || "").trim();
    const rawStatus = (row[colMap.status] || "").trim().toUpperCase();
    const rawTruck  = (row[colMap.truck]  || "").toString().trim();
    const rawRuta   = (row[colMap.ruta]   || "").trim();
    const rawQty    = parseInt(row[colMap.qty] || "5") || 5;
    if (!rawDriver) continue;
    if (!rawTruck && !STATUSES.includes(rawStatus)) continue;
    if (!rawRuta && !STATUSES.includes(rawStatus)) continue;
    const photoCol = colMap.photo >= 0 ? colMap.photo : 5;
    const loadCols = row.slice(photoCol + 1).filter(c =>
      /^\d+$/.test((c || "").toString().trim())
    );
    const completedLoads = loadCols.length;
    const noteCell = colMap.driver > 0 ? (row[0] || "").trim() : "";
    const note = noteCell && !STATUSES.includes(noteCell.toUpperCase()) ? noteCell : "";
    let status = rawStatus || "ACTIVO";
    if (completedLoads >= rawQty && rawQty > 0) status = "DONE";
    drivers.push({
      name: rawDriver, truck: rawTruck, ruta: rawRuta,
      qty: rawQty, done: completedLoads, status,
      startHour: parseRouteHour(rawRuta), note,
    });
  }
  drivers.sort((a, b) => a.startHour - b.startHour);
  return drivers;
}

async function loadDriverData() {
  const { rows, tab } = await fetchSheetData();
  if (!rows || rows.length
