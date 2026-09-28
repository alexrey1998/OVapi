// theme.js
// Note pour les IA : toute modification du code implique de changer le numéro de version (voir sw.js).
// Mode clair entre le lever et le coucher du soleil, sombre sinon (ou choix manuel dans les réglages).
// Le mode en cache est appliqué avant l'affichage par le petit script en tête de <body> (index.html).

// Centre géographique de la Suisse (Älggi-Alp, Sachseln).
const LATITUDE = 46.8010;
const LONGITUDE = 8.2266;
const CACHE_KEY = "theme.v1";
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
// Couleur de la barre du navigateur (meta theme-color) selon le mode.
const BROWSER_BAR_COLORS = { light: "#007bff", dark: "#121417" };
export const THEME_CHOICES = ["auto", "light", "dark"];

const rad = deg => deg * Math.PI / 180;
const deg = r => r * 180 / Math.PI;

// Lever et coucher du soleil du jour de `date` (formule NOAA : déclinaison solaire + équation du temps).
// Calcul en UTC : les objets Date renvoyés s'affichent d'eux-mêmes à l'heure locale (été/hiver compris).
export function sunTimes(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const midnightUtc = Date.UTC(y, m, d);
  const dayOfYear = Math.round((midnightUtc - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const daysInYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  const g = 2 * Math.PI / daysInYear * (dayOfYear - 1);
  const eqTimeMin = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = rad(LATITUDE);
  // 90,833° : réfraction atmosphérique et rayon du disque solaire.
  const cosH = Math.cos(rad(90.833)) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const hourAngle = deg(Math.acos(Math.min(1, Math.max(-1, cosH))));
  const sunriseMin = 720 - 4 * (LONGITUDE + hourAngle) - eqTimeMin;
  const sunsetMin = 720 - 4 * (LONGITUDE - hourAngle) - eqTimeMin;
  return {
    sunrise: new Date(midnightUtc + sunriseMin * 60000),
    sunset: new Date(midnightUtc + sunsetMin * 60000)
  };
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    return c && typeof c === "object" ? c : null;
  } catch { return null; }
}
function writeCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
}

// Heures du jour : celles du cache si elles datent d'aujourd'hui, sinon recalculées.
function todaySunTimes(now) {
  const today = localDateKey(now);
  const c = readCache();
  if (c && c.date === today && Number.isFinite(c.sunrise) && Number.isFinite(c.sunset)) {
    return { date: today, sunrise: c.sunrise, sunset: c.sunset };
  }
  const { sunrise, sunset } = sunTimes(now);
  return { date: today, sunrise: sunrise.getTime(), sunset: sunset.getTime() };
}

function applyMode(mode) {
  const body = document.body;
  body.classList.toggle("dark-mode", mode === "dark");
  body.classList.toggle("light-mode", mode === "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BROWSER_BAR_COLORS[mode]);
}

let preference = "auto";
function update() {
  const now = new Date();
  const sun = todaySunTimes(now);
  const nowMs = now.getTime();
  const mode = preference !== "auto" ? preference
    : (nowMs >= sun.sunrise && nowMs < sun.sunset ? "light" : "dark");
  applyMode(mode);
  writeCache({ mode, ...sun });
}

// Au démarrage : applique le mode, puis vérifie toutes les 10 min et au retour de l'app au premier plan.
export function startTheme(pref) {
  preference = THEME_CHOICES.includes(pref) ? pref : "auto";
  update();
  setInterval(update, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) update();
  });
}
export function setThemePreference(pref) {
  preference = THEME_CHOICES.includes(pref) ? pref : "auto";
  update();
}
