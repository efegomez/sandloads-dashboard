// ─────────────────────────────────────────────
//  DASHBOARD — Render y auto-refresh
// ─────────────────────────────────────────────

let refreshTimer = null;

// ── Helpers ───────────────────────────────────

function formatHour(h) {
  if (h === 0)  return "12am";
  if (h < 12)   return h + "am";
  if (h === 12) return "12pm";
  return (h - 12) + "pm";
}

function formatTime(date) {
  return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(date) {
  return date.toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

function rowClass(d) {
  if (d.status === "DONE" || d.done >= d.qty) return "row-done";
  if (d.status === "ROTO") return "row-roto";
  if (d.status === "STAGE") return "row-stage";
  return "row-active";
}

function statusBadge(d) {
  const s = d.status || "ACTIVO";
  const map = {
    DONE:    ["badge-done",    "DONE"],
    ACTIVO:  ["badge-active",  "ACTIVO"],
    STAGE:   ["badge-stage",   "STAGE"],
    ROTO:    ["badge-roto",    "ROTO"],
    STANDBY: ["badge-stage",   "STANDBY"],
  };
  const [cls, label] = map[s] || ["badge-stage", s];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── Timeline bubbles ───────────────────────────

function buildTimeline(driver, timeMin, timeMax) {
  const span = timeMax - timeMin || 24;
  const pct = h => Math.max(0, Math.min(100, ((h - timeMin) / span) * 100));

  const tripDur = (timeMax - driver.startHour) / Math.max(driver.qty, 1);
  let bubbles = "";

  for (let i = 0; i < driver.qty; i++) {
    const pos = pct(driver.startHour + (i + 0.5) * tripDur);
    const isDone  = i < driver.done;
    const isRoto  = driver.status === "ROTO" && !isDone;
    const cls     = isRoto ? "b-roto" : isDone ? "b-done" : "b-pending";
    const tooltip = `Carga ${i + 1}: ${isDone ? "completada" : isRoto ? "fuera de servicio" : "pendiente"}`;
    bubbles += `<div class="bubble ${cls}" style="left:${pos.toFixed(2)}%" title="${tooltip}">${i + 1}</div>`;
  }

  return `<div class="timeline"><div class="tl-track"></div>${bubbles}</div>`;
}

// ── Metrics cards ──────────────────────────────

function renderMetrics(drivers) {
  const total      = drivers.length;
  const totalLoads = drivers.reduce((a, d) => a + d.qty, 0);
  const doneLoads  = drivers.reduce((a, d) => a + Math.min(d.done, d.qty), 0);
  const pending    = totalLoads - doneLoads;
  const pct        = totalLoads > 0 ? Math.round((doneLoads / totalLoads) * 100) : 0;

  const el = document.getElementById("metrics");
  el.innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Choferes activos</div>
      <div class="metric-val">${total}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Completadas hoy</div>
      <div class="metric-val accent-green">${doneLoads}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Total asignadas</div>
      <div class="metric-val">${totalLoads}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Pendientes</div>
      <div class="metric-val accent-amber">${pending}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Progreso general</div>
      <div class="metric-val">${pct}<span class="metric-unit">%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}

// ── Chart ──────────────────────────────────────

function renderChart(drivers) {
  if (drivers.length === 0) {
    document.getElementById("chart-container").innerHTML =
      `<div class="empty-state"><p>No hay datos para hoy.</p></div>`;
    return;
  }

  const hours = drivers.map(d => d.startHour);
  const timeMin = Math.max(0,  Math.min(...hours) - 0);
  const timeMax = Math.min(23, Math.max(...hours) + 8);

  // Axis ticks
  const ticks = [];
  for (let h = timeMin; h <= timeMax; h += 2) ticks.push(h);

  const axisHTML = ticks.map(h => {
    const pct = ((h - timeMin) / (timeMax - timeMin)) * 100;
    return `<div class="axis-tick" style="left:${pct.toFixed(2)}%">${formatHour(h)}</div>`;
  }).join("");

  // Driver rows
  const rowsHTML = drivers.map(d => {
    const cls   = rowClass(d);
    const note  = d.note ? `<span class="driver-note">${d.note}</span>` : "";
    const truck = d.truck ? `#${d.truck}` : "";
    return `
      <div class="driver-row ${cls}">
        <div class="driver-info">
          <div class="driver-name">${d.name}</div>
          <div class="driver-meta">${truck} · ${formatHour(d.startHour)}${note}</div>
        </div>
        ${buildTimeline(d, timeMin, timeMax)}
        <div class="loads-count">${d.done}<span class="loads-sep">/</span>${d.qty}</div>
        <div class="status-col">${statusBadge(d)}</div>
      </div>`;
  }).join("");

  document.getElementById("chart-container").innerHTML = `
    <div class="chart-header">
      <div class="col-driver">Chofer</div>
      <div class="col-timeline">Progreso de cargas</div>
      <div class="col-loads">Cargas</div>
      <div class="col-status">Estado</div>
    </div>
    <div class="chart-rows">${rowsHTML}</div>
    <div class="axis-row">
      <div class="axis-spacer"></div>
      <div class="axis-labels">${axisHTML}</div>
      <div class="axis-end"></div>
    </div>
  `;
}

// ── Status bar ─────────────────────────────────

function showStatus(msg, type = "info") {
  const bar = document.getElementById("status-bar");
  bar.textContent = msg;
  bar.className = `status-bar status-${type}`;
  if (type !== "error") setTimeout(() => bar.classList.add("hidden"), 4000);
}

// ── Main load ──────────────────────────────────

async function loadData() {
  const btn  = document.getElementById("refresh-btn");
  const icon = document.getElementById("refresh-icon");
  btn.disabled = true;
  icon.classList.add("spinning");

  try {
    const drivers = await loadDriverData();

    if (drivers === null) {
      showStatus("No se encontraron datos para hoy. Verifica el sheet o la fecha.", "error");
      document.getElementById("chart-container").innerHTML =
        `<div class="empty-state"><p>Sin datos para hoy.<br><small>Fecha buscada: ${getTodayString()}</small></p></div>`;
      return;
    }

    renderMetrics(drivers);
    renderChart(drivers);

    const now = new Date();
    document.getElementById("update-time").textContent = formatTime(now);
    showStatus(`Datos actualizados · ${drivers.length} choferes cargados`, "success");

  } catch (err) {
    console.error(err);
    const msg = err.message.includes("API key") || err.message.includes("403")
      ? "API Key inválida o sin permisos. Revisa config.js."
      : err.message.includes("404")
      ? "Sheet o hoja no encontrada. Revisa SHEET_ID y SHEET_NAMES en config.js."
      : `Error: ${err.message}`;
    showStatus(msg, "error");
  } finally {
    btn.disabled = false;
    icon.classList.remove("spinning");
  }
}

// ── Refresh timer ──────────────────────────────

function startRefreshTimer(minutes) {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadData, minutes * 60 * 1000);
}

// ── Init ───────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Date badge
  document.getElementById("date-badge").textContent = formatDate(new Date());

  // Refresh interval selector
  const sel = document.getElementById("refresh-interval");
  sel.value = String(CONFIG.DEFAULT_REFRESH_MINUTES);
  sel.addEventListener("change", () => {
    const mins = parseInt(sel.value);
    startRefreshTimer(mins);
    showStatus(`Auto-refresh configurado cada ${mins} min`, "info");
  });

  startRefreshTimer(CONFIG.DEFAULT_REFRESH_MINUTES);
  loadData();
});
