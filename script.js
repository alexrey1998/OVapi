import { lineColors } from "./colors.js";

document.addEventListener("DOMContentLoaded", function () {
  let STOP_NAME = "Lancy-Bachet, gare";
  const stopNameEl = document.getElementById("stop-name");
  const suggestionsContainer = document.getElementById("stop-suggestions");
  stopNameEl.textContent = STOP_NAME;
  
  // Variable pour suivre l'indice de suggestion actuellement sélectionnée
  let currentSuggestionIndex = -1;
  
  // Fonction pour mettre à jour la mise en surbrillance (background gris clair) des suggestions
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
  
  // Au clic, vider le contenu pour faciliter la saisie
  stopNameEl.addEventListener("click", function() {
    this.textContent = "";
    this.focus();
    document.execCommand("selectAll", false, null);
  });
  
  // Lors d'une saisie, récupérer les suggestions depuis l'API
  stopNameEl.addEventListener("input", function() {
    currentSuggestionIndex = -1; // Réinitialiser l'indice
    const query = this.textContent.trim();
    if (query.length > 0) {
      fetchSuggestions(query);
    } else {
      suggestionsContainer.innerHTML = "";
      suggestionsContainer.style.display = "none";
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
        // Si aucune suggestion n'est active, prendre la première
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
        // Retirer le focus du H1 après acceptation de la suggestion
        stopNameEl.blur();
      } else {
        stopNameEl.blur();
      }
    }
  });
  
  // Au blur, mettre à jour STOP_NAME et lancer la recherche (après un délai pour permettre le clic sur une suggestion)
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
  
  // Fonction pour récupérer les suggestions depuis l'API
  function fetchSuggestions(query) {
    const url = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(query)}`;
    fetch(url)
      .then(response => response.json())
      .then(data => {
        const stations = data.stations || [];
        const suggestions = stations.slice(0, 5);
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
  setInterval(fetchDepartures, 10000);
});
