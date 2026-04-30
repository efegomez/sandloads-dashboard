const STATUSES = ["ACTIVO", "STAGE", "DONE", "ROTO", "STANDBY"];

function parseRouteHour(ruta) {
  if (!ruta) return -1;
  var lower = ruta.toLowerCase();
  var map = {
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

  // Find header row containing "Driver name"
  var headerIdx = -1;
  for (var i = 0; i < rows.length; i++) {
    for (var j = 0; j < rows[i].length; j++) {
      if (/driver\s*name/i.test(rows[i][j] || "")) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }

  if (headerIdx < 0) return [];

  var header = rows[headerIdx].map(function(c) { return (c || "").toLowerCase().trim(); });

  var find = function() {
    var keys = Array.from(arguments);
    for (var k of keys) {
      var idx = header.findIndex(function(h) { return h.includes(k); });
      if (idx >= 0) return idx;
    }
    return -1;
  };

  var colMap = {
    driver: find("driver", "name"),
    truck:  find("truck", "#"),
    ruta:   find("ruta", "route"),
    qty:    find("qty", "total"),
    status: find("status", "estado"),
    photo:  find("photo", "foto")
  };

  var dataRows = rows.slice(headerIdx + 1);
  var drivers = [];
  var emptyCount = 0;

  for (var row of dataRows) {
    // Skip blank rows but allow up to 1 in a row
    var rowText = (row || []).join("").trim();
    if (!rowText) {
      emptyCount++;
      if (emptyCount > 1) break;
      continue;
    }
    emptyCount = 0;

    var rawDriver = (row[colMap.driver] || "").trim();
    var rawRuta   = (row[colMap.ruta]   || "").trim();
    var rawStatus = (row[colMap.status] || "").trim().toUpperCase();
    var rawTruck  = (row[colMap.truck]  || "").toString().trim();
    var rawQty    = parseInt(row[colMap.qty] || "5") || 5;

    // Must have a driver name AND a valid route with a time
    if (!rawDriver) continue;
    if (parseRouteHour(rawRuta) < 0) continue;

    var photoCol = colMap.photo >= 0 ? colMap.photo : 7;
    var loadCols = row.slice(photoCol + 1).filter(function(c) {
      return /^\d{5,}$/.test((c || "").toString().trim());
    });
    var completedLoads = loadCols.length;

    // Note is anything in column A (index 0) that isn't a status
    var noteCell = (row[0] || "").trim();
    var note = (noteCell && !STATUSES.includes(noteCell.toUpperCase())) ? noteCell : "";

    var status = rawStatus || "ACTIVO";
    if (completedLoads >= rawQty && rawQty > 0) status = "DONE";

    drivers.push({
      name:      rawDriver,
      truck:     rawTruck,
      ruta:      rawRuta,
      qty:       rawQty,
      done:      completedLoads,
      status:    status,
      startHour: parseRouteHour(rawRuta),
      note:      note
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
