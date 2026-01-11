// Interactive frontend for Baghdad ATFM counts with schedule-based alarm.
// - Loads docs/data/flights.json (created by the Action).
// - Filters flights with altitude >= FL240, classifies North/South by Baghdad latitude.
// - Counts for FL240–350, FL360–460, and total >=FL240.
// - Shows a red alarm when current UTC time is inside any configured peak window (per schedule).
//
// Editable schedule saved into localStorage. To persist globally, we can store schedule.json in the repo via CI.

const BAGHDAD_LAT = parseFloat(localStorage.getItem('bag_lat') || "33.3128");
document.getElementById('bag-lat').textContent = BAGHDAD_LAT.toFixed(4);

const FL_TO_METERS = (fl) => fl * 100 * 0.3048; // flight level * 100 ft -> meters
const FL240 = FL_TO_METERS(240); // ~7315 m
const FL350 = FL_TO_METERS(350);
const FL360 = FL_TO_METERS(360);
const FL460 = FL_TO_METERS(460);

const MAP_CENTER = [BAGHDAD_LAT, 44.3615];
const REFRESH_MS = 30_000;

let map = L.map('map').setView(MAP_CENTER, 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:18 }).addTo(map);
let markers = new Map();

function utcNowString() {
  const d = new Date();
  return d.toISOString().replace('T',' ').replace(/\..+/, '') + ' UTC';
}
function updateClock() {
  document.getElementById('utc-time').textContent = new Date().toUTCString().replace('GMT','UTC');
}
setInterval(updateClock, 1000);
updateClock();

