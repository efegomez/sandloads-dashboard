const TEXAS_TZ = 'America/Chicago';

function getTexasDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEXAS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
  };
}

function getTZLabel(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TEXAS_TZ,
    timeZoneName: 'short',
  }).formatToParts(date);
  return parts.find(p => p.type === 'timeZoneName')?.value || TEXAS_TZ;
}

function formatTabKey(month, day) {
  return String(month).padStart(2, '0') + '.' + String(day).padStart(2, '0');
}

function getTodayKey(date = new Date()) {
  const { month, day } = getTexasDateParts(date);
  return formatTabKey(month, day);
}

function getTomorrowKey(date = new Date()) {
  const { year, month, day } = getTexasDateParts(date);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const next = getTexasDateParts(tomorrow);
  return formatTabKey(next.month, next.day);
}

module.exports = { getTodayKey, getTomorrowKey, getTZLabel };
