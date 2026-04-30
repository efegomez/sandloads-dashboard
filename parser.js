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
  for (var k in map) {
    if (lower.includes(k)) return map[k];
  }
  return -1;
}

function isValidRuta(ruta) {
  if (!ruta) return false;
  return parseRouteHour(ruta) >= 0;
}

function getTodayTabName() {
  var tz = CONFIG.TIMEZONE || "America/New_York";
  var now = new Date();
  var formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, month: "2-digit", day: "2-digit"
  });
  var parts = formatter.formatToParts(now);
  var month = parts.find(function(p) { return p.type === "month"; }).value;
  var day = parts.find(function(p) { return p.type === "day"; }).value;
  return month + "." + day;
}

async function fetchSheetData() {
  var tab = getTodayTabName();
  var url = "https://sheets.googleapis.com/v4/spreadsheets/" + CONFIG.SHEET_ID + "/values/" + encodeURIComponent(tab) + "?key=" + CONFIG.GOOGLE_API_KEY;
  var res = await fetch(url);
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    throw new Error(err.error ? err.error.message : "HTTP " + res.status);
  }
  var data = await res.json();
  return { rows: data.values || [], tab: tab };
}

function parseDriverRows(rows) {
  if (!rows || rows.length === 0) return [];

  var headerIdx = rows.findIndex(function(r) {
    return r.some(function(c) { return /driver\s*name|chofer/i.test(c || ""); });
  });

  var colMap, dataRows;
  if (headerIdx >= 0) {
    var header = rows[headerIdx].map(function(c) { return (c || "").toLowerCase().trim(); });
    var find = function() {
      var keys = Array.from(arguments);
      for (var k of keys) {
        var i = header.findIndex(function(h) { return h.includes(k); });
        if (i >= 0) return i;
      }
      return -1;
    };
    colMap = {
      driver: find("driver", "chofer", "name"),
      truck: find("truck", "#"),
      ruta: find("ruta", "route"),
      qty: find("qty", "total"),
      status: find("status", "estado"),
      photo: find("photo", "foto")
    };
    dataRows = rows.slice(headerIdx + 1);
  } else {
    colMap = { driver: 0, truck: 1, ruta: 2, qty: 3, status: 4, photo: 5 };
    dataRows = rows;
  }

  var drivers = [];

  for (var row of dataRows) {
    if (!row || row.length === 0) break;

    var rawDriver = (row[colMap.driver] || "").trim();
    var rawRuta = (row[colMap.ruta] || "").trim();
    var rawStatus = (row[colMap.status] || "").trim().toUpperCase();
    var rawTruck = (row[colMap.truck] || "").toString().trim();
    var rawQty = parseInt(row[colMap.qty] || "5") || 5;

    if (!rawDriver) break;
    if (!isValidRuta(rawRuta)) break;

    var photoCol = colMap.photo >= 0 ? colMap.photo : 5;
    var loadCols = row.slice(photoCol + 1).filter(function(c) {
      return /^\d+$/.test((c || "").toString().trim());
    });
    var completedLoads = loadCols.length;

    var noteCell = colMap.driver > 0 ? (row[0] || "").trim() : "";
    var note = (noteCell && !STATUSES.includes(noteCell.toUpperCase())) ? noteCell : "";

    var status = rawStatus || "ACTIVO";
    if (completedLoads >= rawQty && rawQty > 0) status = "DONE";

    drivers.push({
      name: rawDriver,
      truck: rawTruck,
      ruta: rawRuta,
      qty: rawQty,
      done: completedLoads,
      status: status,
      startHour: parseRouteHour(rawRuta),
      note: note
    });
  }

  drivers.sort(function(a, b) { return a.startHour - b.startHour; });
  return drivers;
}

async function loadDriverData() {
  var result = await fetchSheetData();
  var rows = result.rows;
  var tab = result.tab;
  if (!rows || rows.length === 0) return { drivers: null, tab: tab };
  var drivers = parseDriverRows(rows);
  return { drivers: drivers, tab: tab };
}
