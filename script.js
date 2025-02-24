import { lineColors } from "./colors.js";

document.addEventListener("DOMContentLoaded", function () {
  // Gestion de la bannière d'information
  if (localStorage.getItem("bannerClosed") === "true") {
    const banner = document.getElementById("banner");
    if (banner) {
      banner.style.display = "none";
    }
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
  stopNameEl.textContent = STOP_NAME;
  
  // Variable pour suivre l'indice de suggestion actuellement sélectionnée
  let currentSuggestionIndex = -1;
  // Variable pour stocker la position de l'utilisateur
  let userLocation = null;
  
  // Fonction de calcul de la distance (formule de Haversine) entre deux points (en km)
  function computeDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  
  // Fonction pour mettre à jour la mise en surbrillance des suggestions
  function updateSuggestionHighlight() {
    const suggestionItems = suggestionsContainer.querySelectorAll("div");
    suggestionItems.forEach((item, index) => {
      if (index === currentSuggestionIndex) {
        item.classList.add("selected");
      } else {
        item.classList.remove("selected");
      }
    });
  }
  
  // Lors d'un clic sur le h1, vider le contenu, actualiser la localisation et afficher les suggestions
  stopNameEl.addEventListener("click", function() {
    if (this.textContent.trim() !== "") {
      this.textContent = "";
    }
    updateUserLocation(function() {
      if (userLocation && stopNameEl.textContent.trim() === "") {
        fetchSuggestionsByLocation(userLocation.lon, userLocation.lat);
      }
    });
    this.focus();
  });
  
  // Lors d'une saisie, récupérer les suggestions via une requête texte
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
  
  // Gestion des flèches haut/bas et de la touche Entrée
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
        stopNameEl.textContent = chosenName;
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
  
  // Au blur, vider les suggestions et lancer la recherche
  stopNameEl.addEventListener("blur", function() {
    setTimeout(() => {
      suggestionsContainer.innerHTML = "";
      suggestionsContainer.style.display = "none";
      currentSuggestionIndex = -1;
    }, 200);
    STOP_NAME = this.textContent.trim();
    selectedLines.clear();
    fetchDepartures();
  });
  
  // Fonction pour actualiser la localisation (au chargement et lors du clic)
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
  
  // Fonction pour récupérer les suggestions basées sur la localisation
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
              stopNameEl.textContent = chosenName;
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
        if (typeof callback === "function") {
          callback(suggestions);
        }
      })
      .catch(error => {
        console.error("Erreur lors de la récupération des suggestions par localisation", error);
        if (typeof callback === "function") {
          callback([]);
        }
      });
  }
  
  // Fonction pour récupérer les suggestions par saisie texte (filtrées selon la propriété type)
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
              stopNameEl.textContent = chosenName;
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
  
  // Nouvelle fonction pour vérifier si un arrêt possède au moins un départ dans les 90 prochaines minutes
  async function checkDeparturesForStop(stopNameCandidate) {
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(stopNameCandidate)}&limit=30`;
    try {
      const response = await fetch(API_URL);
      const data = await response.json();
      const departures = data.stationboard;
      const now = new Date();
      return departures.some(dep => {
        const depTime = new Date(dep.stop.departure);
        return (depTime - now) / 60000 <= 90;
      });
    } catch (error) {
      console.error("Erreur lors de la vérification des départs pour", stopNameCandidate, error);
      return false;
    }
  }
  
  // Nouveau code adapté pour mettre à jour STOP_NAME avec l'arrêt le plus proche ayant des départs à afficher
  if (STOP_NAME === "Entrez le nom de l'arrêt ici") {
    updateUserLocation(function() {
      if (userLocation) {
        fetchSuggestionsByLocation(userLocation.lon, userLocation.lat, async function(suggestions) {
          for (let i = 0; i < suggestions.length; i++) {
            const candidateStop = suggestions[i].name;
            const hasDepartures = await checkDeparturesForStop(candidateStop);
            if (hasDepartures) {
              STOP_NAME = candidateStop;
              stopNameEl.textContent = candidateStop;
              fetchDepartures();
              break;
            }
          }
        });
      }
    });
  }
  
  // --- Le reste du code reste inchangé ---
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
  
  // Nouvelle fonctionnalité : quitter le mode fullscreen si l'utilisateur clique en dehors du champ de recherche
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
  
  function fetchDepartures() {
    const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${STOP_NAME}&limit=30`;
    fetch(API_URL)
      .then(response => response.json())
      .then(data => {
        departuresContainer.innerHTML = "";
        const departures = data.stationboard;
  
        const lines = [...new Set(departures.map(dep => dep.category + ' ' + dep.number))];
        lines.sort((a, b) => {
          const numA = a.split(" ").pop();
          const numB = b.split(" ").pop();
          const isNumA = !isNaN(numA);
          const isNumB = !isNaN(numB);
          if (isNumA && isNumB) {
            return parseInt(numA) - parseInt(numB);
          } else if (isNumA) {
            return -1;
          } else if (isNumB) {
            return 1;
          } else {
            return numA.localeCompare(numB);
          }
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
                        <input type="checkbox" value="${line}" ${checked} class="line-checkbox"> Ligne ${line}
                      </label>`;
            }).join('')}
          </div>
        `;
  
        document.querySelectorAll(".line-checkbox").forEach(checkbox => {
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
              selectedLines.add(checkbox.value);
            } else {
              selectedLines.delete(checkbox.value);
            }
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
      })
      .catch(error => {
        console.error("Erreur lors de la récupération des données", error);
        departuresContainer.innerHTML = "<p>Erreur de chargement</p>";
      });
  }
  
  function renderDepartures(departures) {
    departuresContainer.innerHTML = "";
    const filteredDepartures = departures.filter(dep =>
      selectedLines.has(dep.category + ' ' + dep.number)
    );
    const groupedByLine = {};
    filteredDepartures.forEach(dep => {
      const key = `${dep.category} ${dep.number}`;
      if (!groupedByLine[key]) groupedByLine[key] = {};
      if (!groupedByLine[key][dep.to]) groupedByLine[key][dep.to] = [];
      const depTime = new Date(dep.stop.departure);
      const minutesLeft = Math.max(0, Math.round((depTime - new Date()) / 60000));
      if (minutesLeft <= 90) {
        groupedByLine[key][dep.to].push({
          time: depTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          minutesLeft
        });
      }
    });
    const sortedLines = Object.entries(groupedByLine).sort(([a], [b]) => {
      const numA = a.split(" ").pop();
      const numB = b.split(" ").pop();
      const isNumA = !isNaN(numA);
      const isNumB = !isNaN(numB);
      if (isNumA && isNumB) {
        return parseInt(numA) - parseInt(numB);
      } else if (isNumA) {
        return -1;
      } else if (isNumB) {
        return 1;
      } else {
        return numA.localeCompare(numB);
      }
    });
  
    for (const [line, destinations] of sortedLines) {
      const parts = line.split(" ");
      const category = parts[0];
      const number = parts.slice(1).join(" ").trim();
      
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
      const lineBadgeHTML = `<span class="line-badge" style="background-color: ${lineColor}; color: white; padding: 5px ${horizontalPadding}px; border-radius: 15px;">${content}</span>`;
      const lineTitleHTML = `<div class="line-title">${lineBadgeHTML}</div>`;
      const lineCard = document.createElement("div");
      lineCard.classList.add("line-card");
      lineCard.innerHTML = lineTitleHTML;
      
      let hasDepartureForLine = false;
      for (const [destination, times] of Object.entries(destinations)) {
        if (times.length > 0) {
          hasDepartureForLine = true;
          let displayDestination = destination;
          if (displayDestination === "Zürich Flughafen" || displayDestination === "Genève-Aéroport") {
            displayDestination += " ✈";
          }
          lineCard.innerHTML += `<div class="destination-title">${displayDestination}</div>`;
          lineCard.innerHTML += `<div class="departure-times">${times.slice(0, 5).map(dep => `<span class="departure-item">${dep.time} (${dep.minutesLeft} min)</span>`).join(" ")}</div>`;
        }
      }
      if (hasDepartureForLine) {
        departuresContainer.appendChild(lineCard);
      }
    }
  }
  
  fetchDepartures();
  setInterval(fetchDepartures, 60000);
});
