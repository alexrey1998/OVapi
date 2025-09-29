// script.js - Version 2025.09.29_20.16
import { lineColors } from "./colors.js";
import { settings } from "./settings.js";

/* ---------- Helpers paramétrables ---------- */
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

/* ---------- Données Suisses (CSV) ---------- */
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

/* ---------- Utilitaires ---------- */
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

/* Mesure de texte pour ajuster le padding horizontal des badges */
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
  } catch { /* ignorer */ }
}

/* ---------- Application ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Bannière
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

  // Eléments
  const stopNameEl = document.getElementById("stop-name");
  const suggestionsContainer = document.getElementById("stop-suggestions");
  const departuresContainer = document.getElementById("departures");
  const lastUpdateElement = document.getElementById("update-time");
  const filterBox = document.getElementById("line-filter-box");
  const toggleFilterBtn = document.getElementById("toggle-filter");

  // Thermomètre
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

  // Etat
  let STOP_NAME = stopNameEl ? (stopNameEl.textContent?.trim() || "Entrez le nom de l'arrêt ici") : "Entrez le nom de l'arrêt ici";
  if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
  let currentSuggestionIndex = -1;
  let userLocation = null; // { lat, lon, accuracy? }
  let selectedLines = new Set();
  let expandedLineKey = null;

  // Anti-écrasement H1 par la géoloc auto
  let autoFillAllowed = true;

  // Cache position
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

  // Listes proches
  let nearbyRaw = [];   // résultats complets de /locations triés par distance
  let nearbyStops = []; // seulement stations avec id, triées par distance

  // Quick-actions
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
    }, true); // frais, pas de watch ici
  });

  document.getElementById("btn-toggle-nearby")?.addEventListener("click", () => {
    const applyToggle = () => {
      if (nearbyStops.length < 2) return;
      const first = nearbyStops[0]?.name;
      const second = nearbyStops[1]?.name;
      if (!first || !second) return;
      STOP_NAME = (STOP_NAME === first) ? second : first;
      if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
      selectedLines.clear();
      expandedLineKey = null;
      try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
      fetchDepartures();
    };
    if (nearbyStops.length >= 2) {
      applyToggle();
    } else if (userLocation) {
      fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, applyToggle);
    }
  });

  // Saisie nom d'arrêt + suggestions
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
      }); // position suffisante pour l'autocomplétion
      this.focus();
    });

    stopNameEl.addEventListener("input", function() {
      currentSuggestionIndex = -1;
      autoFillAllowed = false; // l'utilisateur saisit → ne pas écraser H1
      const q = this.textContent.trim();
      if (q.length > 0) {
        fetchSuggestions(q);
      } else {
        if (userLocation) {
          fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, showNearbyStopsSuggestions);
        } else {
          suggestionsContainer.innerHTML = "";
          suggestionsContainer.style.display = "none";
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
          const chosenName = items[currentSuggestionIndex].getAttribute("data-name");
          STOP_NAME = chosenName;
          stopNameEl.innerHTML = formatStopNameHTML(chosenName);
          selectedLines.clear();
          suggestionsContainer.innerHTML = "";
          suggestionsContainer.style.display = "none";
          currentSuggestionIndex = -1;
          autoFillAllowed = false;
          try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
          fetchDepartures();
          stopNameEl.blur();
        } else {
          stopNameEl.blur();
        }
      }
    });

    stopNameEl.addEventListener("blur", function() {
      setTimeout(() => {
        suggestionsContainer.innerHTML = "";
        suggestionsContainer.style.display = "none";
        currentSuggestionIndex = -1;
      }, 200);
      const val = this.textContent.trim();
      if (val) {
        STOP_NAME = val;
        stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
        selectedLines.clear();
        autoFillAllowed = false;
        try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
        fetchDepartures();
      }
    });
  }

  function updateSuggestionHighlight() {
    const items = suggestionsContainer.querySelectorAll("div[data-name]");
    items.forEach((el, idx) => el.classList.toggle("selected", idx === currentSuggestionIndex));
  }

  function showNearbyStopsSuggestions() {
    if (document.activeElement !== stopNameEl || stopNameEl.textContent.trim() !== "") return;
    if (!nearbyStops.length) {
      suggestionsContainer.innerHTML = "";
      suggestionsContainer.style.display = "none";
      return;
    }
    suggestionsContainer.innerHTML = nearbyStops.slice(0, 5).map(s =>
      `<div data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`
    ).join("");
    suggestionsContainer.style.display = "block";
    currentSuggestionIndex = -1;
    suggestionsContainer.querySelectorAll("div[data-name]").forEach((el) => {
      el.addEventListener("mousedown", () => {
        const chosenName = el.getAttribute("data-name");
        STOP_NAME = chosenName;
        if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(chosenName);
        selectedLines.clear();
        suggestionsContainer.innerHTML = "";
        suggestionsContainer.style.display = "none";
        currentSuggestionIndex = -1;
        autoFillAllowed = false;
        try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
        fetchDepartures();
      });
    });
  }

  /* ===== Suggestions géolocalisées ===== */
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

        nearbyRaw = enriched;
        nearbyStops = enriched.filter(e => e.id && (!e.type || e.type === "station"));
        if (typeof callback === "function") callback();
      })
      .catch(err => {
        console.error("Erreur suggestions géoloc", err);
        nearbyRaw = [];
        nearbyStops = [];
        if (typeof callback === "function") callback();
      });
  }

  function fetchSuggestions(query) {
    const url = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(query)}&type=station`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        const stations = (data.stations || [])
          .filter(s => s.id)
          .slice(0, 8);
        if (stations.length > 0) {
          suggestionsContainer.innerHTML = stations.map(s => `<div data-name="${escapeHtml(s.name)}">${escapeHtml(s.name)}</div>`).join("");
          suggestionsContainer.style.display = "block";
          currentSuggestionIndex = -1;
          suggestionsContainer.querySelectorAll("div[data-name]").forEach((el) => {
            el.addEventListener("mousedown", function() {
              const chosenName = el.getAttribute("data-name");
              STOP_NAME = chosenName;
              stopNameEl.innerHTML = formatStopNameHTML(chosenName);
              selectedLines.clear();
              suggestionsContainer.innerHTML = "";
              suggestionsContainer.style.display = "none";
              currentSuggestionIndex = -1;
              autoFillAllowed = false;
              try { localStorage.setItem("lastUserStop", STOP_NAME); } catch {}
              fetchDepartures();
            });
          });
        } else {
          suggestionsContainer.innerHTML = "";
          suggestionsContainer.style.display = "none";
          currentSuggestionIndex = -1;
        }
      })
      .catch(err => console.error("Erreur suggestions", err));
  }

  /* ===== Géoloc fraîche + amélioration par watch (version améliorée) ===== */
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

    // Timer pour callback rapide (2 secondes max)
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

        // Déclencher callback rapide si pas encore fait
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
        }, 8000); // timeout total à 8 secondes

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

  // Fonction d'assistance pour le remplissage d'arrêt
  async function findAndFillBestStop() {
    if (!userLocation || !autoFillAllowed || STOP_NAME !== "Entrez le nom de l'arrêt ici") {
      return;
    }

    // Récupérer suggestions basées sur position
    return new Promise((resolve) => {
      fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, async () => {
        // Chercher le 1er arrêt avec des départs
        let chosen = null;
        for (let i = 0; i < Math.min(5, nearbyStops.length); i++) {
          const candidate = nearbyStops[i].name;
          const ok = await checkDeparturesForStop(candidate);
          if (ok) { chosen = candidate; break; }
        }
        if (!chosen && nearbyStops.length > 0) chosen = nearbyStops[0].name;

        // Vérifier à nouveau si toujours autorisé
        if (chosen && autoFillAllowed && STOP_NAME === "Entrez le nom de l'arrêt ici") {
          STOP_NAME = chosen;
          if (stopNameEl) stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
          fetchDepartures();
        }
        resolve(chosen);
      });
    });
  }

  // Ajustement destination trains internationaux
  async function adjustTrainDestination(dep) {
    const locURL = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(dep.to)}`;
    try {
      const locData = await fetch(locURL).then(r => r.json());
      const station = locData.stations && locData.stations[0];
      if (!station) return null;
      const stationId = station.id;
      const url = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(stationId)}&limit=5`;
      const data = await fetch(url).then(r => r.json());
      const departures = data.stationboard || [];
      const currentName = parseInt(dep.name);
      for (const other of departures) {
        const otherName = parseInt(other.name);
        if (otherName === currentName || otherName === currentName + 1) {
          if (other.to && other.to !== dep.to && !isSwissStation(other.to)) return other.to;
        }
      }
    } catch (e) {
      console.error("Ajustement destination", dep.to, e);
    }
    return null;
  }

  async function checkDeparturesForStop(stopNameCandidate) {
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(stopNameCandidate)}&limit=${STATIONBOARD_LIMIT}`;
    try {
      const data = await fetch(API_URL).then(r => r.json());
      const departures = data.stationboard || [];
      const now = Date.now();
      return departures.some(dep => {
        const sched = new Date(dep.stop?.departure).getTime();
        const delay = Number(dep.stop?.delay || 0);
        const eff = Number.isFinite(sched) ? sched + (Number.isFinite(delay) ? delay * 60000 : 0) : NaN;
        return Number.isFinite(eff) && (eff - now) <= DISPLAY_WINDOW_MS;
      });
    } catch {
      return false;
    }
  }

  // Récupération + rendu
  async function fetchDepartures() {
    const key = STOP_NAME;
    if (!key || String(key).trim() === "") return;
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(key)}&limit=${STATIONBOARD_LIMIT}`;
    try {
      const data = await fetch(API_URL).then(r => r.json());
      let departures = (data && data.stationboard) ? data.stationboard : [];

      await Promise.all(departures.map(async dep => {
        if (dep.category === "T" && dep.to && dep.to.indexOf(",") === -1 && !isSwissStation(dep.to)) {
          const adjusted = await adjustTrainDestination(dep);
          if (adjusted) dep.to = adjusted;
        }
      }));

      const lines = [...new Set(departures.map(dep => `${dep.category || ""} ${dep.number || ""}`))];
      lines.sort((a, b) => {
        const numA = a.split(" ").pop();
        const numB = b.split(" ").pop();
        const isNumA = !isNaN(numA);
        const isNumB = !isNaN(numB);
        if (isNumA && isNumB) return parseInt(numA) - parseInt(numB);
        if (isNumA) return -1;
        if (isNumB) return 1;
        return numA.localeCompare(numB);
      });
      if (selectedLines.size === 0) lines.forEach(l => selectedLines.add(l));

      filterBox.innerHTML = `
        <div id="select-all-container" style="display:flex;gap:8px;margin-bottom:8px;">
          <button id="select-all">Sélectionner tout</button>
          <button id="deselect-all">Désélectionner tout</button>
        </div>
        <div id="checkboxes-container">
          ${lines.map(line => {
            const checked = selectedLines.has(line) ? "checked" : "";
            return `<label class="filter-item">
              <input type="checkbox" value="${escapeHtml(line)}" ${checked} class="line-checkbox"> Ligne ${escapeHtml(line)}
            </label>`;
          }).join("")}
        </div>
      `;
      ensureFilterClose();
      filterBox.querySelectorAll(".line-checkbox").forEach(cb => {
        cb.addEventListener("change", () => {
          if (cb.checked) selectedLines.add(cb.value);
          else selectedLines.delete(cb.value);
          renderDepartures(departures);
        });
      });
      filterBox.querySelector("#select-all")?.addEventListener("click", () => {
        lines.forEach(l => selectedLines.add(l));
        filterBox.querySelectorAll(".line-checkbox").forEach(cb => cb.checked = true);
        renderDepartures(departures);
      });
      filterBox.querySelector("#deselect-all")?.addEventListener("click", () => {
        selectedLines.clear();
        filterBox.querySelectorAll(".line-checkbox").forEach(cb => cb.checked = false);
        renderDepartures(departures);
      });

      renderDepartures(departures);
      const now = new Date();
      if (lastUpdateElement) {
        lastUpdateElement.textContent = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      }
    } catch (e) {
      console.error("Erreur chargement départs", e);
      departuresContainer.innerHTML = "<p>Erreur de chargement</p>";
    }
  }

  function closeFilterModal() {
    document.body.classList.remove("filters-open");
    filterBox.classList.remove("modal-open");
    if (!filterBox.classList.contains("hidden")) filterBox.classList.add("hidden");
  }
  function ensureFilterClose() {
    let btn = document.getElementById("filter-close");
    if (!btn || btn.parentElement !== filterBox) {
      if (btn && btn.parentElement) btn.parentElement.removeChild(btn);
      btn = document.createElement("button");
      btn.id = "filter-close";
      btn.type = "button";
      btn.setAttribute("aria-label", "Fermer");
      btn.textContent = "×";
      btn.addEventListener("click", closeFilterModal);
      filterBox.prepend(btn);
    }
  }
  function openFilterModal() {
    ensureFilterClose();
    filterBox.classList.remove("hidden");
    filterBox.classList.add("modal-open");
    document.body.classList.add("filters-open");
  }
  toggleFilterBtn?.addEventListener("click", () => {
    if (document.body.classList.contains("filters-open")) closeFilterModal();
    else openFilterModal();
  });
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("filters-open")) {
      const inModal = filterBox.contains(e.target);
      const onToggle = toggleFilterBtn?.contains(e.target);
      if (!inModal && !onToggle) closeFilterModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("filters-open")) closeFilterModal();
  });

  // Gestion plein écran améliorée
  function isMobileDevice() {
    return window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function enterFullscreen() {
    if (isMobileDevice()) {
      // Mode plein écran simulé pour mobile
      document.body.classList.add("fullscreen");
    } else {
      // Vrai plein écran navigateur pour desktop
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
      document.body.classList.add("fullscreen");
    }
  }

  function exitFullscreen() {
    if (isMobileDevice()) {
      // Sortie mode simulé mobile
      document.body.classList.remove("fullscreen");
    } else {
      // Sortie vrai plein écran desktop
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen();
      }
      document.body.classList.remove("fullscreen");
    }
  }

  const fullscreenToggleBtn = document.getElementById("fullscreen-toggle");
  fullscreenToggleBtn?.addEventListener("click", () => {
    if (document.body.classList.contains("fullscreen")) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  });

  // Gestion des événements plein écran desktop
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove("fullscreen");
    }
  });

  // Gestion clic pour sortir du plein écran mobile
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("fullscreen")) return;
    if (!isMobileDevice()) return;

    // Vérifier si le clic est sur un élément interactif
    const interactiveElements = [
      ".line-card", ".departure-item", ".line-checkbox", 
      "#quick-actions button", "#thermo-back", ".qa-btn",
      "#stop-name", "#stop-suggestions div"
    ];
    
    const isInteractive = interactiveElements.some(selector => 
      e.target.closest(selector)
    );

    // Si ce n'est pas un élément interactif, sortir du plein écran
    if (!isInteractive) {
      exitFullscreen();
    }
  });

  function renderDepartures(departures) {
    departuresContainer.innerHTML = "";
    if (thermo) thermo.style.display = "none";
    departuresContainer.style.display = "";

    const filtered = departures.filter(dep => selectedLines.has(`${dep.category || ""} ${dep.number || ""}`));
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

    // Filtrer les lignes qui ont au moins un départ à afficher
    const filteredLines = Object.entries(groupedByLine).filter(([lineKey, destinations]) => {
      return Object.values(destinations).some(times => times.length > 0);
    });

    const sortedLines = filteredLines.sort(([a], [b]) => {
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

      // Récupérer le premier départ pour obtenir l'opérateur
      const firstDep = Object.values(destinations)[0]?.[0]?.raw;
      const operator = firstDep?.operator;

      // 1. D'abord chercher couleur par opérateur
      if (operator && lineColors[operator] && lineColors[operator][content || number]) {
        if (category === "B" || category === "T" || category === "M") {
          content = number || category;
          lineColor = lineColors[operator][content];
        } else if (category === "FUN") {
          content = number && !number.startsWith("0") ? `Funi ${number}` : "Funi";
          lineColor = lineColors[operator][number];
        }
      }

      // 2. Si pas trouvé, logique par catégorie
      if (!lineColor) {
        if (category === "B" || category === "T" || category === "M") {
          content = number || category;
          lineColor = lineColors.categories.default;
        } else if (category === "BAT") {
          content = number && !number.startsWith("0") ? `BAT ${number}` : "BAT";
          lineColor = lineColors.categories.default;
        } else if (category === "FUN") {
          content = number && !number.startsWith("0") ? `Funi ${number}` : "Funi";
          lineColor = lineColors.categories.default;
        } else if (category === "GB") {
          content = "🚠";
          lineColor = lineColors.categories.GB;
        } else if (lineColors.categories.trains.includes(category)) {
          content = number && !number.startsWith("0") ? `${category} ${number}` : category;
          lineColor = lineColors.categories.trainsColor;
        } else {
          // Fallback pour les couleurs directes (trains spéciaux)
          content = number && !number.startsWith("0") ? `${category} ${number}` : category;
          lineColor = lineColors[content] || lineColors.categories.trainsColor;
        }
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

      departuresContainer.style.display = "none";
      thermo.style.display = "block";
    } catch (e) {
      console.error("Thermomètre erreur", e);
    }
  }

  // Démarrage — remplissage rapide puis amélioration continue
  (async () => {
    // Amorçage suggestions via cache position (ne touche pas H1)
    const cached = loadLastFix();
    if (cached) {
      fetchSuggestionsByLocation(cached.lon, cached.lat, () => {
        // uniquement pour remplir nearbyStops rapidement
      });
    }

    if (STOP_NAME === "Entrez le nom de l'arrêt ici") {
      updateUserLocation(
        // Callback final (8 secondes max)
        () => findAndFillBestStop(),
        {
          fresh: true,
          withWatch: true,
          // Callback rapide (2 secondes max)
          quickCallback: () => findAndFillBestStop()
        }
      );
    } else {
      fetchDepartures();
    }
    setInterval(fetchDepartures, REFRESH_MS);
  })();
});