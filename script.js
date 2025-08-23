import { lineColors } from "./colors.js";
import { settings } from "./settings.js";

// -------- Helpers settings sûrs
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

// Durées & limites paramétrées
const DISPLAY_WINDOW_MS = parseHMStoMs(settings.maxDisplayPeriod, 90 * 60 * 1000); // défaut 1h30
const REFRESH_MS = parseHMStoMs(settings.refreshInterval, 60 * 1000); // défaut 1 min
const STATIONBOARD_LIMIT = getInt(settings.stationboardLimit, 30);

// Chargement du fichier CSV des gares suisses
let swissStationsSet = new Set();
loadSwissStations();

function loadSwissStations() {
  fetch("swiss_stations.csv")
    .then(response => response.text())
    .then(text => {
      const lines = text.split("\n");
      for (let line of lines) {
        line = line.trim();
        if (line && line.toLowerCase() !== "name") {
          swissStationsSet.add(line);
        }
      }
    })
    .catch(error => {
      console.error("Erreur de chargement du CSV des gares suisses", error);
    });
}

function isSwissStation(stationName) {
  return swissStationsSet.has(stationName);
}

// ---- Mise en forme des noms d'arrêts avec préfixe/suffixe
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/**
 * Règles:
 * - Si le nom contient une virgule, on coupe à la 1re virgule, et on force EXACTEMENT une espace après:
 *    préfixe = texte avant la virgule + ", "
 *    suffixe = le reste (trimStart)
 *    préfixe est mis à l’échelle (prefixScalePct)
 *    suffixe garde taille normale mais applique la couleur suffixColor
 * - Si pas de virgule:
 *    tout est traité comme suffixe: taille normale, couleur suffixColor
 */
function formatStopNameHTML(rawName) {
  const name = String(rawName ?? "");
  const color = (settings?.stopName?.suffixColor ?? "default").toString();
  const scale = getInt(settings?.stopName?.prefixScalePct, 100);

  const colorStyle = (color && color.toLowerCase() !== "default")
    ? `color:${escapeHtml(color)};`
    : "";

  const m = name.match(/^(.*?,)([\u00A0\u202F ]*)(.*)$/);

  if (m) {
    const prefix = m[1] + m[2];
    const suffix = m[3];

    const prefixHTML = `<span class="stopname-prefix" style="font-size:${scale}%;">${escapeHtml(prefix)}</span>`;
    const suffixHTML = `<span class="stopname-suffix" style="${colorStyle}">${escapeHtml(suffix)}</span>`;
    return prefixHTML + suffixHTML;
  }

  return `<span class="stopname-suffix" style="${colorStyle}">${escapeHtml(name)}</span>`;
}

