// script.js
// Note pour les IA : toute modification du code implique de changer le numéro de version (voir sw.js).
import { lineColors } from "./colors.js";
import { settings } from "./settings.js";
import { LANGUAGES, browserLanguage, setLanguage, t, applyStaticTexts } from "./i18n.js";
import { THEME_CHOICES, startTheme, setThemePreference } from "./theme.js";
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
const REFRESH_CHOICES_MS = [30000, 60000];
const APP_SETTINGS_KEY = "appSettings.v1";
function loadAppSettings() {
  const defaults = {
    refreshMs: REFRESH_CHOICES_MS.includes(REFRESH_MS) ? REFRESH_MS : 60000,
    showDelay: true,
    delayShowThresholdMin: 1,
    delayRedThresholdMin: 3,
    language: browserLanguage(),
    theme: "auto"
  };
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const merged = { ...defaults, ...parsed };
        if (!REFRESH_CHOICES_MS.includes(merged.refreshMs)) merged.refreshMs = defaults.refreshMs;
        if (!(merged.language in LANGUAGES)) merged.language = defaults.language;
        if (!THEME_CHOICES.includes(merged.theme)) merged.theme = defaults.theme;
        return merged;
      }
    }
  } catch {}
  return defaults;
}
function saveAppSettings(s) {
  try { localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(s)); } catch {}
}
let swissStationsSet = new Set();
let stationDeparturesCache = {};
const STATION_CACHE_TTL_MS = 5 * 60 * 1000;
let trainPassListCache = {};
// "numéro de train|destination brute" → destination vérifiée, pour ne pas revérifier un même train.
const verifiedDestinations = new Map();
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
  const scale = getInt(settings?.stopName?.prefixScalePct, 100);
  // Couleurs clair/sombre en variables CSS, appliquées par .stopname-suffix (style.css).
  const colorVar = (cssVar, value) => {
    const c = (value ?? "default").toString();
    return (c && c.toLowerCase() !== "default") ? `${cssVar}:${escapeHtml(c)};` : "";
  };
  const colorStyle = colorVar("--suffix-light", settings?.stopName?.suffixColor) + colorVar("--suffix-dark", settings?.stopName?.suffixColorDark);
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
// ≈ police de .line-badge (style.css), en dur car le badge est mesuré avant d'être dans la page.
const badgeCtx = document.createElement("canvas").getContext("2d");
badgeCtx.font = "700 22px Arial";
function adjustLineBadgePadding(el) {
  const text = (el.textContent || "").trim();
  if (!text) return;
  const w = badgeCtx.measureText(text).width;
  const base = 10;
  const extra = Math.max(0, Math.min(24, Math.round(w * 0.15)));
  const pad = base + extra;
  el.style.paddingLeft = pad + "px";
  el.style.paddingRight = pad + "px";
}
function createLineBadge({ label, color }) {
  const badge = document.createElement("span");
  badge.className = "line-badge";
  badge.style.backgroundColor = color;
  // Texte noir sur fond blanc (sinon le numéro serait invisible).
  if (/^#?f{3}(f{3})?$/i.test(String(color).trim())) badge.style.color = "#000";
  badge.textContent = label;
  adjustLineBadgePadding(badge);
  return badge;
}
// Libellé et couleur du badge d'une ligne.
function getLineBadge(category, number, operator) {
  const { categories } = lineColors;
  const withNumber = (prefix) => (number && !number.startsWith("0") ? `${prefix} ${number}` : prefix);
  if (category === "B" || category === "T" || category === "M") {
    return { label: number || category, color: operatorColor(operator, number) || categories.default };
  }
  if (category === "FUN") {
    return { label: withNumber("Funi"), color: operatorColor(operator, number) || categories.default };
  }
  if (category === "BAT") {
    // lineColors.BAT n'est pas encore lu : pour colorer les bateaux, c'est ici qu'il faudra le lire.
    return { label: withNumber("BAT"), color: categories.default };
  }
  if (category === "GB") return { label: "🚠", color: categories.GB };
  const label = withNumber(category);
  if (categories.trains.includes(category)) return { label, color: categories.trainsColor };
  // lineColors[label] : point d'extension pour des couleurs par libellé.
  return { label, color: lineColors[label] || categories.trainsColor };
}
// Couleur dans la palette de l'opérateur : numéro exact, sinon partie numérique, sinon "default".
function operatorColor(operator, number) {
  const palette = operator && lineColors[operator];
  if (!palette) return "";
  return palette[number] || palette[number.match(/^\d+/)?.[0]] || palette.default;
}
// Clé de ligne « catégorie numéro ». Hors bus/tram/métro, un numéro qui commence par 0 est un numéro de train
// (TGV, EC, TER… sans numéro de ligne) : ces départs sont regroupés sous la seule catégorie, comme leur badge.
function lineKeyOf(dep) {
  const category = dep.category || "";
  const number = dep.number || "";
  const isTrainNumber = !["B", "T", "M"].includes(category) && number.startsWith("0");
  return `${category} ${isTrainNumber ? "" : number}`;
}
// Tri des lignes : numéros qui commencent par des chiffres d'abord (par valeur), puis ordre alphabétique.
function compareLineKeys(a, b) {
  const numA = a.split(" ").pop();
  const numB = b.split(" ").pop();
  const pureNumA = parseInt(numA.match(/^\d+/)?.[0]);
  const pureNumB = parseInt(numB.match(/^\d+/)?.[0]);
  const isNumA = !isNaN(pureNumA);
  const isNumB = !isNaN(pureNumB);
  if (isNumA && isNumB) return pureNumA !== pureNumB ? pureNumA - pureNumB : numA.localeCompare(numB);
  if (isNumA) return -1;
  if (isNumB) return 1;
  return numA.localeCompare(numB) || a.localeCompare(b);
}
function withDelay(ms, delayMin) {
  return ms + (Number.isFinite(delayMin) ? delayMin * 60000 : 0);
}
function minutesUntil(ms, nowMs) {
  return Math.max(0, Math.round((ms - nowMs) / 60000));
}
// Départ du tableau prêt à afficher, ou null s'il sort de la période d'affichage.
function toDepartureInfo(dep, nowMs) {
  const schedMs = new Date(dep.stop?.departure).getTime();
  const effMs = Number.isFinite(schedMs) ? withDelay(schedMs, Number(dep.stop?.delay || 0)) : NaN;
  if (!Number.isFinite(effMs) || effMs - nowMs > DISPLAY_WINDOW_MS) return null;
  return {
    dep,
    effMs,
    minutesLeft: minutesUntil(effMs, nowMs),
    timeStr: fmtHM(new Date(schedMs)),
    platform: (dep.stop?.platform && dep.category !== "GB" && dep.stop.platform !== "null") ? dep.stop.platform : "",
    delay: dep.stop?.delay ?? null
  };
}
// Première correspondance entre deux arrêts, aujourd'hui à partir de hhmm.
async function fetchFirstConnection(from, to, hhmm) {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  const url = `https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1&date=${encodeURIComponent(date)}&time=${encodeURIComponent(hhmm)}`;
  const data = await fetch(url).then(r => r.json());
  return (data.connections || [])[0];
}
function hasComma(stopName) {
  return String(stopName).includes(',');
}

function loadDisplayMode(stopName) {
  const key = hasComma(stopName) ? 'displayMode-withComma' : 'displayMode-noComma';
  const defaultMode = hasComma(stopName) ? 'by-line' : 'by-time';
  return localStorage.getItem(key) || defaultMode;
}

function saveDisplayMode(stopName, mode) {
  const key = hasComma(stopName) ? 'displayMode-withComma' : 'displayMode-noComma';
  localStorage.setItem(key, mode);
}
// Fenêtre Filtres ou Réglages : ouverture, fermeture, bouton ×, clic à l'extérieur et Échap.
function setupModal({ box, toggleBtn, closeId, bodyClass }) {
  const isOpen = () => document.body.classList.contains(bodyClass);
  function close() {
    document.body.classList.remove(bodyClass);
    box.classList.remove("modal-open");
    box.classList.add("hidden");
  }
  function ensureClose() {
    let btn = document.getElementById(closeId);
    if (!btn || btn.parentElement !== box) {
      if (btn && btn.parentElement) btn.parentElement.removeChild(btn);
      btn = document.createElement("button");
      btn.id = closeId;
      btn.type = "button";
      btn.dataset.i18nAria = "close";
      btn.setAttribute("aria-label", t("close"));
      btn.textContent = "×";
      btn.addEventListener("click", close);
      box.prepend(btn);
    }
  }
  function open() {
    ensureClose();
    box.classList.remove("hidden");
    box.classList.add("modal-open");
    document.body.classList.add(bodyClass);
  }
  toggleBtn?.addEventListener("click", () => {
    if (isOpen()) close();
    else open();
  });
  document.addEventListener("click", (e) => {
    if (isOpen() && !box.contains(e.target) && !toggleBtn?.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });
  return { ensureClose };
}
document.addEventListener("DOMContentLoaded", () => {
  let appSettings = loadAppSettings();
  startTheme(appSettings.theme);
  setLanguage(appSettings.language);
  applyStaticTexts();
  const stopNameEl = document.getElementById("stop-name");
  if (stopNameEl) {
    stopNameEl.dataset.placeholder = t("stopPlaceholder");
    stopNameEl.textContent = t("stopPlaceholder");
  }
  const suggestionsContainer = document.getElementById("stop-suggestions");
  const departuresContainer = document.getElementById("departures");
  const lastUpdateElement = document.getElementById("update-time");
  const filterBox = document.getElementById("line-filter-box");
  const toggleFilterBtn = document.getElementById("toggle-filter");
  const toggleDisplayBtn = document.getElementById("btn-toggle-display");
  const settingsBox = document.getElementById("settings-box");
  const btnSettings = document.getElementById("btn-settings");
  const thermo = document.getElementById("thermo-container");
  if (thermo) {
    thermo.innerHTML = `
      <div id="thermo-header">
        <button id="thermo-back" data-i18n="back">${t("back")}</button>
        <div id="thermo-title"></div>
      </div>
      <div id="thermo-body"></div>
    `;
    thermo.querySelector("#thermo-back").addEventListener("click", () => closeThermometer());
  }
  let STOP_NAME = stopNameEl ? (stopNameEl.textContent?.trim() || t("stopPlaceholder")) : t("stopPlaceholder");
  if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
  let currentSuggestionIndex = -1;
  let userLocation = null;
  let selectedLines = new Set();
  let expandedLineKey = null;
  let displayMode = loadDisplayMode(STOP_NAME);
  let lastDepartures = [];
  let currentFetchController = null;
  let suggestionsController = null;
  function abortPendingSuggestions() {
    if (suggestionsController && !suggestionsController.signal.aborted) suggestionsController.abort();
    suggestionsController = null;
  }
  let refreshTimerId = null;
  function startRefreshTimer() {
    if (refreshTimerId) clearInterval(refreshTimerId);
    refreshTimerId = setInterval(fetchDepartures, appSettings.refreshMs);
  }
  function updateDisplayButtonIcon() {
    if (!toggleDisplayBtn) return;
    toggleDisplayBtn.textContent = displayMode === 'by-line' ? '☰' : '⊞';
  }
  updateDisplayButtonIcon();
  let autoFillAllowed = true;
  let blurTimer = null;
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
  let nearbyStops = [];
  // Arrivée depuis un thermomètre : départs masqués avant minDepartureMs, bandeau de retour vers jumpBackStop.
  let minDepartureMs = null;
  let jumpBackStop = null;
  let lastThermoArgs = null;
  const jumpBanner = document.getElementById("jump-back");
  function isAfterMinDeparture(info) {
    return minDepartureMs === null || info.effMs >= minDepartureMs;
  }
  function updateJumpBanner() {
    if (!jumpBanner) return;
    const visible = jumpBackStop !== null && minDepartureMs !== null;
    jumpBanner.classList.toggle("hidden", !visible);
    if (visible) jumpBanner.textContent = `← ${jumpBackStop} · ${t("departuresAfter")} ${fmtHM(new Date(minDepartureMs))}`;
  }
  // Affiche l'arrêt choisi et charge ses départs.
  function selectStop(name, jump = null) {
    STOP_NAME = name;
    if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(name);
    selectedLines.clear();
    expandedLineKey = null;
    autoFillAllowed = false;
    minDepartureMs = jump ? jump.minMs : null;
    jumpBackStop = jump ? jump.backStop : null;
    updateJumpBanner();
    displayMode = loadDisplayMode(name);
    updateDisplayButtonIcon();
    fetchDepartures();
  }
  function closeThermometer() {
    if (!thermo) return;
    clearMarqueeTimers(thermoMarqueeTimers);
    thermo.style.display = "none";
    departuresContainer.style.display = "";
  }
  // Clic sur un arrêt du thermomètre : l'état courant est gardé dans l'historique pour pouvoir y revenir.
  function jumpToStop(name, arrivalMs) {
    history.replaceState({ tp: { stop: STOP_NAME, minMs: minDepartureMs, backStop: jumpBackStop, thermo: lastThermoArgs } }, "");
    const next = { stop: name, minMs: arrivalMs, backStop: STOP_NAME, thermo: null };
    history.pushState({ tp: next }, "");
    closeThermometer();
    selectStop(name, next);
  }
  window.addEventListener("popstate", (e) => {
    const s = e.state?.tp;
    if (!s) return;
    closeThermometer();
    selectStop(s.stop, s.minMs !== null && s.backStop !== null ? s : null);
    if (s.thermo) showThermometer(...s.thermo);
  });
  jumpBanner?.addEventListener("click", () => history.back());
  // Choix dans la liste de suggestions (clic ou Entrée) : ferme aussi la liste et sort du titre.
  function chooseSuggestion(name) {
    abortPendingSuggestions();
    hideSuggestions();
    selectStop(name);
    if (stopNameEl) stopNameEl.blur();
  }
  document.getElementById("btn-refresh")?.addEventListener("click", () => fetchDepartures());

  document.getElementById("btn-gps")?.addEventListener("click", () => {
    updateUserLocation(() => {
      if (!userLocation) return;
      fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, () => {
        if (nearbyStops.length > 0) selectStop(nearbyStops[0].name);
      });
    }, true);
  });

  document.getElementById("btn-toggle-nearby")?.addEventListener("click", () => {
    const applyToggle = () => {
      if (nearbyStops.length < 2) return;
      const first = nearbyStops[0]?.name;
      const second = nearbyStops[1]?.name;
      if (!first || !second) return;
      selectStop(STOP_NAME === first ? second : first);
    };
    if (nearbyStops.length >= 2) {
      applyToggle();
    } else if (userLocation) {
      fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, applyToggle);
    }
  });
  toggleDisplayBtn?.addEventListener("click", () => {
    displayMode = displayMode === 'by-line' ? 'by-time' : 'by-line';
    saveDisplayMode(STOP_NAME, displayMode);
    updateDisplayButtonIcon();
    expandedLineKey = null;
    renderCurrentMode(lastDepartures);
  });
  if (stopNameEl) {
    stopNameEl.addEventListener("click", function() {
      const plain = stopNameEl.textContent;
      if (plain.trim() !== "") stopNameEl.textContent = "";
      updateUserLocation(function() {
        if (userLocation && stopNameEl.textContent.trim() === "") {
          fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, () => {
            showNearbyStopsSuggestions();
          });
        }
      });
      this.focus();
    });

    stopNameEl.addEventListener("input", function() {
      currentSuggestionIndex = -1;
      autoFillAllowed = false;
      const q = this.textContent.trim();
      if (q.length > 0) {
        fetchSuggestions(q);
      } else {
        abortPendingSuggestions();
        if (userLocation) {
          fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, showNearbyStopsSuggestions);
        } else {
          hideSuggestions();
        }
      }
    });

    stopNameEl.addEventListener("keydown", function(e) {
      const items = suggestionsContainer.querySelectorAll("div[data-name]");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (items.length > 0) { currentSuggestionIndex = (currentSuggestionIndex + 1) % items.length; updateSuggestionHighlight(); }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (items.length > 0) { currentSuggestionIndex = (currentSuggestionIndex - 1 + items.length) % items.length; updateSuggestionHighlight(); }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items.length > 0) {
          if (currentSuggestionIndex === -1) { currentSuggestionIndex = 0; updateSuggestionHighlight(); }
          chooseSuggestion(items[currentSuggestionIndex].getAttribute("data-name"));
        } else {
          stopNameEl.blur();
        }
      }
    });

    stopNameEl.addEventListener("blur", function() {
      abortPendingSuggestions();
      blurTimer = setTimeout(hideSuggestions, 200);
      const val = this.textContent.trim();
      if (val) selectStop(val);
    });
  }

  function updateSuggestionHighlight() {
    const items = suggestionsContainer.querySelectorAll("div[data-name]");
    items.forEach((el, idx) => el.classList.toggle("selected", idx === currentSuggestionIndex));
  }
  function hideSuggestions() {
    suggestionsContainer.innerHTML = "";
    suggestionsContainer.style.display = "none";
    currentSuggestionIndex = -1;
  }
  function showSuggestions(names) {
    if (!names.length) {
      hideSuggestions();
      return;
    }
    suggestionsContainer.innerHTML = names.map(name =>
      `<div data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>`
    ).join("");
    suggestionsContainer.style.display = "block";
    currentSuggestionIndex = -1;
  }
  function handleSuggestionPick(e) {
    const el = e.target.closest("div[data-name]");
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    chooseSuggestion(el.getAttribute("data-name"));
  }
  suggestionsContainer.addEventListener("mousedown", handleSuggestionPick);
  suggestionsContainer.addEventListener("touchstart", handleSuggestionPick);
  function showNearbyStopsSuggestions() {
    if (document.activeElement !== stopNameEl || stopNameEl.textContent.trim() !== "") return;
    showSuggestions(nearbyStops.slice(0, 5).map(s => s.name));
  }
  function hasValidCoord(s) {
    return s && s.coordinate && Number.isFinite(s.coordinate.y) && Number.isFinite(s.coordinate.x);
  }
  function fetchSuggestionsByLocation(lon, lat, callback) {
    const url = `https://transport.opendata.ch/v1/locations?x=${encodeURIComponent(lon)}&y=${encodeURIComponent(lat)}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data.stations) ? data.stations : [];
        const enriched = list
          .filter(s => hasValidCoord(s) || Number.isFinite(s.distance))
          .map(s => {
            const d = Number.isFinite(s.distance)
              ? Number(s.distance)
              : computeDistance(lat, lon, s.coordinate.y, s.coordinate.x) * 1000;
            return { id: s.id ?? null, type: (s.type || "").toLowerCase() || null, name: s.name, d };
          })
          .sort((a, b) => a.d - b.d);

        nearbyStops = enriched.filter(e => e.id && (!e.type || e.type === "station"));
        if (typeof callback === "function") callback();
      })
      .catch(err => {
        console.error("Erreur suggestions géoloc", err);
        nearbyStops = [];
        if (typeof callback === "function") callback();
      });
  }

  function fetchSuggestions(query) {
    abortPendingSuggestions();
    const controller = new AbortController();
    suggestionsController = controller;
    const signal = controller.signal;
    const isStillRelevant = () => document.activeElement === stopNameEl && stopNameEl.textContent.trim() === query;
    const url = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(query)}&type=station`;
    fetch(url, { signal })
      .then(r => r.json())
      .then(data => {
        if (!isStillRelevant()) return;
        const stations = (data.stations || [])
          .filter(s => s.id)
          .slice(0, 8);
        showSuggestions(stations.map(s => s.name));
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        console.error("Erreur suggestions", err);
      });
  }
  function updateUserLocation(cb, opts = false) {
    if (!navigator.geolocation) { if (cb) cb(); return; }

    let fresh = false, withWatch = false, quickCallback = null, finalCallback = null;
    if (typeof opts === "boolean") {
      fresh = opts;
      finalCallback = cb;
    } else if (opts && typeof opts === "object") {
      fresh = !!opts.fresh;
      withWatch = !!opts.withWatch;
      quickCallback = opts.quickCallback;
      finalCallback = cb || opts.finalCallback;
    } else {
      finalCallback = cb;
    }

    let quickDone = false, finalDone = false;
    const finishQuickOnce = () => { 
      if (!quickDone && quickCallback) { 
        quickDone = true; 
        quickCallback(); 
      } 
    };
    const finishFinalOnce = () => { 
      if (!finalDone && finalCallback) { 
        finalDone = true; 
        finalCallback(); 
      } 
    };
    const finalize = () => { 
      try { if (userLocation) saveLastFix(userLocation); } catch {} 
      finishFinalOnce(); 
    };
    const quickTimer = setTimeout(() => {
      if (userLocation) finishQuickOnce();
    }, 2000);

    navigator.geolocation.getCurrentPosition(
      pos => {
        userLocation = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        if (!quickDone) {
          clearTimeout(quickTimer);
          finishQuickOnce();
        }

        if (!withWatch) { finalize(); return; }

        let bestAcc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : Infinity;
        let watchId = null;
        const stopWatch = () => {
          if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
          }
        };

        const timeoutId = setTimeout(() => {
          stopWatch();
          finalize();
        }, 8000);

        watchId = navigator.geolocation.watchPosition(
          p => {
            const acc = Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : Infinity;
            if (acc < bestAcc) {
              bestAcc = acc;
              userLocation = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: acc };
            }
            if (bestAcc <= 50) {
              clearTimeout(timeoutId);
              stopWatch();
              finalize();
            }
          },
          _err => {
            clearTimeout(timeoutId);
            stopWatch();
            finalize();
          },
          { enableHighAccuracy: true, maximumAge: 0 }
        );
      },
      _err => { 
        clearTimeout(quickTimer);
        finalize(); 
      },
      { enableHighAccuracy: true, maximumAge: fresh ? 0 : 15000, timeout: 8000 }
    );
  }
  async function findAndFillBestStop() {
    if (!userLocation || !autoFillAllowed || STOP_NAME !== t("stopPlaceholder")) {
      return;
    }
    return new Promise((resolve) => {
      fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, async () => {
        let chosen = null;
        for (let i = 0; i < Math.min(5, nearbyStops.length); i++) {
          const candidate = nearbyStops[i].name;
          const ok = await checkDeparturesForStop(candidate);
          if (ok) { chosen = candidate; break; }
        }
        if (!chosen && nearbyStops.length > 0) chosen = nearbyStops[0].name;
        if (chosen && autoFillAllowed && STOP_NAME === t("stopPlaceholder")) selectStop(chosen);
        resolve(chosen);
      });
    });
  }
  // Destination finale du train, ou null si elle n'a pas pu être déterminée.
  async function adjustTrainDestination(dep, signal) {
    try {
      const stationKey = dep.to;

      const cached = stationDeparturesCache[stationKey];
      if (!cached || Date.now() - cached.fetchedAt > STATION_CACHE_TTL_MS) {
        const locURL = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(dep.to)}`;
        const locData = await fetch(locURL, { signal }).then(r => r.json());
        const station = locData.stations && locData.stations[0];
        if (!station) return null;

        const stationId = station.id;
        const url = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(stationId)}`;
        const data = await fetch(url, { signal }).then(r => r.json());
        stationDeparturesCache[stationKey] = { fetchedAt: Date.now(), board: data.stationboard || [] };
      }

      const departures = stationDeparturesCache[stationKey].board;
      const currentName = dep.name;
      let found = false;

      for (const other of departures) {
        if (other.name === currentName) {
          found = true;
          if (other.to && other.to !== dep.to && !isSwissStation(other.to)) {
            if (!trainPassListCache[currentName]) {
              try {
                const connURL = `https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(dep.to)}&to=${encodeURIComponent(other.to)}&limit=1`;
                const connData = await fetch(connURL, { signal }).then(r => r.json());
                const conn = (connData.connections || [])[0];

                if (conn && Array.isArray(conn.sections)) {
                  for (const section of conn.sections) {
                    if (section.journey && section.journey.name === currentName && Array.isArray(section.journey.passList)) {
                      trainPassListCache[currentName] = section.journey.passList;
                      break;
                    }
                  }
                }
              } catch (e) {
                if (e.name !== "AbortError") console.error(`Erreur récupération passList pour train ${currentName}`, e);
              }
            }

            return other.to;
          }
        }
      }
      return found ? dep.to : null;
    } catch (e) {
      if (e.name !== "AbortError") console.error("Ajustement destination", dep.to, e);
    }
    return null;
  }

  async function checkDeparturesForStop(stopNameCandidate) {
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(stopNameCandidate)}&limit=${STATIONBOARD_LIMIT}`;
    try {
      const data = await fetch(API_URL).then(r => r.json());
      const departures = data.stationboard || [];
      const now = Date.now();
      return departures.some(dep => toDepartureInfo(dep, now) !== null);
    } catch {
      return false;
    }
  }
  function buildLineFilter(lines, departures) {
    filterBox.innerHTML = `
      <div id="select-all-container" style="display:flex;gap:12px;margin-bottom:10px;">
        <button id="select-all" type="button" class="filter-toggle-btn" data-i18n-aria="selectAll" aria-label="${t("selectAll")}">
          <input type="checkbox" checked disabled>
        </button>
        <button id="deselect-all" type="button" class="filter-toggle-btn" data-i18n-aria="deselectAll" aria-label="${t("deselectAll")}">
          <input type="checkbox" disabled>
        </button>
      </div>
      <div id="checkboxes-container"></div>
    `;
    filterModal.ensureClose();

    const checkboxesContainer = filterBox.querySelector("#checkboxes-container");
    lines.forEach(line => {
      const [category, ...numParts] = line.split(" ");
      const number = numParts.join(" ").trim();
      const firstDep = departures.find(d => lineKeyOf(d) === line);
      const badgeInfo = getLineBadge(category, number, firstDep?.operator);
      const checked = selectedLines.has(line);

      const item = document.createElement("label");
      item.className = "filter-item line-filter-item";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = line;
      input.checked = checked;
      input.className = "line-checkbox visually-hidden-checkbox";

      const badge = createLineBadge(badgeInfo);
      if (!checked) badge.classList.add("line-badge-off");

      item.appendChild(input);
      item.appendChild(badge);
      checkboxesContainer.appendChild(item);
    });

    filterBox.querySelectorAll(".line-checkbox").forEach(cb => {
      cb.addEventListener("change", () => {
        if (cb.checked) selectedLines.add(cb.value);
        else selectedLines.delete(cb.value);
        cb.nextElementSibling?.classList.toggle("line-badge-off", !cb.checked);
        renderCurrentMode(departures);
      });
    });
    filterBox.querySelector("#select-all")?.addEventListener("click", () => {
      lines.forEach(l => selectedLines.add(l));
      filterBox.querySelectorAll(".line-checkbox").forEach(cb => {
        cb.checked = true;
        cb.nextElementSibling?.classList.remove("line-badge-off");
      });
      renderCurrentMode(departures);
    });
    filterBox.querySelector("#deselect-all")?.addEventListener("click", () => {
      selectedLines.clear();
      filterBox.querySelectorAll(".line-checkbox").forEach(cb => {
        cb.checked = false;
        cb.nextElementSibling?.classList.add("line-badge-off");
      });
      renderCurrentMode(departures);
    });
  }

  async function fetchDepartures() {
    const key = STOP_NAME;
    if (!key || String(key).trim() === "") return;
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(key)}&limit=${STATIONBOARD_LIMIT}`;
    if (currentFetchController && !currentFetchController.signal.aborted) currentFetchController.abort();
    const controller = new AbortController();
    currentFetchController = controller;
    const signal = controller.signal;
    try {
      const data = await fetch(API_URL, { signal }).then(r => r.json());
      if (signal.aborted) return;
      let departures = (data && data.stationboard) ? data.stationboard : [];
      lastDepartures = departures;

      const lines = [...new Set(departures.map(lineKeyOf))];
      lines.sort(compareLineKeys);
      if (selectedLines.size === 0) lines.forEach(l => selectedLines.add(l));

      const needsDestinationCheck = dep =>
        !hasComma(STOP_NAME) &&
        dep.to &&
        !isSwissStation(dep.to) &&
        lineColors.categories.trains.includes(dep.category);

      // Destinations déjà vérifiées appliquées avant le premier affichage ; les autres restent en attente (italique/sablier).
      const toVerify = [];
      departures.forEach(dep => {
        if (!needsDestinationCheck(dep)) return;
        const key = dep.name ? `${dep.name}|${dep.to}` : null;
        if (key && verifiedDestinations.has(key)) {
          dep.to = verifiedDestinations.get(key);
        } else {
          dep.destinationPending = true;
          toVerify.push({ dep, key });
        }
      });
      renderInBackground(departures);
      buildLineFilter(lines, departures);

      if (toVerify.length) {
        await Promise.all(toVerify.map(async ({ dep, key }) => {
          const adjusted = await adjustTrainDestination(dep, signal);
          if (!adjusted) return;
          if (key) verifiedDestinations.set(key, adjusted);
          dep.to = adjusted;
        }));
        if (signal.aborted) return;
        toVerify.forEach(({ dep }) => { dep.destinationPending = false; });
        renderInBackground(departures);
      }

      const now = new Date();
      if (lastUpdateElement) {
        lastUpdateElement.textContent = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      }
    } catch (e) {
      if (e.name === "AbortError") return;
      console.error("Erreur chargement départs", e);
      departuresContainer.innerHTML = `<p>${t("loadError")}</p>`;
    } finally {
      if (currentFetchController === controller) currentFetchController = null;
    }
  }

  function renderCurrentMode(departures) {
    if (displayMode === 'by-line') {
      renderDepartures(departures);
    } else {
      renderDeparturesByTime(departures);
    }
  }

  // Garde le thermomètre ouvert s'il concerne l'arrêt affiché (les autres rendus le ferment).
  function renderInBackground(departures) {
    const keepThermo = thermo && thermo.style.display === "block" && thermo.dataset.stop === STOP_NAME;
    renderCurrentMode(departures);
    if (keepThermo) {
      departuresContainer.style.display = "none";
      thermo.style.display = "block";
    }
  }

  const AIRPORTS = ["Zürich Flughafen", "Genève-Aéroport"];
  function fillDestination(el, dest, pending) {
    const text = formatStopNameHTML(dest) + (AIRPORTS.includes(dest) ? " ✈" : "");
    const hourglass = pending ? ' <span class="pending-hourglass" aria-hidden="true">⏳</span>' : "";
    el.innerHTML = `<span class="marquee-inner">${text}${hourglass}</span>`;
    if (pending) el.classList.add("destination-pending");
  }

  function delayHTML(delay) {
    if (appSettings.showDelay && delay !== null && Math.abs(delay) >= appSettings.delayShowThresholdMin) {
      const d = Math.abs(delay);
      const sign = delay >= 0 ? "+" : "-";
      return d >= appSettings.delayRedThresholdMin ? ` <span class="late">${sign}${d}'</span>` : ` ${sign}${d}'`;
    }
    return "";
  }

  const filterModal = setupModal({ box: filterBox, toggleBtn: toggleFilterBtn, closeId: "filter-close", bodyClass: "filters-open" });
  const settingsModal = setupModal({ box: settingsBox, toggleBtn: btnSettings, closeId: "settings-close", bodyClass: "settings-open" });
  function renderSettingsBox() {
    if (!settingsBox) return;
    settingsBox.innerHTML = `
      <div class="settings-section">
        <h3>${t("autoRefresh")}</h3>
        <label class="filter-item"><input type="radio" name="refresh-interval" value="30000"> ${t("seconds30")}</label>
        <label class="filter-item"><input type="radio" name="refresh-interval" value="60000"> ${t("minute1")}</label>
      </div>
      <div class="settings-section">
        <h3>${t("delays")}</h3>
        <label class="filter-item"><input type="checkbox" id="setting-show-delay"> ${t("showDelay")}</label>
        <label class="settings-field">
          ${t("showFrom")} <input type="text" inputmode="numeric" pattern="[0-9]*" id="setting-delay-show-threshold" class="inline-value-input" aria-label="${t("showThresholdLabel")}"> min
        </label>
        <label class="settings-field">
          ${t("redFrom")} <input type="text" inputmode="numeric" pattern="[0-9]*" id="setting-delay-red-threshold" class="inline-value-input" aria-label="${t("redThresholdLabel")}"> min
        </label>
      </div>
      <div class="settings-section">
        <h3>${t("theme")}</h3>
        ${THEME_CHOICES.map(choice =>
          `<label class="filter-item"><input type="radio" name="theme" value="${choice}"> ${t("theme_" + choice)}</label>`
        ).join("")}
      </div>
      <div class="settings-section">
        <h3>${t("language")}</h3>
        ${Object.entries(LANGUAGES).map(([code, name]) =>
          `<label class="filter-item"><input type="radio" name="language" value="${code}"> ${name}</label>`
        ).join("")}
      </div>
      <div class="settings-footer">
        <p>${t("legalNotice")}</p>
        <details>
          <summary>${t("privacyTitle")}</summary>
          <p>${t("privacyText")}</p>
        </details>
      </div>
    `;
    settingsModal.ensureClose();

    settingsBox.querySelectorAll('input[name="theme"]').forEach(r => {
      r.checked = r.value === appSettings.theme;
      r.addEventListener("change", () => {
        appSettings.theme = r.value;
        saveAppSettings(appSettings);
        setThemePreference(r.value);
      });
    });

    settingsBox.querySelectorAll('input[name="language"]').forEach(r => {
      r.checked = r.value === appSettings.language;
      r.addEventListener("change", () => changeLanguage(r.value));
    });

    settingsBox.querySelectorAll('input[name="refresh-interval"]').forEach(r => {
      r.checked = Number(r.value) === appSettings.refreshMs;
      r.addEventListener("change", () => {
        appSettings.refreshMs = Number(r.value);
        saveAppSettings(appSettings);
        startRefreshTimer();
      });
    });

    const showDelayCb = settingsBox.querySelector("#setting-show-delay");
    showDelayCb.checked = appSettings.showDelay;
    showDelayCb.addEventListener("change", () => {
      appSettings.showDelay = showDelayCb.checked;
      saveAppSettings(appSettings);
      renderInBackground(lastDepartures);
    });

    function setupInlineValueInput(input, onCommit) {
      input.addEventListener("focus", () => input.select());
      input.addEventListener("input", () => {
        input.value = input.value.replace(/[^0-9]/g, "");
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
      input.addEventListener("change", () => {
        const v = Math.max(0, Math.round(Number(input.value)) || 0);
        input.value = v;
        onCommit(v);
      });
    }

    const showThresholdInput = settingsBox.querySelector("#setting-delay-show-threshold");
    showThresholdInput.value = appSettings.delayShowThresholdMin;
    setupInlineValueInput(showThresholdInput, (v) => {
      appSettings.delayShowThresholdMin = v;
      saveAppSettings(appSettings);
      renderInBackground(lastDepartures);
    });

    const redThresholdInput = settingsBox.querySelector("#setting-delay-red-threshold");
    redThresholdInput.value = appSettings.delayRedThresholdMin;
    setupInlineValueInput(redThresholdInput, (v) => {
      appSettings.delayRedThresholdMin = v;
      saveAppSettings(appSettings);
      renderInBackground(lastDepartures);
    });
  }
  renderSettingsBox();

  // Changement de langue : textes de la page, menu réglages, bandeau de retour et départs affichés.
  function changeLanguage(lang) {
    const showingPlaceholder = STOP_NAME === t("stopPlaceholder");
    appSettings.language = lang;
    saveAppSettings(appSettings);
    setLanguage(lang);
    applyStaticTexts();
    if (stopNameEl) {
      stopNameEl.dataset.placeholder = t("stopPlaceholder");
      if (showingPlaceholder) {
        STOP_NAME = t("stopPlaceholder");
        stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
      }
    }
    renderSettingsBox();
    updateJumpBanner();
    renderInBackground(lastDepartures);
  }

  function isMobileDevice() {
    return window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function enterFullscreen() {
    if (isMobileDevice()) {
      document.body.classList.add("fullscreen");
    } else {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
      document.body.classList.add("fullscreen");
    }
  }

  function exitFullscreen() {
    if (isMobileDevice()) {
      document.body.classList.remove("fullscreen");
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen();
      }
      document.body.classList.remove("fullscreen");
    }
  }

  const fullscreenToggleBtn = document.getElementById("fullscreen-toggle");
  fullscreenToggleBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (document.body.classList.contains("fullscreen")) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  });

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove("fullscreen");
    }
  });

  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("fullscreen")) return;
    if (!isMobileDevice()) return;

    const interactiveElements = [
      ".line-card", ".departure-card", ".departure-item", ".line-checkbox", 
      "#quick-actions button", "#thermo-back", ".thermo-row-link", "#jump-back",
      "#stop-name", "#stop-suggestions div",
      "#fullscreen-toggle"
    ];
    
    const isInteractive = interactiveElements.some(selector => 
      e.target.closest(selector)
    );

    if (!isInteractive) {
      exitFullscreen();
    }
  });

  function resetDeparturesView(timeMode) {
    clearMarqueeTimers(departureMarqueeTimers);
    departuresContainer.innerHTML = "";
    departuresContainer.classList.toggle("time-mode", timeMode);
    if (thermo) thermo.style.display = "none";
    departuresContainer.style.display = "";
  }

  // Défilement en boucle des noms de destination/arrêt trop longs pour leur espace,
  // avec une pause de 2s à chaque retour au premier caractère.
  // Deux registres séparés (cartes / thermomètre) pour qu'ouvrir l'un n'arrête pas l'autre en arrière-plan.
  let departureMarqueeTimers = [];
  let thermoMarqueeTimers = [];
  function clearMarqueeTimers(bucket) {
    bucket.forEach(clearTimeout);
    bucket.length = 0;
  }
  function setupMarquee(container, bucket) {
    const inner = container.querySelector(".marquee-inner");
    if (!inner) return;
    const overflow = Math.round(inner.scrollWidth - container.clientWidth);
    if (overflow <= 1) return;
    const msPerChar = 150; // vitesse : temps par caractère, uniforme quelle que soit la longueur du texte
    const pauseMs = 2000;
    const charCount = Math.max(1, inner.textContent.length);

    // Boucle continue : texte, 3 espaces, puis le même texte à nouveau.
    // On défile jusqu'à ce que la 2e copie arrive à la position de départ de la 1re (visuellement identique),
    // ce qui permet de reboucler sans à-coup après la pause.
    const originalHTML = inner.innerHTML;
    inner.innerHTML = `<span class="marquee-copy">${originalHTML}</span><span class="marquee-gap">&nbsp;&nbsp;&nbsp;</span><span class="marquee-copy">${originalHTML}</span>`;
    const secondCopy = inner.children[2];
    const distance = secondCopy.offsetLeft;
    const scrollMs = charCount * msPerChar;

    function cycle() {
      inner.style.transition = "none";
      inner.style.transform = "translateX(0)";
      const holdTimer = setTimeout(() => {
        inner.style.transition = `transform ${scrollMs}ms linear`;
        inner.style.transform = `translateX(-${distance}px)`;
      }, pauseMs);
      const loopTimer = setTimeout(cycle, pauseMs + scrollMs);
      bucket.push(holdTimer, loopTimer);
    }
    cycle();
  }
  function setupMarquees(root, bucket) {
    requestAnimationFrame(() => {
      root.querySelectorAll(".departure-destination, .thermo-stop").forEach(el => setupMarquee(el, bucket));
    });
  }

  function renderDepartures(departures) {
    resetDeparturesView(false);

    const filtered = departures.filter(dep => selectedLines.has(lineKeyOf(dep)));
    const groupedByLine = {};
    const nowMs = Date.now();

    filtered.forEach(dep => {
      const key = lineKeyOf(dep);
      if (!groupedByLine[key]) groupedByLine[key] = {};
      const dest = dep.to || "";
      if (!groupedByLine[key][dest]) groupedByLine[key][dest] = [];
      const info = toDepartureInfo(dep, nowMs);
      if (info && isAfterMinDeparture(info)) groupedByLine[key][dest].push(info);
    });

    const filteredLines = Object.entries(groupedByLine).filter(([, destinations]) => {
      return Object.values(destinations).some(times => times.length > 0);
    });

    const sortedLines = filteredLines.sort(([a], [b]) => compareLineKeys(a, b));

    for (const [lineKey, destinations] of sortedLines) {
      const [category, ...numParts] = lineKey.split(" ");
      const number = numParts.join(" ").trim();
      const firstDep = Object.values(destinations)[0]?.[0]?.dep;
      const badge = getLineBadge(category, number, firstDep?.operator);

      const card = document.createElement("div");
      card.className = "line-card";
      card.dataset.lineKey = lineKey;

      const lineRow = document.createElement("div");
      lineRow.className = "line-row";
      lineRow.appendChild(createLineBadge(badge));
      card.appendChild(lineRow);

      const isExpanded = expandedLineKey === lineKey;
      if (!isExpanded) card.classList.add("compact");

      for (const [dest, times] of Object.entries(destinations)) {
        if (!times.length) continue;
        const destDiv = document.createElement("div");
        destDiv.className = "destination-title";
        fillDestination(destDiv, dest, times.some(o => o.dep.destinationPending));
        card.appendChild(destDiv);

        if (isExpanded) {
          const list = document.createElement("div");
          list.className = "departure-times";
          list.innerHTML = times.slice(0, 5).map(o => {
            const pl = o.platform ? ` ${t("platform")} ${escapeHtml(o.platform)}` : "";
            return `<span class="departure-item" data-dest="${escapeHtml(dest)}" data-time="${o.timeStr}" data-train="${escapeHtml(o.trainName || '')}">${o.timeStr}${delayHTML(o.delay)} (${o.minutesLeft} min)${pl}</span>`;
          }).join("");
          card.appendChild(list);
        } else {
          const strip = document.createElement("div");
          strip.className = "countdown-strip";
          const mins = times.map(o => o.minutesLeft).sort((a,b)=>a-b).slice(0,5);
          strip.innerHTML = mins.map((m, i) => `<span class="cd${i===0?' first':''}">${m}'</span>`).join("");
          card.appendChild(strip);
        }
      }

      if (isExpanded) {
        card.addEventListener("click", (e) => {
          const depEl = e.target.closest(".departure-item");
          if (!depEl) {
            expandedLineKey = null;
            renderDepartures(departures);
            return;
          }
          const dest = depEl.getAttribute("data-dest");
          const timeStr = depEl.getAttribute("data-time");
          const trainName = depEl.getAttribute("data-train");
          showThermometer(STOP_NAME, dest, timeStr, badge.label, trainName);
        });
      } else {
        card.addEventListener("click", () => {
          expandedLineKey = lineKey;
          renderDepartures(departures);
        });
      }

      departuresContainer.appendChild(card);
    }
  }

  function renderDeparturesByTime(departures) {
    resetDeparturesView(true);

    const filtered = departures.filter(dep => selectedLines.has(lineKeyOf(dep)));
    const nowMs = Date.now();
    const allDepartures = filtered.map(dep => toDepartureInfo(dep, nowMs)).filter(info => info && isAfterMinDeparture(info));

    allDepartures.sort((a, b) => a.effMs - b.effMs);

    allDepartures.forEach(({ dep, timeStr, minutesLeft, platform, delay }) => {
      const destination = dep.to || "";
      const trainName = dep.name || "";
      const badge = getLineBadge(dep.category || "", dep.number || "", dep.operator);

      const card = document.createElement("div");
      card.className = "departure-card";
      card.appendChild(createLineBadge(badge));

      const infoDiv = document.createElement("div");
      infoDiv.className = "departure-info";

      const timeSpan = document.createElement("span");
      timeSpan.className = "departure-time";
      timeSpan.innerHTML = `${timeStr}${delayHTML(delay)}`;
      infoDiv.appendChild(timeSpan);

      const countdownSpan = document.createElement("span");
      countdownSpan.className = "departure-countdown";
      countdownSpan.textContent = `(${minutesLeft} min)`;
      infoDiv.appendChild(countdownSpan);

      const destSpan = document.createElement("span");
      destSpan.className = "departure-destination";
      fillDestination(destSpan, destination, dep.destinationPending);
      infoDiv.appendChild(destSpan);

      if (platform) {
        const platformSpan = document.createElement("span");
        platformSpan.className = "departure-platform";
        platformSpan.textContent = `${t("platform")} ${platform}`;
        infoDiv.appendChild(platformSpan);
      }

      card.appendChild(infoDiv);

      card.addEventListener("click", () => {
        showThermometer(STOP_NAME, destination, timeStr, badge.label, trainName);
      });

      departuresContainer.appendChild(card);
    });
    setupMarquees(departuresContainer, departureMarqueeTimers);
  }

  async function showThermometer(fromName, toName, hhmm, lineLabel, trainName) {
    if (!thermo) return;
    try {
      let passList = [];

      if (trainName && trainPassListCache[trainName]) {
        const cachedPassList = trainPassListCache[trainName];
        const intermediateStation = cachedPassList[0]?.station?.name;

        if (intermediateStation && intermediateStation !== fromName) {
          const conn = await fetchFirstConnection(fromName, intermediateStation, hhmm);
          let firstSegment = [];

          if (conn && Array.isArray(conn.sections)) {
            for (const section of conn.sections) {
              if (section.journey && Array.isArray(section.journey.passList) && section.journey.passList.length > 0) {
                if (firstSegment.length === 0) {
                  firstSegment = [...section.journey.passList];
                } else {
                  const sectionStops = [...section.journey.passList];
                  sectionStops.shift();
                  firstSegment.push(...sectionStops);
                }
              }
            }
          }

          if (firstSegment.length > 0) {
            firstSegment.pop();
          }
          passList = [...firstSegment, ...cachedPassList];
        } else {
          passList = cachedPassList;
        }
      } else {
        const conn = await fetchFirstConnection(fromName, toName, hhmm);
        if (conn && Array.isArray(conn.sections)) {
          const vehicleSection = conn.sections.find(s => s.journey && Array.isArray(s.journey.passList));
          if (vehicleSection) passList = vehicleSection.journey.passList;
        }
      }

      const header = thermo.querySelector("#thermo-title");
      header.textContent = `${fromName} → ${toName}`;
      const body = thermo.querySelector("#thermo-body");
      clearMarqueeTimers(thermoMarqueeTimers);
      body.innerHTML = "";

      if (!passList || passList.length === 0) {
        body.innerHTML = `<p>${t("noData")}</p>`;
      } else {
        const nowMs = Date.now();
        passList.forEach(p => {
          const name = p.station?.name || "";
          const sched = p.departure || p.arrival;
          const delay = Number(p.departureDelay ?? p.arrivalDelay ?? p.delay ?? 0);
          const t = sched ? new Date(sched) : null;
          const effMs = t ? withDelay(t.getTime(), delay) : null;
          const minutesLeft = effMs ? minutesUntil(effMs, nowMs) : null;

          const row = document.createElement("div");
          row.className = "thermo-row";
          const tdiv = document.createElement("div");
          tdiv.className = "thermo-time";
          if (t) {
            // Avances/retards selon les réglages, comme sur les cartes de départ.
            const minTxt = minutesLeft !== null ? ` (${minutesLeft} min)` : "";
            tdiv.innerHTML = `${fmtHM(t)}${delayHTML(delay)}${minTxt}`;
          } else {
            tdiv.textContent = "—";
          }
          const nd = document.createElement("div");
          nd.className = "thermo-stop";
          nd.innerHTML = `<span class="marquee-inner">${escapeHtml(name)}</span>`;
          row.appendChild(tdiv);
          row.appendChild(nd);
          body.appendChild(row);
        });

        const idx = passList.findIndex(p => (p.station?.name || "").toLowerCase() === fromName.toLowerCase());
        if (idx >= 0) {
          const target = body.children[idx];
          target?.scrollIntoView({ block: "center" });

          // Arrêts suivants cliquables : ouvre leurs départs à partir de l'heure d'arrivée du trajet.
          passList.forEach((p, i) => {
            if (i <= idx) return;
            const name = p.station?.name;
            const arrSched = p.arrival || p.departure;
            if (!name || !arrSched) return;
            const arrivalMs = withDelay(new Date(arrSched).getTime(), Number(p.arrivalDelay ?? p.delay ?? p.departureDelay ?? 0));
            if (!Number.isFinite(arrivalMs)) return;
            const row = body.children[i];
            row.classList.add("thermo-row-link");
            row.addEventListener("click", () => jumpToStop(name, arrivalMs));
          });
        }
        setupMarquees(body, thermoMarqueeTimers);
      }

      departuresContainer.style.display = "none";
      thermo.style.display = "block";
      thermo.dataset.stop = fromName;
      lastThermoArgs = [fromName, toName, hhmm, lineLabel, trainName];
    } catch (e) {
      console.error("Thermomètre erreur", e);
    }
  }

  (async () => {
    const cached = loadLastFix();
    if (cached) {
      fetchSuggestionsByLocation(cached.lon, cached.lat, () => {});
    }

    if (STOP_NAME === t("stopPlaceholder")) {
      updateUserLocation(
        () => findAndFillBestStop(),
        {
          fresh: true,
          withWatch: true,
          quickCallback: () => findAndFillBestStop()
        }
      );
    } else {
      fetchDepartures();
    }
    startRefreshTimer();
  })();
});