async function loadFlights() {
  try {
    const r = await fetch('data/flights.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('Fetch failed ' + r.status);
    const j = await r.json();
    return j.states || [];
  } catch (e) {
    console.warn('Could not load flights.json', e);
    return [];
  }
}

function altitudeForFilter(state) {
  // prefer baro_altitude then geo_altitude
  return (state.baro_altitude != null) ? state.baro_altitude : state.geo_altitude;
}

function classifyNorthSouth(lat) {
  return lat > BAGHDAD_LAT ? 'North' : 'South';
}

function countsFromStates(states) {
  const counters = {
    n_240_350: 0, s_240_350: 0,
    n_360_460: 0, s_360_460: 0,
    n_all: 0, s_all: 0
  };
  states.forEach(s => {
    const alt = altitudeForFilter(s);
    if (alt == null) return;
    if (alt < FL240) return; // below FL240 ignore
    const ns = classifyNorthSouth(s.latitude);
    // FL240–350
    if (alt >= FL240 && alt <= FL350) {
      if (ns === 'North') counters.n_240_350++;
      else counters.s_240_350++;
    }
    // FL360–460
    if (alt >= FL360 && alt <= FL460) {
      if (ns === 'North') counters.n_360_460++;
      else counters.s_360_460++;
    }
    // All >=FL240
    if (ns === 'North') counters.n_all++;
    else counters.s_all++;
  });
  return counters;
}

function updateCountsUI(c) {
  document.getElementById('n_240_350').textContent = c.n_240_350;
  document.getElementById('s_240_350').textContent = c.s_240_350;
  document.getElementById('t_240_350').textContent = c.n_240_350 + c.s_240_350;

  document.getElementById('n_360_460').textContent = c.n_360_460;
  document.getElementById('s_360_460').textContent = c.s_360_460;
  document.getElementById('t_360_460').textContent = c.n_360_460 + c.s_360_460;

  document.getElementById('n_all').textContent = c.n_all;
  document.getElementById('s_all').textContent = c.s_all;
  document.getElementById('t_all').textContent = c.n_all + c.s_all;
}

function updateMap(states) {
  // remove markers not present anymore
  const seen = new Set(states.map(s => s.icao24));
  for (let key of Array.from(markers.keys())) {
    if (!seen.has(key)) {
      map.removeLayer(markers.get(key));
      markers.delete(key);
    }
  }

  states.forEach(s => {
    if (!s.latitude || !s.longitude) return;
    const key = s.icao24;
    const latlng = [s.latitude, s.longitude];
    const popup = `<strong>${s.callsign || s.icao24}</strong><br/>Alt: ${Math.round(altitudeForFilter(s) || 0)} m<br/>Vel: ${s.velocity || 'N/A'} m/s<br/>${classifyNorthSouth(s.latitude)}`;
    if (markers.has(key)) {
      markers.get(key).setLatLng(latlng).setPopupContent(popup);
    } else {
      const m = L.circleMarker(latlng, { radius:5 }).addTo(map).bindPopup(popup);
      markers.set(key, m);
    }
  });
}

/* Schedule handling: saved in localStorage under 'baghdad_schedule'
   Each item: {start: "HH:MM", end: "HH:MM", sector: "North"|"South", band: "240-350"|"360-460"|"both"|"all"}
   Alarm triggers if current UTC time falls in any window and the counts for that sector+band exceed thresholds (user could later add thresholds).
   For now we show alarm purely based on time windows (as you asked: "red alarm visible when these times (in UTC) shown").
*/
function loadSchedule() {
  const raw = localStorage.getItem('baghdad_schedule');
  if (!raw) {
    // example schedule (you provided windows; please confirm exact list — you can edit them in the page)
    const example = [
      {start:"05:30", end:"07:30", sector:"South", band:"both"},
      {start:"06:00", end:"08:00", sector:"North", band:"both"},
      {start:"12:00", end:"14:00", sector:"North", band:"both"},
      {start:"12:00", end:"14:00", sector:"South", band:"both"},
      {start:"23:30", end:"01:30", sector:"North", band:"both"},
      {start:"00:00", end:"02:00", sector:"South", band:"both"}
    ];
    localStorage.setItem('baghdad_schedule', JSON.stringify(example));
    return example;
  }
  try {
    return JSON.parse(raw);
  } catch(e) {
    return [];
  }
}

function saveSchedule(arr) {
  localStorage.setItem('baghdad_schedule', JSON.stringify(arr));
  renderScheduleList();
}

function renderScheduleList() {
  const listDiv = document.getElementById('schedule-list');
  const sched = loadSchedule();
  listDiv.innerHTML = '';
  sched.forEach((s, i) => {
    const row = document.createElement('div'); row.className = 'sched-row';
    const text = document.createElement('span');
    text.textContent = `${s.start} → ${s.end}  •  ${s.sector}  •  ${s.band}`;
    const del = document.createElement('button'); del.textContent = 'Del'; del.onclick = () => {
      const st = loadSchedule(); st.splice(i,1); saveSchedule(st);
    };
    row.appendChild(text); row.appendChild(del);
    listDiv.appendChild(row);
  });
}

function timeToMinutes(t) { // 'HH:MM' -> minutes from 00:00
  const [hh,mm] = t.split(':').map(x=>parseInt(x,10));
  return hh*60 + mm;
}

function isNowInWindow(window) {
  // handle windows that roll over midnight (end < start)
  const now = new Date();
  const utcH = now.getUTCHours(), utcM = now.getUTCMinutes();
  const nowMin = utcH*60 + utcM;
  const s = timeToMinutes(window.start), e = timeToMinutes(window.end);
  if (s <= e) return nowMin >= s && nowMin <= e;
  // roll over midnight
  return nowMin >= s || nowMin <= e;
}

function updateAlarmDisplay() {
  const sched = loadSchedule();
  const active = sched.some(s => isNowInWindow(s));
  const el = document.getElementById('alarm');
  if (active) {
    el.className = 'alarm-on';
    el.textContent = 'PEAK — sectorisation active (red)';
  } else {
    el.className = 'alarm-off';
    el.textContent = 'No peak (green)';
  }
}

document.getElementById('add-sched').addEventListener('click', () => {
  const start = document.getElementById('start-time').value;
  const end = document.getElementById('end-time').value;
  const sector = document.getElementById('sector').value;
  const band = document.getElementById('band').value;
  if (!start || !end) return alert('Enter start and end times (UTC)');
  const arr = loadSchedule();
  arr.push({start, end, sector, band});
  saveSchedule(arr);
});

document.getElementById('save-sched').addEventListener('click', () => {
  saveSchedule(loadSchedule());
  alert('Schedule saved locally (browser storage).');
});

document.getElementById('reset-sched').addEventListener('click', () => {
  localStorage.removeItem('baghdad_schedule');
  renderScheduleList();
});

renderScheduleList();
updateAlarmDisplay();
setInterval(updateAlarmDisplay, 30_000);

async function refresh() {
  const states = await loadFlights();
  // filter to FIR bounding box (Action already filters but double-check)
  const lat_min = 28.0, lat_max = 37.0, lon_min = 38.0, lon_max = 49.0;
  const inFIR = states.filter(s => s.latitude != null && s.longitude != null && s.latitude >= lat_min && s.latitude <= lat_max && s.longitude >= lon_min && s.longitude <= lon_max);
  // counts
  const counters = countsFromStates(inFIR);
  updateCountsUI(counters);
  updateMap(inFIR);
  updateAlarmDisplay();
}

refresh();
setInterval(refresh, REFRESH_MS);