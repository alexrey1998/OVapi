import { lineColors } from "./colors.js";

document.addEventListener("DOMContentLoaded", function () {
  const STOP_NAME = "Lancy-Bachet, gare";
  
  // Injection du nom de l'arrêt dans le h1
  document.getElementById("stop-name").textContent = STOP_NAME;

  const API_URL = `https://transport.opendata.ch/v1/stationboard?station=${STOP_NAME}&limit=30`;
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
    fetch(API_URL)
      .then(response => response.json())
      .then(data => {
        departuresContainer.innerHTML = "";
        const departures = data.stationboard;

        const lines = [...new Set(departures.map(dep => dep.category + ' ' + dep.number))];

        // Tri des lignes pour qu'elles soient classées comme les cartes
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

        // Si aucune ligne n'est sélectionnée par défaut, on sélectionne toutes les lignes
        if (selectedLines.size === 0) {
          lines.forEach(line => selectedLines.add(line));
        }

        // Génération de la boîte des filtres avec les boutons de sélection/désélection et la liste des cases à cocher
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

        // Ajout des écouteurs d'événement sur les cases à cocher
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

        // Ajout des écouteurs d'événement sur les boutons de sélection/désélection
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

      groupedByLine[key][dep.to].push({
        time: depTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        minutesLeft
      });
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
      const lineNumber = line.split(" ").pop();
      const lineColor = lineColors[lineNumber] || "#007bff";

      const lineCard = document.createElement("div");
      lineCard.classList.add("line-card");

      lineCard.innerHTML = `<div class="line-title"><span class="line-badge" style="background-color: ${lineColor}; color: white; padding: 5px 10px; border-radius: 15px;">${lineNumber}</span></div>`;

      for (const [destination, times] of Object.entries(destinations)) {
        lineCard.innerHTML += `<div class="destination-title">${destination}</div>`;
        lineCard.innerHTML += `<div class="departure-times">${times.map(dep => `<span class="departure-item">${dep.time} (${dep.minutesLeft} min)</span>`).join(" ")}</div>`;
      }

      departuresContainer.appendChild(lineCard);
    }
  }

  fetchDepartures();
  setInterval(fetchDepartures, 60000);
});
