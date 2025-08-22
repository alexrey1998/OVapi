import { lineColors } from "./colors.js";
import { settings } from "./settings.js";

// ------- Utils réglages -------
function parseHmsToMs(hms) {
  const [hh = "0", mm = "0", ss = "0"] = String(hms || "").split(":");
  const h = parseInt(hh, 10) || 0;
  const m = parseInt(mm, 10) || 0;
  const s = parseInt(ss, 10) || 0;
  return ((h * 60 + m) * 60 + s) * 1000;
}
const REFRESH_MS = parseHmsToMs(settings.refreshInterval);
const MAX_DISPLAY_MS = parseHmsToMs(settings.maxDisplayPeriod);

// ------- Chargement des gares suisses -------
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

// ------- Helpers affichage des noms -------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Rendu: préfixe = tout jusqu’à ", " INCLUS; suffixe = après.
function stylizeName(name) {
  const raw = String(name || "");
  const safe = escapeHtml(raw);
  const idx = safe.indexOf(", ");

  const suffixColor = settings?.stopName?.suffixColor || "default";
  const prefixScalePct = settings?.stopName?.prefixScalePct ?? 100;

  if (idx >= 0) {
    const prefix = safe.slice(0, idx + 2); // inclut la virgule + espace
    const suffix = safe.slice(idx + 2);

    const prefixStyle = `style="font-size:${prefixScalePct}%;line-height:1em;"`;
    const suffixStyle =
      suffixColor && suffixColor !== "default" ? `style="color:${escapeHtml(suffixColor)};"` : "";

    return `<span ${prefixStyle}>${prefix}</span><span ${suffixStyle}>${suffix}</span>`;
  } else {
    // Pas de virgule: appliquer les paramètres du suffixe à tout le nom
    const styleAll =
      suffixColor && suffixColor !== "default" ? `style="color:${escapeHtml(suffixColor)};"` : "";
    return `<span ${styleAll}>${safe}</span>`;
  }
}

