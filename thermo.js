// Any code change requires updating the version number (see sw.js).
// Thermometer logic without DOM (testable with Node): stops of a train, delays, merging of successive readings,
// position of the train. Times in ms (null when unknown), delays in minutes (null without real-time data).
// API facts (transport.opendata.ch, checked on raw JSON):
// - delay is the departure delay of each stop (= prognosis.departure − departure); the arrival may differ.
// - In a stationboard entry, passList[0] is the stop consulted but its station is often wrong (id of the
//   terminus, name null): entry.stop.station is used instead.
// - Pseudo-stops (tunnels) have no time at all.
// - A prognosis may go backwards (terminus "arriving" before the departure): such times are ignored.

function toMs(s) {
  if (!s) return null;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
}
const minutesBetween = (eff, sched) => Math.round((eff - sched) / 60000);

// Effective time: prognosis, else scheduled + delay, else scheduled (no real-time data: delay null).
// The first candidate not earlier than `floor` (the previous effective time) is kept.
function effective(sched, prognosis, delay, floor) {
  const candidates = [];
  if (prognosis !== null) candidates.push({ eff: prognosis, delay: sched !== null ? minutesBetween(prognosis, sched) : null });
  if (sched !== null && delay !== null) candidates.push({ eff: sched + delay * 60000, delay });
  if (sched !== null) candidates.push({ eff: sched, delay: null });
  return candidates.find(c => c.eff >= floor) || { eff: null, delay: null };
}

// Arrival never after the departure of the same stop (a stop absorbs delay, it never adds any before leaving).
function clampArrival(s) {
  if (s.effArr !== null && s.effDep !== null && s.effArr > s.effDep) {
    s.effArr = s.effDep;
    s.arrDelay = s.schedArr !== null && s.arrDelay !== null ? minutesBetween(s.effArr, s.schedArr) : s.arrDelay;
  }
}

// passList (stationboard entry or planner journey) → stops. firstStation: station of the first element when the
// passList's own one is unreliable (stationboard); the first element then has no arrival.
export function normalizePassList(passList, firstStation = null) {
  if (!Array.isArray(passList)) return [];
  let floor = -Infinity;
  return passList.map((p, i) => {
    const station = (i === 0 && firstStation) || p.station || {};
    const s = {
      stationId: station.id ?? null,
      name: station.name ?? "",
      schedArr: i === 0 && firstStation ? null : toMs(p.arrival),
      schedDep: toMs(p.departure),
      effArr: null, arrDelay: null, effDep: null, depDelay: null
    };
    s.pseudo = s.schedArr === null && s.schedDep === null;
    if (s.pseudo) return s;
    const delay = Number.isFinite(p.delay) ? p.delay : null;
    const arr = i === 0 && firstStation ? { eff: null, delay: null } : effective(s.schedArr, toMs(p.prognosis?.arrival), delay, floor);
    s.effArr = arr.eff; s.arrDelay = arr.delay;
    const dep = effective(s.schedDep, toMs(p.prognosis?.departure), delay, floor);
    s.effDep = dep.eff; s.depDelay = dep.delay;
    clampArrival(s);
    floor = Math.max(floor, s.effDep ?? s.effArr ?? -Infinity);
    return s;
  });
}

export function boardEntryStops(entry) {
  return normalizePassList(entry?.passList, entry?.stop?.station || null);
}

// A stop is identified by its station and its scheduled times (a missing time on one side does not conflict).
function sameStop(a, b) {
  const sameStation = a.stationId !== null || b.stationId !== null ? a.stationId === b.stationId : a.name === b.name;
  return sameStation &&
    (a.schedArr === null || b.schedArr === null || a.schedArr === b.schedArr) &&
    (a.schedDep === null || b.schedDep === null || a.schedDep === b.schedDep);
}

// Received values overwrite the old ones; stops absent from the new reading (already passed, or beyond it) keep
// theirs. New stops are inserted after the last matched one.
export function mergeStops(oldStops, newStops) {
  const out = (oldStops || []).map(s => ({ ...s }));
  let at = 0;
  for (const n of newStops || []) {
    const idx = out.findIndex((o, k) => k >= at && sameStop(o, n));
    if (idx < 0) {
      out.splice(at, 0, { ...n });
      at++;
      continue;
    }
    const o = out[idx];
    if (n.name) o.name = n.name;
    if (n.schedArr !== null) o.schedArr = n.schedArr;
    if (n.schedDep !== null) o.schedDep = n.schedDep;
    if (n.effArr !== null) { o.effArr = n.effArr; o.arrDelay = n.arrDelay; }
    if (n.effDep !== null) { o.effDep = n.effDep; o.depDelay = n.depDelay; }
    o.pseudo = o.schedArr === null && o.schedDep === null;
    clampArrival(o);
    at = idx + 1;
  }
  return out;
}

// Complete when the list reaches the destination shown (dep.to may be a headsign: the train can continue after it).
export function isComplete(stops, destination) {
  return Array.isArray(stops) && stops.length >= 2 && stops.some(s => s.name === destination);
}

// Train of a stationboard: same name and same scheduled departure at that stop.
export function findTrain(board, name, schedDepMs) {
  return (board || []).find(e => (e.name || "") === (name || "") && toMs(e.stop?.departure) === schedDepMs) || null;
}

// Position of the train in row units (2.5 = halfway between rows 2 and 3) and whether it is moving.
// Stops without time (pseudo-stops) are spread evenly between the timed stops around them.
export function trainPosition(stops, nowMs) {
  const timed = [];
  (stops || []).forEach((s, i) => {
    const arr = s.effArr ?? s.effDep;
    const dep = s.effDep ?? s.effArr;
    if (arr !== null) timed.push({ i, arr, dep });
  });
  if (!timed.length) return { position: 0, moving: false };
  if (nowMs < timed[0].dep) return { position: timed[0].i, moving: false };
  for (let k = 1; k < timed.length; k++) {
    const prev = timed[k - 1], s = timed[k];
    if (nowMs < s.arr) {
      const span = s.arr - prev.dep;
      const frac = span > 0 ? Math.min(1, Math.max(0, (nowMs - prev.dep) / span)) : 1;
      return { position: prev.i + frac * (s.i - prev.i), moving: true };
    }
    if (nowMs < s.dep) return { position: s.i, moving: false };
  }
  return { position: timed[timed.length - 1].i, moving: false };
}

// Index of the next stop whose stationboard should list the train (it has a departure, not the terminus); -1 if none.
export function nextPollStop(stops, position) {
  for (let i = Math.max(1, Math.ceil(position)); i < (stops || []).length - 1; i++) {
    const s = stops[i];
    if (!s.pseudo && s.schedDep !== null && s.stationId) return i;
  }
  return -1;
}