document.addEventListener("DOMContentLoaded", function () {
  // Gestion de la bannière d'information
  if (localStorage.getItem("bannerClosed") === "true") {
    const banner = document.getElementById("banner");
    if (banner) banner.style.display = "none";
  } else {
    const closeButton = document.getElementById("banner-close");
    closeButton.addEventListener("click", function () {
      const banner = document.getElementById("banner");
      banner.style.display = "none";
      localStorage.setItem("bannerClosed", "true");
    });
  }

  let STOP_NAME = "Entrez le nom de l'arrêt ici";
  const stopNameEl = document.getElementById("stop-name");
  const suggestionsContainer = document.getElementById("stop-suggestions");
  stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);

  let currentSuggestionIndex = -1;
  let userLocation = null;

  function computeDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 +
      Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
      Math.sin(dLon/2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function updateSuggestionHighlight() {
    const suggestionItems = suggestionsContainer.querySelectorAll("div");
    suggestionItems.forEach((item, index) => {
      item.classList.toggle("selected", index === currentSuggestionIndex);
    });
  }

  stopNameEl.addEventListener("click", function() {
    const plain = stopNameEl.textContent;
    if (plain.trim() !== "") stopNameEl.textContent = "";
    updateUserLocation(function() {
      if (userLocation && stopNameEl.textContent.trim() === "") {
        fetchSuggestionsByLocation(userLocation.lon, userLocation.lat);
      }
    });
    this.focus();
  });

  stopNameEl.addEventListener("input", function() {
    currentSuggestionIndex = -1;
    const query = this.textContent.trim();
    if (query.length > 0) {
      fetchSuggestions(query);
    } else {
      if (userLocation) {
        fetchSuggestionsByLocation(userLocation.lon, userLocation.lat);
      } else {
        suggestionsContainer.innerHTML = "";
        suggestionsContainer.style.display = "none";
      }
    }
  });

  stopNameEl.addEventListener("keydown", function(e) {
    const suggestionItems = suggestionsContainer.querySelectorAll("div");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestionItems.length > 0) {
        currentSuggestionIndex = (currentSuggestionIndex + 1) % suggestionItems.length;
        updateSuggestionHighlight();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestionItems.length > 0) {
        currentSuggestionIndex = (currentSuggestionIndex - 1 + suggestionItems.length) % suggestionItems.length;
        updateSuggestionHighlight();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestionItems.length > 0) {
        if (currentSuggestionIndex === -1) {
          currentSuggestionIndex = 0;
          updateSuggestionHighlight();
        }
        const chosenName = suggestionItems[currentSuggestionIndex].textContent;
        STOP_NAME = chosenName;
        stopNameEl.innerHTML = formatStopNameHTML(chosenName);
        selectedLines.clear();
        suggestionsContainer.innerHTML = "";
        suggestionsContainer.style.display = "none";
        currentSuggestionIndex = -1;
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
    STOP_NAME = this.textContent.trim();
    stopNameEl.innerHTML = formatStopNameHTML(STOP_NAME);
    selectedLines.clear();
    fetchDepartures();
  });

  function updateUserLocation(callback) {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(position) {
        userLocation = { lat: position.coords.latitude, lon: position.coords.longitude };
        if (callback) callback();
      }, function(error) {
        console.error("Erreur lors de la récupération de la position :", error);
        if (callback) callback();
      });
    } else {
      console.error("La géolocalisation n'est pas supportée par ce navigateur.");
      if (callback) callback();
    }
  }

  function fetchSuggestionsByLocation(lon, lat, callback) {
    const url = `https://transport.opendata.ch/v1/locations?x=${encodeURIComponent(lon)}&y=${encodeURIComponent(lat)}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        const stations = data.stations || [];
        const filteredStations = stations.filter(s => !s.type || s.type.toLowerCase() === "station");
        const suggestions = filteredStations.sort((a, b) => {
          const d1 = computeDistance(userLocation.lat, userLocation.lon, a.coordinate.x, a.coordinate.y);
          const d2 = computeDistance(userLocation.lat, userLocation.lon, b.coordinate.x, b.coordinate.y);
          return d1 - d2;
        }).slice(0, 5);
        if (document.activeElement === stopNameEl && stopNameEl.textContent.trim() === "") {
          suggestionsContainer.innerHTML = suggestions.map(s => `<div>${s.name}</div>`).join("");
          suggestionsContainer.style.display = "block";
          currentSuggestionIndex = -1;
          suggestionsContainer.querySelectorAll("div").forEach((suggestionEl, index) => {
            suggestionEl.addEventListener("mousedown", function() {
              const chosenName = suggestions[index].name;
              STOP_NAME = chosenName;
              stopNameEl.innerHTML = formatStopNameHTML(chosenName);
              selectedLines.clear();
              suggestionsContainer.innerHTML = "";
              suggestionsContainer.style.display = "none";
              currentSuggestionIndex = -1;
              fetchDepartures();
            });
            suggestionEl.addEventListener("mouseover", function() {
              currentSuggestionIndex = index;
              updateSuggestionHighlight();
            });
          });
        }
        if (typeof callback === "function") callback(suggestions);
      })
      .catch(error => {
        console.error("Erreur lors de la récupération des suggestions par localisation", error);
        if (typeof callback === "function") callback([]);
      });
  }

  function fetchSuggestions(query) {
    const url = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(query)}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        const stations = data.stations || [];
        const filteredStations = stations.filter(s => !s.type || s.type.toLowerCase() === "station");
        const suggestions = filteredStations.slice(0, 5);
        if (suggestions.length > 0) {
          suggestionsContainer.innerHTML = suggestions.map(s => `<div>${s.name}</div>`).join("");
          suggestionsContainer.style.display = "block";
          currentSuggestionIndex = -1;
          suggestionsContainer.querySelectorAll("div").forEach((suggestionEl, index) => {
            suggestionEl.addEventListener("mousedown", function() {
              const chosenName = suggestions[index].name;
              STOP_NAME = chosenName;
              stopNameEl.innerHTML = formatStopNameHTML(chosenName);
              selectedLines.clear();
              suggestionsContainer.innerHTML = "";
              suggestionsContainer.style.display = "none";
              currentSuggestionIndex = -1;
              fetchDepartures();
            });
            suggestionEl.addEventListener("mouseover", function() {
              currentSuggestionIndex = index;
              updateSuggestionHighlight();
            });
          });
        } else {
          suggestionsContainer.innerHTML = "";
          suggestionsContainer.style.display = "none";
          currentSuggestionIndex = -1;
        }
      })
      .catch(error => {
        console.error("Erreur lors de la récupération des suggestions", error);
      });
  }

  async function adjustTrainDestination(dep) {
    const locURL = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(dep.to)}`;
    try {
      const locResponse = await fetch(locURL);
      const locData = await locResponse.json();
      const station = locData.stations && locData.stations[0];
      if (!station) return null;
      const stationId = station.id;
      const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(stationId)}&limit=5`;
      const response = await fetch(API_URL);
      const data = await response.json();
      const departures = data.stationboard || [];
      const currentName = parseInt(dep.name);
      for (let otherDep of departures) {
        const otherName = parseInt(otherDep.name);
        if (otherName === currentName || otherName === currentName + 1) {
          if (otherDep.to && otherDep.to !== dep.to && !isSwissStation(otherDep.to)) {
            return otherDep.to;
          }
        }
      }
    } catch (error) {
      console.error("Erreur lors de l'ajustement de la destination pour", dep.to, error);
    }
    return null;
  }

  async function checkDeparturesForStop(stopNameCandidate) {
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(stopNameCandidate)}&limit=${STATIONBOARD_LIMIT}`;
    try {
      const response = await fetch(API_URL);
      const data = await response.json();
      const departures = data.stationboard || [];
      const now = Date.now();
      return departures.some(dep => {
        const depTime = new Date(dep.stop.departure).getTime();
        const delay = Number(dep.stop.delay || 0);
        const depTimeAdj = depTime + (Number.isFinite(delay) ? delay * 60 * 1000 : 0);
        return depTimeAdj - now <= DISPLAY_WINDOW_MS;
      });
    } catch (error) {
      console.error("Erreur lors de la vérification des départs pour", stopNameCandidate, error);
      return false;
    }
  }

  if (STOP_NAME === "Entrez le nom de l'arrêt ici") {
    updateUserLocation(function() {
      if (userLocation) {
        fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, async function(suggestions) {
          for (let i = 0; i < suggestions.length; i++) {
            const candidateStop = suggestions[i].name;
            const hasDepartures = await checkDeparturesForStop(candidateStop);
            if (hasDepartures) {
              STOP_NAME = candidateStop;
              stopNameEl.innerHTML = formatStopNameHTML(candidateStop);
              fetchDepartures();
              break;
            }
          }
        });
      }
    });
  }

  // --- UI & rendering ---
  const departuresContainer = document.getElementById("departures");
  const lastUpdateElement = document.getElementById("update-time");
  const filterBox = document.getElementById("line-filter-box");
  const toggleFilterBtn = document.getElementById("toggle-filter");

  let selectedLines = new Set();

  // Gestion modal filtre
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

  toggleFilterBtn.addEventListener("click", () => {
    if (document.body.classList.contains("filters-open")) {
      closeFilterModal();
    } else {
      openFilterModal();
    }
  });

  // Fermer en cliquant hors de la modal
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("filters-open")) {
      const clickInModal = filterBox.contains(e.target);
      const clickOnToggle = toggleFilterBtn.contains(e.target);
      if (!clickInModal && !clickOnToggle) closeFilterModal();
    }
  });

  // Fermer avec Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("filters-open")) {
      closeFilterModal();
    }
  });

  const fullscreenToggleBtn = document.getElementById("fullscreen-toggle");
  fullscreenToggleBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      document.body.classList.add("fullscreen");
    } else {
      document.exitFullscreen();
      document.body.classList.remove("fullscreen");
    }
  });

  document.addEventListener("click", function(e) {
    if (document.fullscreenElement && !e.target.closest("#stop-name")) {
      document.exitFullscreen();
      document.body.classList.remove("fullscreen");
    }
  });

  function updateLastUpdateTime() {
    const now = new Date();
    lastUpdateElement.textContent = now.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  async function fetchDepartures() {
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(STOP_NAME)}&limit=${STATIONBOARD_LIMIT}`;
    try {
      const response = await fetch(API_URL);
      const data = await response.json();
      let departures = (data && data.stationboard) ? data.stationboard : [];

      await Promise.all(departures.map(async (dep) => {
        if (dep.category === "T" && dep.to && dep.to.indexOf(",") === -1 && !isSwissStation(dep.to)) {
          const adjusted = await adjustTrainDestination(dep);
          if (adjusted) dep.to = adjusted;
        }
      }));

      departuresContainer.innerHTML = "";
      const lines = [...new Set(departures.map(dep => {
        const cat = (dep.category === "null" ? "" : dep.category);
        const num = (dep.number === "null" ? "" : dep.number);
        return `${cat} ${num}`;
      }))];

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

      if (selectedLines.size === 0) lines.forEach(line => selectedLines.add(line));

      filterBox.innerHTML = `
<div id="select-all-container">
  <button id="select-all">Sélectionner tout</button>
  <button id="deselect-all">Désélectionner tout</button>
</div>
<div id="checkboxes-container">
${lines.map(line => {
  const checked = selectedLines.has(line) ? "checked" : "";
  return `<label class="filter-item">
  <input type="checkbox" value="${line}" ${checked} class="line-checkbox"> Ligne ${line}
  </label>`;
}).join('')}
</div>
`;
      // Réinsérer le bouton de fermeture en tête
      ensureFilterClose();

      document.querySelectorAll(".line-checkbox").forEach(checkbox => {
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selectedLines.add(checkbox.value);
          else selectedLines.delete(checkbox.value);
          renderDepartures(departures);
        });
      });

      const selectAllBtn = document.getElementById("select-all");
      const deselectAllBtn = document.getElementById("deselect-all");
      selectAllBtn.addEventListener("click", () => {
        lines.forEach(line => selectedLines.add(line));
        document.querySelectorAll(".line-checkbox").forEach(cb => cb.checked = true);
        renderDepartures(departures);
      });
      deselectAllBtn.addEventListener("click", () => {
        selectedLines.clear();
        document.querySelectorAll(".line-checkbox").forEach(cb => cb.checked = false);
        renderDepartures(departures);
      });

      renderDepartures(departures);
      updateLastUpdateTime();
    } catch (error) {
      console.error("Erreur lors de la récupération des données", error);
      departuresContainer.innerHTML = "<p>Erreur de chargement</p>";
    }
  }

  function renderDepartures(departures) {
    departuresContainer.innerHTML = "";
    const filteredDepartures = departures.filter(dep =>
      selectedLines.has(`${dep.category === "null" ? "" : dep.category} ${dep.number === "null" ? "" : dep.number}`)
    );

    const groupedByLine = {};
    const nowMs = Date.now();

    filteredDepartures.forEach(dep => {
      const key = `${dep.category === "null" ? "" : dep.category} ${dep.number === "null" ? "" : dep.number}`;
      if (!groupedByLine[key]) groupedByLine[key] = {};
      if (!groupedByLine[key][dep.to]) groupedByLine[key][dep.to] = [];

      const schedMs = new Date(dep.stop.departure).getTime();
      const delayMin = Number(dep.stop.delay || 0);
      const effectiveMs = schedMs + (Number.isFinite(delayMin) ? delayMin * 60 * 1000 : 0);
      const remainingMin = Math.max(0, Math.round((effectiveMs - nowMs) / 60000));

      if ((effectiveMs - nowMs) <= DISPLAY_WINDOW_MS) {
        groupedByLine[key][dep.to].push({
          time: new Date(schedMs).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          minutesLeft: remainingMin,
          platform: (dep.stop.platform && dep.category !== "GB" && dep.stop.platform !== "null") ? dep.stop.platform : "",
          delay: (dep.stop.delay !== undefined && dep.stop.delay !== null) ? dep.stop.delay : null
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

    for (const [line, destinations] of sortedLines) {
      let [category, ...numParts] = line.split(" ");
      if (category === "null") category = "";
      let number = numParts.join(" ").trim();
      if (number === "null") number = "";

      let content = "";
      let lineColor = "";
      if (category === "B" || category === "T" || category === "M") {
        content = number ? number : category;
        lineColor = lineColors[content] || "#007bff";
      } else {
        if (category === "GB") {
          content = "🚠";
          lineColor = "#e8e8e8";
        } else if (category === "BAT") {
          content = (number && !number.startsWith("0")) ? `${category} ${number}` : category;
          lineColor = lineColors["BAT"] || "#007bff";
        } else {
          content = (number && !number.startsWith("0")) ? `${category} ${number}` : category;
          lineColor = "#eb0000";
        }
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = window.getComputedStyle(document.body).font;
      const textWidth = ctx.measureText(content).width;
      let extraPadding = 0;
      if (textWidth < 21.5) extraPadding = (21.5 - textWidth) / 2;
      const horizontalPadding = 11 + extraPadding;
      const lineBadgeHTML = `<span class="line-badge" style="background-color:${lineColor};color:white;padding:5px ${horizontalPadding}px;border-radius:15px;">${content}</span>`;
      const lineTitleHTML = `<div class="line-title">${lineBadgeHTML}</div>`;

      const lineCard = document.createElement("div");
      lineCard.classList.add("line-card");
      lineCard.style.display = "flex";
      lineCard.style.flexDirection = "column";
      lineCard.style.alignItems = "stretch";
      lineCard.style.alignSelf = "stretch";
      lineCard.innerHTML = lineTitleHTML;

      let hasDepartureForLine = false;
      for (const [destination, times] of Object.entries(destinations)) {
        if (times.length > 0) {
          hasDepartureForLine = true;

          let displayDestination = destination;
          let suffixAirport = "";
          if (displayDestination === "Zürich Flughafen" || displayDestination === "Genève-Aéroport") {
            suffixAirport = " ✈";
          }

          const destHTML = formatStopNameHTML(displayDestination) + escapeHtml(suffixAirport);
          lineCard.innerHTML += `<div class="destination-title">${destHTML}</div>`;

          lineCard.innerHTML += `<div class="departure-times">` + times.slice(0, 5).map(depObj => {
            let delayStr = "";
            if (depObj.delay !== null && (depObj.delay <= -2 || depObj.delay >= 2)) {
              const delayValue = Math.abs(depObj.delay);
              const sign = depObj.delay >= 0 ? "+" : "-";
              delayStr = delayValue >= 5
                ? ` <span style="color:#eb0000;">${sign}${delayValue}'</span>`
                : ` ${sign}${delayValue}'`;
            }
            let platformStr = depObj.platform ? ` pl. ${depObj.platform}` : "";
            return `<span class="departure-item">${depObj.time}${delayStr} (${depObj.minutesLeft} min)${platformStr}</span>`;
          }).join(" ") + `</div>`;
        }
      }
      if (hasDepartureForLine) departuresContainer.appendChild(lineCard);
    }
  }

  fetchDepartures();
  setInterval(fetchDepartures, REFRESH_MS);
});