// ------- App -------
document.addEventListener("DOMContentLoaded", function () {
  // Bannière
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
  stopNameEl.innerHTML = stylizeName(STOP_NAME);

  // Suivi sélection
  let currentSuggestionIndex = -1;
  // Position utilisateur
  let userLocation = null;

  // Haversine
  function computeDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function updateSuggestionHighlight() {
    const suggestionItems = suggestionsContainer.querySelectorAll("div");
    suggestionItems.forEach((item, index) => {
      if (index === currentSuggestionIndex) item.classList.add("selected");
      else item.classList.remove("selected");
    });
  }

  function renderStopName() {
    stopNameEl.innerHTML = stylizeName(STOP_NAME);
  }

  // Clic sur le h1
  stopNameEl.addEventListener("click", function() {
    if (this.textContent.trim() !== "") this.textContent = "";
    updateUserLocation(function() {
      if (userLocation && stopNameEl.textContent.trim() === "") {
        fetchSuggestionsByLocation(userLocation.lon, userLocation.lat);
      }
    });
    this.focus();
  });

  // Saisie
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

  // Flèches et Entrée
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
        renderStopName();
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

  // Blur
  stopNameEl.addEventListener("blur", function() {
    setTimeout(() => {
      suggestionsContainer.innerHTML = "";
      suggestionsContainer.style.display = "none";
      currentSuggestionIndex = -1;
    }, 200);
    STOP_NAME = this.textContent.trim();
    renderStopName();
    selectedLines.clear();
    fetchDepartures();
  });

  // Localisation
  function updateUserLocation(callback) {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function(position) {
        userLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
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

  // Suggestions par localisation
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
          suggestionsContainer.innerHTML = suggestions.map(s => `<div>${escapeHtml(s.name)}</div>`).join("");
          suggestionsContainer.style.display = "block";
          currentSuggestionIndex = -1;
          suggestionsContainer.querySelectorAll("div").forEach((suggestionEl, index) => {
            suggestionEl.addEventListener("mousedown", function() {
              const chosenName = suggestions[index].name;
              STOP_NAME = chosenName;
              renderStopName();
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

  // Suggestions par texte
  function fetchSuggestions(query) {
    const url = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(query)}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        const stations = data.stations || [];
        const filteredStations = stations.filter(s => !s.type || s.type.toLowerCase() === "station");
        const suggestions = filteredStations.slice(0, 5);
        if (suggestions.length > 0) {
          suggestionsContainer.innerHTML = suggestions.map(s => `<div>${escapeHtml(s.name)}</div>`).join("");
          suggestionsContainer.style.display = "block";
          currentSuggestionIndex = -1;
          suggestionsContainer.querySelectorAll("div").forEach((suggestionEl, index) => {
            suggestionEl.addEventListener("mousedown", function() {
              const chosenName = suggestions[index].name;
              STOP_NAME = chosenName;
              renderStopName();
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

  // Ajustement destination trains hors CH
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
      const departures = data.stationboard;
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

  // Vérifier au moins un départ dans la période d’affichage
  async function checkDeparturesForStop(stopNameCandidate) {
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(stopNameCandidate)}&limit=${encodeURIComponent(settings.stationboardLimit)}`;
    try {
      const response = await fetch(API_URL);
      const data = await response.json();
      const departures = data.stationboard || [];
      const now = new Date();
      return departures.some(dep => {
        const depTime = new Date(dep.stop.departure);
        const delay = (dep.stop.delay !== undefined && dep.stop.delay !== null) ? dep.stop.delay : 0;
        const diffMs = (depTime - now) + delay * 60 * 1000;
        return diffMs <= MAX_DISPLAY_MS;
      });
    } catch (error) {
      console.error("Erreur lors de la vérification des départs pour", stopNameCandidate, error);
      return false;
    }
  }

  // Choix auto d’un arrêt proche avec départs
  if (STOP_NAME === "Entrez le nom de l'arrêt ici") {
    updateUserLocation(function() {
      if (userLocation) {
        fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, async function(suggestions) {
          for (let i = 0; i < suggestions.length; i++) {
            const candidateStop = suggestions[i].name;
            const hasDepartures = await checkDeparturesForStop(candidateStop);
            if (hasDepartures) {
              STOP_NAME = candidateStop;
              renderStopName();
              fetchDepartures();
              break;
            }
          }
        });
      }
    });
  }

  // --- Reste du code ---
  const departuresContainer = document.getElementById("departures");
  const lastUpdateElement = document.getElementById("update-time");
  const filterBox = document.getElementById("line-filter-box");
  const toggleFilterBtn = document.getElementById("toggle-filter");

  let selectedLines = new Set();

  toggleFilterBtn.addEventListener("click", () => {
    filterBox.classList.toggle("hidden");
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

  // Quitter fullscreen si clic hors champ de recherche
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
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(STOP_NAME)}&limit=${encodeURIComponent(settings.stationboardLimit)}`;
    try {
      const response = await fetch(API_URL);
      const data = await response.json();
      let departures = data.stationboard || [];

      // Ajustement des destinations pour trains hors CH
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
        return cat + ' ' + num;
      }))];

      lines.sort((a, b) => {
        const numA = a.split(" ").pop();
        const numB = b.split(" ").pop();
        const isNumA = !isNaN(numA);
        const isNumB = !isNaN(numB);
        if (isNumA && isNumB) return parseInt(numA) - parseInt(numB);
        else if (isNumA) return -1;
        else if (isNumB) return 1;
        else return numA.localeCompare(numB);
      });

      if (selectedLines.size === 0) {
        lines.forEach(line => selectedLines.add(line));
      }

      filterBox.innerHTML = `
<div id="select-all-container">
  <button id="select-all">Sélectionner tout</button>
  <button id="deselect-all">Désélectionner tout</button>
</div>
<div id="checkboxes-container">
  ${lines.map(line => {
    const checked = selectedLines.has(line) ? "checked" : "";
    return `<label class="filter-item">
      <input type="checkbox" value="${escapeHtml(line)}" ${checked} class="line-checkbox"> Ligne ${escapeHtml(line)}
    </label>`;
  }).join('')}
</div>
`;

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

    const now = new Date();

    const filteredDepartures = departures.filter(dep =>
      selectedLines.has((dep.category === "null" ? "" : dep.category) + ' ' + (dep.number === "null" ? "" : dep.number))
    );

    const groupedByLine = {};
    filteredDepartures.forEach(dep => {
      const key = `${dep.category === "null" ? "" : dep.category} ${dep.number === "null" ? "" : dep.number}`;
      if (!groupedByLine[key]) groupedByLine[key] = {};
      if (!groupedByLine[key][dep.to]) groupedByLine[key][dep.to] = [];

      const depTime = new Date(dep.stop.departure);
      const delay = (dep.stop.delay !== undefined && dep.stop.delay !== null) ? dep.stop.delay : 0;
      // Minutes restantes incluant le retard
      const minutesLeft = Math.max(0, Math.round(((depTime - now) / 60000) + delay));

      // Respect de la période d’affichage
      if ((depTime - now) + delay * 60000 <= MAX_DISPLAY_MS) {
        groupedByLine[key][dep.to].push({
          time: depTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          minutesLeft,
          platform: (dep.stop.platform && dep.category !== "GB" && dep.stop.platform !== "null") ? dep.stop.platform : "",
          delay
        });
      }
    });

    const sortedLines = Object.entries(groupedByLine).sort(([a], [b]) => {
      const numA = a.split(" ").pop();
      const numB = b.split(" ").pop();
      const isNumA = !isNaN(numA);
      const isNumB = !isNaN(numB);
      if (isNumA && isNumB) return parseInt(numA) - parseInt(numB);
      else if (isNumA) return -1;
      else if (isNumB) return 1;
      else return numA.localeCompare(numB);
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
          content = (number && !number.startsWith("0")) ? category + " " + number : category;
          lineColor = lineColors["BAT"] || "#007bff";
        } else {
          content = (number && !number.startsWith("0")) ? category + " " + number : category;
          lineColor = "#eb0000";
        }
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.font = window.getComputedStyle(document.body).font;
      const textWidth = ctx.measureText(content).width;
      let extraPadding = 0;
      if (textWidth < 21.5) {
        extraPadding = (21.5 - textWidth) / 2;
      }
      const horizontalPadding = 11 + extraPadding;
      const lineBadgeHTML = `<span class="line-badge" style="background-color:${lineColor};color:white;padding:5px ${horizontalPadding}px;border-radius:15px;">${escapeHtml(content)}</span>`;
      const lineTitleHTML = `<div class="line-title">${lineBadgeHTML}</div>`;
      const lineCard = document.createElement("div");
      lineCard.classList.add("line-card");
      lineCard.innerHTML = lineTitleHTML;

      let hasDepartureForLine = false;
      for (const [destination, times] of Object.entries(destinations)) {
        if (times.length > 0) {
          hasDepartureForLine = true;
          let displayDestination = destination;
          let plane = "";
          if (displayDestination === "Zürich Flughafen" || displayDestination === "Genève-Aéroport") {
            plane = " ✈";
          }
          // Nom de destination stylisé
          const destStyled = stylizeName(displayDestination);
          lineCard.innerHTML += `<div class="destination-title">${destStyled}${plane}</div>`;

          lineCard.innerHTML += `<div class="departure-times">` + times.slice(0, 5).map(depObj => {
            let delayStr = "";
            if (depObj.delay !== null && depObj.delay !== undefined && (depObj.delay <= -2 || depObj.delay >= 2)) {
              const delayValue = Math.abs(depObj.delay);
              const sign = depObj.delay >= 0 ? "+" : "-";
              if (delayValue >= 5) {
                delayStr = ` <span style="color:#eb0000;">${sign}${delayValue}'</span>`;
              } else {
                delayStr = ` ${sign}${delayValue}'`;
              }
            }
            let platformStr = depObj.platform ? ` pl. ${escapeHtml(depObj.platform)}` : "";
            return `<span class="departure-item">${escapeHtml(depObj.time)}${delayStr} (${depObj.minutesLeft} min)${platformStr}</span>`;
          }).join(" ") + `</div>`;
        }
      }

      if (hasDepartureForLine) {
        departuresContainer.appendChild(lineCard);
      }
    }
  }

  fetchDepartures();
  setInterval(fetchDepartures, REFRESH_MS);
});
