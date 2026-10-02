// Any code change requires updating the version number (see sw.js).
// UI texts only; data (stops, lines, destinations) is not translated.
export const LANGUAGES = { fr: "Français", de: "Deutsch", it: "Italiano", en: "English" };
export const DEFAULT_LANGUAGE = "fr";
const FALLBACK_LANGUAGE = "en";

const texts = {
  fr: {
    stopPlaceholder: "Entrez le nom de l'arrêt ici",
    updated: "Màj :",
    gps: "Mettre à jour la position",
    refresh: "Recharger les départs",
    toggleNearby: "Basculer 1er/2e arrêt",
    toggleDisplay: "Changer mode d'affichage",
    settings: "Réglages",
    fullscreen: "Plein écran ↗️",
    lineFilters: "Filtres de lignes",
    close: "Fermer",
    selectAll: "Tout sélectionner",
    deselectAll: "Tout désélectionner",
    back: "← Retour",
    departuresAfter: "départs après",
    noData: "Données indisponibles pour cet itinéraire.",
    offline: "Pas de connexion internet.",
    apiError: "Service des horaires indisponible. Nouvel essai automatique.",
    dataFrom: "Données de {time}.",
    geoDenied: "Localisation refusée. Tapez le nom d'un arrêt.",
    geoUnavailable: "Position introuvable. Tapez le nom d'un arrêt.",
    geoUnsupported: "Localisation indisponible sur cet appareil. Tapez le nom d'un arrêt.",
    noNearbyStop: "Aucun arrêt trouvé à proximité.",
    screen: "Écran",
    keepScreenOn: "Garder l'écran allumé",
    platform: "pl.",
    language: "Langue",
    theme: "Thème",
    theme_auto: "Automatique",
    theme_light: "Clair",
    theme_dark: "Sombre",
    legalNotice: "Aucun cookie ni pistage. Préférences enregistrées uniquement sur cet appareil. Informations sans garantie. Données : opentransportdata.swiss via transport.opendata.ch. Développé avec Claude.",
    privacyTitle: "Confidentialité",
    privacyText: "Les réglages, le mode d'affichage et la dernière position (gardée 5 minutes) sont enregistrés uniquement dans le stockage local de cet appareil. Pour trouver les arrêts proches et afficher les départs, votre position et les arrêts recherchés sont envoyés à transport.opendata.ch. L'hébergeur du site peut enregistrer les adresses IP des visiteurs dans ses journaux techniques.",
    autoRefresh: "Rafraîchissement automatique",
    seconds30: "30 secondes",
    minute1: "1 minute",
    delays: "Avances / retards",
    showDelay: "Afficher les avances/retards",
    showFrom: "Afficher à partir de",
    redFrom: "Afficher en rouge à partir de",
    showThresholdLabel: "Seuil d'affichage en minutes",
    redThresholdLabel: "Seuil du rouge en minutes"
  },
  de: {
    stopPlaceholder: "Haltestelle hier eingeben",
    updated: "Akt.:",
    gps: "Standort aktualisieren",
    refresh: "Abfahrten neu laden",
    toggleNearby: "1./2. Haltestelle wechseln",
    toggleDisplay: "Anzeigemodus wechseln",
    settings: "Einstellungen",
    fullscreen: "Vollbild ↗️",
    lineFilters: "Linienfilter",
    close: "Schliessen",
    selectAll: "Alle auswählen",
    deselectAll: "Alle abwählen",
    back: "← Zurück",
    departuresAfter: "Abfahrten ab",
    noData: "Keine Daten für diese Verbindung verfügbar.",
    offline: "Keine Internetverbindung.",
    apiError: "Fahrplandienst nicht erreichbar. Neuer Versuch erfolgt automatisch.",
    dataFrom: "Daten von {time}.",
    geoDenied: "Standortzugriff verweigert. Geben Sie eine Haltestelle ein.",
    geoUnavailable: "Standort nicht gefunden. Geben Sie eine Haltestelle ein.",
    geoUnsupported: "Standort auf diesem Gerät nicht verfügbar. Geben Sie eine Haltestelle ein.",
    noNearbyStop: "Keine Haltestelle in der Nähe gefunden.",
    screen: "Bildschirm",
    keepScreenOn: "Bildschirm eingeschaltet lassen",
    platform: "Gl.",
    language: "Sprache",
    theme: "Darstellung",
    theme_auto: "Automatisch",
    theme_light: "Hell",
    theme_dark: "Dunkel",
    legalNotice: "Keine Cookies, kein Tracking. Einstellungen werden nur auf diesem Gerät gespeichert. Angaben ohne Gewähr. Daten: opentransportdata.swiss via transport.opendata.ch. Entwickelt mit Claude.",
    privacyTitle: "Datenschutz",
    privacyText: "Einstellungen, Anzeigemodus und der letzte Standort (5 Minuten lang gespeichert) werden nur im lokalen Speicher dieses Geräts abgelegt. Um Haltestellen in der Nähe zu finden und Abfahrten anzuzeigen, werden Ihr Standort und die gesuchten Haltestellen an transport.opendata.ch gesendet. Der Hoster der Website kann die IP-Adressen der Besucher in seinen technischen Protokollen speichern.",
    autoRefresh: "Automatische Aktualisierung",
    seconds30: "30 Sekunden",
    minute1: "1 Minute",
    delays: "Verfrühungen / Verspätungen",
    showDelay: "Verfrühungen/Verspätungen anzeigen",
    showFrom: "Anzeigen ab",
    redFrom: "Rot anzeigen ab",
    showThresholdLabel: "Anzeigeschwelle in Minuten",
    redThresholdLabel: "Schwelle für Rot in Minuten"
  },
  it: {
    stopPlaceholder: "Inserisci qui il nome della fermata",
    updated: "Agg.:",
    gps: "Aggiorna la posizione",
    refresh: "Ricarica le partenze",
    toggleNearby: "Alterna 1ª/2ª fermata",
    toggleDisplay: "Cambia modalità di visualizzazione",
    settings: "Impostazioni",
    fullscreen: "Schermo intero ↗️",
    lineFilters: "Filtri linee",
    close: "Chiudi",
    selectAll: "Seleziona tutto",
    deselectAll: "Deseleziona tutto",
    back: "← Indietro",
    departuresAfter: "partenze dopo le",
    noData: "Dati non disponibili per questo itinerario.",
    offline: "Nessuna connessione internet.",
    apiError: "Servizio orari non disponibile. Nuovo tentativo automatico.",
    dataFrom: "Dati delle {time}.",
    geoDenied: "Localizzazione negata. Inserisci il nome di una fermata.",
    geoUnavailable: "Posizione non trovata. Inserisci il nome di una fermata.",
    geoUnsupported: "Localizzazione non disponibile su questo dispositivo. Inserisci il nome di una fermata.",
    noNearbyStop: "Nessuna fermata trovata nelle vicinanze.",
    screen: "Schermo",
    keepScreenOn: "Mantieni lo schermo acceso",
    platform: "bin.",
    language: "Lingua",
    theme: "Tema",
    theme_auto: "Automatico",
    theme_light: "Chiaro",
    theme_dark: "Scuro",
    legalNotice: "Nessun cookie né tracciamento. Preferenze salvate solo su questo dispositivo. Informazioni senza garanzia. Dati: opentransportdata.swiss tramite transport.opendata.ch. Sviluppato con Claude.",
    privacyTitle: "Privacy",
    privacyText: "Le impostazioni, la modalità di visualizzazione e l'ultima posizione (conservata 5 minuti) sono salvate solo nella memoria locale di questo dispositivo. Per trovare le fermate vicine e mostrare le partenze, la tua posizione e le fermate cercate vengono inviate a transport.opendata.ch. L'hosting del sito può registrare gli indirizzi IP dei visitatori nei propri log tecnici.",
    autoRefresh: "Aggiornamento automatico",
    seconds30: "30 secondi",
    minute1: "1 minuto",
    delays: "Anticipi / ritardi",
    showDelay: "Mostra anticipi/ritardi",
    showFrom: "Mostra a partire da",
    redFrom: "Mostra in rosso a partire da",
    showThresholdLabel: "Soglia di visualizzazione in minuti",
    redThresholdLabel: "Soglia del rosso in minuti"
  },
  en: {
    stopPlaceholder: "Enter the stop name here",
    updated: "Upd.:",
    gps: "Update location",
    refresh: "Reload departures",
    toggleNearby: "Switch 1st/2nd stop",
    toggleDisplay: "Change display mode",
    settings: "Settings",
    fullscreen: "Full screen ↗️",
    lineFilters: "Line filters",
    close: "Close",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    back: "← Back",
    departuresAfter: "departures after",
    noData: "No data available for this route.",
    offline: "No internet connection.",
    apiError: "Timetable service unavailable. Retrying automatically.",
    dataFrom: "Data from {time}.",
    geoDenied: "Location access denied. Enter a stop name.",
    geoUnavailable: "Location not found. Enter a stop name.",
    geoUnsupported: "Location is not available on this device. Enter a stop name.",
    noNearbyStop: "No stop found nearby.",
    screen: "Screen",
    keepScreenOn: "Keep the screen on",
    platform: "pl.",
    language: "Language",
    theme: "Theme",
    theme_auto: "Automatic",
    theme_light: "Light",
    theme_dark: "Dark",
    legalNotice: "No cookies or tracking. Preferences are stored on this device only. Information without guarantee. Data: opentransportdata.swiss via transport.opendata.ch. Built with Claude.",
    privacyTitle: "Privacy",
    privacyText: "Settings, display mode and your last location (kept for 5 minutes) are stored only in this device's local storage. To find nearby stops and show departures, your location and the stops you search for are sent to transport.opendata.ch. The site's host may record visitors' IP addresses in its technical logs.",
    autoRefresh: "Automatic refresh",
    seconds30: "30 seconds",
    minute1: "1 minute",
    delays: "Early / late",
    showDelay: "Show early/late times",
    showFrom: "Show from",
    redFrom: "Show in red from",
    showThresholdLabel: "Display threshold in minutes",
    redThresholdLabel: "Red threshold in minutes"
  }
};

let current = DEFAULT_LANGUAGE;

export function browserLanguage() {
  const code = String(navigator.language || "").slice(0, 2).toLowerCase();
  return code in LANGUAGES ? code : FALLBACK_LANGUAGE;
}
export function setLanguage(lang) {
  current = lang in LANGUAGES ? lang : DEFAULT_LANGUAGE;
  document.documentElement.lang = current;
}
export function getLanguage() { return current; }
// vars: values for {name} placeholders in the text.
export function t(key, vars) {
  let text = texts[current][key] ?? texts[DEFAULT_LANGUAGE][key] ?? key;
  if (vars) for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(value);
  return text;
}
// Marked elements: data-i18n (text), data-i18n-label (title + aria-label), data-i18n-aria (aria-label only).
export function applyStaticTexts(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-label]").forEach(el => {
    el.title = t(el.dataset.i18nLabel);
    el.setAttribute("aria-label", t(el.dataset.i18nLabel));
  });
  root.querySelectorAll("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
}
