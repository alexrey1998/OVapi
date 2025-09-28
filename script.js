// script.js
import { defaultBadgeColor, staticColors, getOperatorColor } from "./colors.js";
import { settings } from "./settings.js";

function getInt(val, dflt) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}
function parseHMStoMs(hms, dfltMs) {
  if (typeof hms !== "string") return dfltMs;
  const m = hms.trim().match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (!m) return dfltMs;
  const [, hh, mm, ss] = m;
  const ms = (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000;
  return Number.isFinite(ms) ? ms : dfltMs;
}
const DISPLAY_WINDOW_MS = parseHMStoMs(settings.maxDisplayPeriod, 90 * 60 * 1000);
const REFRESH_MS = parseHMStoMs(settings.refreshInterval, 60 * 1000);
const STATIONBOARD_LIMIT = getInt(settings.stationboardLimit, 30);

let swissStationsSet = new Set();
fetch("swiss_stations.csv")
  .then(r => r.text())
  .then(txt => {
    txt.split("\n").forEach(line => {
      const v = line.trim();
      if (v && v.toLowerCase() !== "name") swissStationsSet.add(v);
    });
  })
  .catch(e => console.error("Erreur CSV gares suisses", e));
function isSwissStation(name) { return swissStationsSet.has(name); }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function formatStopNameHTML(rawName) {
  const name = String(rawName ?? "");
  const color = (settings?.stopName?.suffixColor ?? "default").toString();
  const scale = getInt(settings?.stopName?.prefixScalePct, 100);
  const colorStyle = (color && color.toLowerCase() !== "default") ? `color:${escapeHtml(color)};` : "";
  const m = name.match(/^(.*?,)([\u00A0\u202F ]*)(.*)$/);
  if (m) {
    const prefix = m[1] + m[2];
    const suffix = m[3];
    return `<span class="stopname-prefix" style="font-size:${scale}%;">${escapeHtml(prefix)}</span><span class="stopname-suffix" style="${colorStyle}">${escapeHtml(suffix)}</span>`;
  }
  return `<span class="stopname-suffix" style="${colorStyle}">${escapeHtml(name)}</span>`;
}
function pad2(n) { return n.toString().padStart(2, "0"); }
function fmtHM(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function computeDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const __badgeCanvas = document.createElement("canvas");
const __badgeCtx = __badgeCanvas.getContext("2d");
function adjustLineBadgePadding(el) {
  try {
    const text = (el.textContent || "").trim();
    if (!text) return;
    const cs = window.getComputedStyle(el);
    const font = `${cs.fontStyle || "normal"} ${cs.fontVariant || "normal"} ${cs.fontWeight || "700"} ${cs.fontSize || "22px"} ${cs.fontFamily || "Arial"}`;
    __badgeCtx.font = font;
    const w = __badgeCtx.measureText(text).width;
    const base = 10;
    const extra = Math.max(0, Math.min(24, Math.round(w * 0.15)));
    const pad = base + extra;
    el.style.paddingLeft = pad + "px";
    el.style.paddingRight = pad + "px";
  } catch {}
}

document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("bannerClosed") === "true") {
    const banner = document.getElementById("banner");
    if (banner) banner.style.display = "none";
  } else {
    const closeButton = document.getElementById("banner-close");
    if (closeButton) {
      closeButton.addEventListener("click", () => {
        const banner = document.getElementById("banner");
        if (banner) banner.style.display = "none";
        localStorage.setItem("bannerClosed", "true");
      });
    }
  }

  const stopNameEl = document.getElementById("stop-name");
  const suggestionsContainer = document.getElementById("stop-suggestions");
  const departuresContainer = document.getElementById("departures");
  const lastUpdateElement = document.getElementById("update-time");
  const filterBox = document.getElementById("line-filter-box");
  const toggleFilterBtn = document.getElementById("toggle-filter");

  const thermo = document.getElementById("thermo-container");
  if (thermo) {
    thermo.innerHTML = `
      <div id="thermo-header">
        <button id="thermo-back">← Retour</button>
        <div id="thermo-title"></div>
      </div>
      <div id="thermo-body"></div>
    `;
    thermo.querySelector("#thermo-back").addEventListener("click", () => {
      thermo.style.display = "none";
      departuresContainer.style.display = "";
    });
  }

  let STOP_NAME = stopNameEl ? (stopNameEl.textContent?.trim() || "Entrez le nom de l'arrêt ici") : "Entrez le nom de l'arrêt ici";
  if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
  let currentSuggestionIndex = -1;
  let userLocation = null;
  let selectedLines = new Set();
  let expandedLineKey = null;

  let autoFillAllowed = true;

  const LAST_FIX_KEY = "lastPositionFix.v1";
  function saveLastFix(loc) {
    try {
      if (!loc) return;
      localStorage.setItem(LAST_FIX_KEY, JSON.stringify({
        lat: loc.lat, lon: loc.lon, accuracy: loc.accuracy ?? null, t: Date.now()
      }));
    } catch {}
  }
  function loadLastFix(maxAgeMs = 5 * 60 * 1000) {
    try {
      const raw = localStorage.getItem(LAST_FIX_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!Number.isFinite(o?.lat) || !Number.isFinite(o?.lon)) return null;
      if (!Number.isFinite(o?.t) || (Date.now() - o.t) > maxAgeMs) return null;
      return { lat: o.lat, lon: o.lon, accuracy: o.accuracy ?? null };
    } catch { return null; }
  }

  let nearbyRaw = [];
  let nearbyStops = [];

  document.getElementById("btn-refresh")?.addEventListener("click", () => fetchDepartures());

  document.getElementById("btn-gps")?.addEventListener("click", () => {
    updateUserLocation(() => {
      if (!userLocation) return;
      fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, () => {
        if (nearbyStops.length > 0) {
          STOP_NAME = nearbyStops[0].name;
          if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
          selectedLines.clear();
          expandedLineKey = null;
          try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
          fetchDepartures();
        }
      });
    }, true);
  });

  document.getElementById("btn-toggle-nearby")?.addEventListener("click", () => {
    if (nearbyStops.length >= 2) {
      const idx = nearbyStops.findIndex(s => s.name === STOP_NAME);
      const next = (idx === 0) ? nearbyStops[1] : nearbyStops[0];
      STOP_NAME = next.name;
      if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
      selectedLines.clear();
      expandedLineKey = null;
      try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
      fetchDepartures();
    }
  });

  if (stopNameEl) {
    stopNameEl.addEventListener("input", () => {
      const v = stopNameEl.textContent?.trim() || "";
      STOP_NAME = v;
      if (!v) {
        suggestionsContainer.innerHTML = "";
        return;
      }
      fetchSuggestionsByQuery(v);
    });
    stopNameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const pick = suggestionsContainer.querySelector(".suggestion-item.selected") || suggestionsContainer.querySelector(".suggestion-item");
        const txt = pick ? pick.getAttribute("data-name") : stopNameEl.textContent?.trim();
        STOP_NAME = txt || STOP_NAME;
        if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
        suggestionsContainer.innerHTML = "";
        selectedLines.clear();
        expandedLineKey = null;
        try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
        fetchDepartures();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(suggestionsContainer.querySelectorAll(".suggestion-item"));
        if (!items.length) return;
        currentSuggestionIndex = (currentSuggestionIndex + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((el, i) => el.classList.toggle("selected", i === currentSuggestionIndex));
      }
    });
  }

  (function initFromCacheOrGeo() {
    try {
      const last = localStorage.getItem("lastUserStop");
      if (last) {
        STOP_NAME = last;
        if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
        fetchDepartures();
        return;
      }
    } catch {}
    const cached = loadLastFix();
    if (cached) {
      fetchSuggestionsByLocation(cached.lon, cached.lat, () => {});
    } else {
      updateUserLocation(() => fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, () => {}), true);
    }
  })();

  function fetchSuggestionsByQuery(q) {
    const url = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(q)}`;
    fetch(url).then(r => r.json()).then(data => {
      const items = (data.stations || data.locations || []).filter(s => s.id && s.name);
      suggestionsContainer.innerHTML = items.slice(0, 8).map(s => `<div class="suggestion-item" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`).join("");
      Array.from(suggestionsContainer.children).forEach(el => {
        el.addEventListener("click", () => {
          STOP_NAME = el.getAttribute("data-name");
          if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
          suggestionsContainer.innerHTML = "";
          selectedLines.clear();
          expandedLineKey = null;
          try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
          fetchDepartures();
        });
      });
    }).catch(() => {});
  }
  function fetchSuggestionsByLocation(lon, lat, cb) {
    const url = `https://transport.opendata.ch/v1/locations?x=${encodeURIComponent(lon)}&y=${encodeURIComponent(lat)}&type=station`;
    fetch(url).then(r => r.json()).then(data => {
      nearbyRaw = (data.stations || data.locations || []).filter(s => s.id && s.name && Number.isFinite(s.distance || 0));
      nearbyRaw.sort((a,b) => (a.distance||0) - (b.distance||0));
      nearbyStops = nearbyRaw.slice(0, 5).map(s => ({ name: s.name, id: s.id, distance: s.distance||0 }));
      const html = nearbyStops.map((s, i) => `<div class="suggestion-item${i===0?' selected':''}" data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}${isSwissStation(s.name) ? " 🇨🇭" : ""}</div>`).join("");
      suggestionsContainer.innerHTML = html;
      Array.from(suggestionsContainer.children).forEach(el => {
        el.addEventListener("click", () => {
          STOP_NAME = el.getAttribute("data-name");
          if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
          suggestionsContainer.innerHTML = "";
          selectedLines.clear();
          expandedLineKey = null;
          try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
          fetchDepartures();
        });
      });
      cb && cb();
    }).catch(() => { cb && cb(); });
  }
  function updateUserLocation(cb, fresh=false) {
    if (!navigator.geolocation) { cb && cb(); return; }
    const opts = fresh ? { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 } : { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 };
    navigator.geolocation.getCurrentPosition(pos => {
      userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
      saveLastFix(userLocation);
      cb && cb();
    }, () => cb && cb(), opts);
  }

  async function fetchDepartures() {
    if (!STOP_NAME) return;
    try { lastUpdateElement.textContent = "…"; } catch {}
    try {
      const url = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(STOP_NAME)}&limit=${STATIONBOARD_LIMIT}`;
      const data = await fetch(url).then(r => r.json());
      const departures = Array.isArray(data.stationboard) ? data.stationboard : [];
      renderDepartures(departures);
      try { lastUpdateElement.textContent = fmtHM(new Date()); } catch {}
    } catch (e) {
      console.error("Erreur stationboard", e);
    }
  }

  function renderDepartures(departures) {
    const thermo = document.getElementById("thermo-container");
    if (thermo) thermo.style.display = "none";
    departuresContainer.style.display = "";
    departuresContainer.innerHTML = "";
    const filtered = departures.filter(dep => selectedLines.size === 0 || selectedLines.has(`${dep.category || ""} ${dep.number || ""}`));

    const groupedByLine = {};
    const nowMs = Date.now();
    filtered.forEach(dep => {
      const key = `${dep.category || ""} ${dep.number || ""}`;
      if (!groupedByLine[key]) groupedByLine[key] = {};
      const dest = dep.to || "";
      if (!groupedByLine[key][dest]) groupedByLine[key][dest] = [];
      const schedMs = new Date(dep.stop?.departure).getTime();
      const delayMin = Number(dep.stop?.delay || 0);
      const effMs = Number.isFinite(schedMs) ? schedMs + (Number.isFinite(delayMin) ? delayMin * 60000 : 0) : NaN;
      const remaining = Number.isFinite(effMs) ? Math.max(0, Math.round((effMs - nowMs) / 60000)) : null;
      if (Number.isFinite(effMs) && (effMs - nowMs) <= DISPLAY_WINDOW_MS) {
        groupedByLine[key][dest].push({
          raw: dep,
          schedMs,
          effMs,
          minutesLeft: remaining,
          timeStr: fmtHM(new Date(schedMs)),
          platform: (dep.stop?.platform && dep.category !== "GB" && dep.stop.platform !== "null") ? dep.stop.platform : "",
          delay: (dep.stop && dep.stop.delay !== undefined && dep.stop.delay !== null) ? dep.stop.delay : null
        });
      }
    });

    const sortedLines = Object.entries(groupedByLine).sort(([a], [b]) => {
      const numA = a.split(" ").pop();
      const numB = b.split(" ").pop();
      const isNumA = !isNaN(numA);
      const isNumB = !isNaN(numB);
      if (isNumA && isNumB) return parseInt(numA) - parseInt(numB);
      if (isNumA) return -1;
      if (isNumB) return 1;
      return numA.localeCompare(numB);
    });

    for (const [lineKey, destinations] of sortedLines) {
      const [category, ...numParts] = lineKey.split(" ");
      const number = numParts.join(" ").trim();
      let content = "";
      let lineColor = "";

      const sampleTimes = Object.values(destinations)[0] || [];
      const sampleDep = sampleTimes[0]?.raw || null;
      const operator = sampleDep?.operator || null;

      if (category === "B" || category === "T" || category === "M") {
        content = number || category;
        lineColor = getOperatorColor(category, number, operator) || defaultBadgeColor;
      } else if (category === "GB") {
        content = "🚠";
        lineColor = staticColors.GB || "#9ca3af";
      } else if (category === "BAT") {
        content = number && !number.startsWith("0") ? `BAT ${number}` : "BAT";
        lineColor = staticColors.BAT || defaultBadgeColor;
      } else {
        content = number && !number.startsWith("0") ? `${category} ${number}` : category;
        lineColor = staticColors.train || "#eb0000";
      }

      const card = document.createElement("div");
      card.className = "line-card";
      card.dataset.lineKey = lineKey;

      const lineRow = document.createElement("div");
      lineRow.className = "line-row";
      const badge = document.createElement("span");
      badge.className = "line-badge";
      badge.style.backgroundColor = lineColor;
      badge.textContent = content;
      lineRow.appendChild(badge);
      card.appendChild(lineRow);
      adjustLineBadgePadding(badge);

      const isExpanded = expandedLineKey === lineKey;

      if (isExpanded) {
        for (const [dest, times] of Object.entries(destinations)) {
          if (times.length === 0) continue;
          let displayDest = dest;
          let suffixAirport = (displayDest === "Zürich Flughafen" || displayDest === "Genève-Aéroport") ? " ✈" : "";
          const destDiv = document.createElement("div");
          destDiv.className = "destination-title";
          destDiv.innerHTML = formatStopNameHTML(displayDest) + escapeHtml(suffixAirport);
          card.appendChild(destDiv);

          const list = document.createElement("div");
          list.className = "departure-times";
          list.innerHTML = times.slice(0, 5).map(o => {
            let delayStr = "";
            if (o.delay !== null && (o.delay <= -2 || o.delay >= 2)) {
              const d = Math.abs(o.delay);
              const sign = o.delay >= 0 ? "+" : "-";
              delayStr = d >= 5 ? ` <span class="late">${sign}${d}'</span>` : ` ${sign}${d}'`;
            }
            const pl = o.platform ? ` pl. ${escapeHtml(o.platform)}` : "";
            return `<span class="departure-item" data-dest="${escapeHtml(dest)}" data-time="${o.timeStr}">${o.timeStr}${delayStr} (${o.minutesLeft} min)${pl}</span>`;
          }).join("");
          card.appendChild(list);
        }

        card.addEventListener("click", (e) => {
          const depEl = e.target.closest(".departure-item");
          if (!depEl) {
            expandedLineKey = null;
            renderDepartures(departures);
            return;
          }
          const dest = depEl.getAttribute("data-dest");
          const timeStr = depEl.getAttribute("data-time");
          showThermometer(STOP_NAME, dest, timeStr, content);
        });
      } else {
        card.classList.add("compact");

        for (const [dest, times] of Object.entries(destinations)) {
          if (!times.length) continue;

          const destDiv = document.createElement("div");
          destDiv.className = "destination-title";
          const suffixAirport = (dest === "Zürich Flughafen" || dest === "Genève-Aéroport") ? " ✈" : "";
          destDiv.innerHTML = formatStopNameHTML(dest) + escapeHtml(suffixAirport);
          card.appendChild(destDiv);

          const strip = document.createElement("div");
          strip.className = "countdown-strip";
          const mins = times.map(o => o.minutesLeft).sort((a,b)=>a-b).slice(0,5);
          strip.innerHTML = mins.map((m, i) => `<span class="cd${i===0?' first':''}">${m}'</span>`).join("");
          card.appendChild(strip);
        }

        card.addEventListener("click", () => {
          expandedLineKey = lineKey;
          renderDepartures(departures);
        });
      }

      departuresContainer.appendChild(card);
    }
  }

  async function showThermometer(fromName, toName, hhmm, lineLabel) {
    const thermo = document.getElementById("thermo-container");
    if (!thermo) return;
    try {
      const now = new Date();
      const date = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
      const url = `https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&limit=1&date=${encodeURIComponent(date)}&time=${encodeURIComponent(hhmm)}`;
      const data = await fetch(url).then(r => r.json());
      const conn = (data.connections || [])[0];
      let passList = [];
      if (conn && Array.isArray(conn.sections)) {
        const vehicleSection = conn.sections.find(s => s.journey && Array.isArray(s.journey.passList));
        if (vehicleSection) passList = vehicleSection.journey.passList;
      }

      const header = thermo.querySelector("#thermo-title");
      header.textContent = `Thermomètre ${lineLabel} – ${fromName} → ${toName}`;
      const body = thermo.querySelector("#thermo-body");
      body.innerHTML = "";

      if (!passList || passList.length === 0) {
        body.innerHTML = `<p>Données indisponibles pour cet itinéraire.</p>`;
      } else {
        const nowMs = Date.now();
        passList.forEach(p => {
          const name = p.station?.name || "";
          const sched = p.departure || p.arrival;
          const delay = Number(p.departureDelay ?? p.arrivalDelay ?? p.delay ?? 0);
          const t = sched ? new Date(sched) : null;
          const effMs = t ? (t.getTime() + (Number.isFinite(delay) ? delay * 60000 : 0)) : null;
          const minutesLeft = effMs ? Math.max(0, Math.round((effMs - nowMs)/60000)) : null;

          const row = document.createElement("div");
          row.className = "thermo-row";
          const tdiv = document.createElement("div");
          tdiv.className = "thermo-time";
          if (t) {
            const delayTxt = (delay && Math.abs(delay) >= 2) ? ` ${delay>0?"+":"-"}${Math.abs(delay)}'` : "";
            const minTxt = minutesLeft !== null ? ` (${minutesLeft} min)` : "";
            tdiv.textContent = `${fmtHM(t)}${delayTxt}${minTxt}`;
          } else {
            tdiv.textContent = "—";
          }
          const nd = document.createElement("div");
          nd.className = "thermo-stop";
          nd.textContent = name;
          row.appendChild(tdiv);
          row.appendChild(nd);
          body.appendChild(row);
        });

        const idx = passList.findIndex(p => (p.station?.name || "").toLowerCase() === fromName.toLowerCase());
        if (idx >= 0) {
          const target = body.children[idx];
          target?.scrollIntoView({ block: "center" });
        }
      }

      const departuresContainer = document.getElementById("departures");
      if (departuresContainer) departuresContainer.style.display = "none";
      thermo.style.display = "block";
    } catch (e) {
      console.error("Thermomètre erreur", e);
    }
  }

  (async () => {
    const cached = loadLastFix();
    if (cached) {
      fetchSuggestionsByLocation(cached.lon, cached.lat, () => {});
    }
    if (STOP_NAME === "Entrez le nom de l'arrêt ici") {
      updateUserLocation(
        () => findAndFillBestStop(),
        { fresh: true, withWatch: true, quickCallback: () => findAndFillBestStop() }
      );
    } else {
      fetchDepartures();
    }
    setInterval(fetchDepartures, REFRESH_MS);
  })();

  function findAndFillBestStop() {
    if (!nearbyStops.length) return;
    const best = nearbyStops[0];
    if (best && best.name) {
      const stored = localStorage.getItem("lastUserStop");
      if (!stored) {
        const name = best.name;
        if (name) {
          try { localStorage.setItem("lastUserStop", name); } catch {}
        }
      }
    }
  }
});
