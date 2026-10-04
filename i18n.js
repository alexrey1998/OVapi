// Any code change requires updating the version number (see sw.js).
// UI texts only; data (stops, lines, destinations) is not translated.
// Texts of each language: lang/<code>.js, loaded when the language is chosen. French is always loaded (fallback for a missing text).
import fr, { names as frNames } from "./lang/fr.js";

// LANGUAGES: always shown in the settings. MORE_LANGUAGES: offered in the search field next to them (code: name in that language).
// Codes and names: those of Firefox (product-details.mozilla.org). A language is added here once its file exists in lang/.
export const LANGUAGES = { fr: "Français", de: "Deutsch", it: "Italiano", rm: "Rumantsch", en: "English" };
export const MORE_LANGUAGES = {
  ach: "Acholi",
  af: "Afrikaans",
  an: "Aragonés",
  ar: "العربية",
  ast: "Asturianu",
  az: "Azərbaycanca",
  be: "Беларуская",
  bg: "Български",
  bn: "বাংলা",
  br: "Brezhoneg",
  bs: "Bosanski",
  ca: "Català",
  "ca-valencia": "Català (Valencià)",
  cak: "Maya Kaqchikel",
  cs: "Čeština",
  cy: "Cymraeg",
  da: "Dansk",
  dsb: "Dolnoserbšćina",
  el: "Ελληνικά",
  eo: "Esperanto",
  "es-AR": "Español (de Argentina)",
  "es-CL": "Español (de Chile)",
  "es-ES": "Español (de España)",
  "es-MX": "Español (de México)",
  et: "Eesti keel",
  eu: "Euskara",
  fa: "فارسی",
  ff: "Pulaar-Fulfulde",
  fi: "Suomi",
  fur: "Furlan",
  "fy-NL": "Frysk",
  "ga-IE": "Gaeilge",
  gd: "Gàidhlig",
  gl: "Galego",
  gn: "Avañe'ẽ",
  "gu-IN": "ગુજરાતી",
  he: "עברית",
  "hi-IN": "हिन्दी",
  hr: "Hrvatski",
  hsb: "Hornjoserbsce",
  hu: "Magyar",
  "hy-AM": "Հայերեն",
  ia: "Interlingua",
  id: "Bahasa Indonesia",
  is: "Íslenska",
  ja: "日本語",
  ka: "ქართული",
  kab: "Taqbaylit",
  kk: "Қазақ",
  km: "ខ្មែរ",
  kn: "ಕನ್ನಡ",
  ko: "한국어",
  lij: "Ligure",
  lt: "Lietuvių",
  lv: "Latviešu",
  mk: "Македонски",
  mr: "मराठी",
  ms: "Melayu",
  my: "မြန်မာဘာသာ",
  "nb-NO": "Norsk bokmål",
  "ne-NP": "नेपाली",
  nl: "Nederlands",
  "nn-NO": "Norsk nynorsk",
  oc: "Occitan",
  "pa-IN": "ਪੰਜਾਬੀ",
  pl: "Polski",
  "pt-BR": "Português (do Brasil)",
  "pt-PT": "Português (Europeu)",
  ro: "Română",
  ru: "Русский",
  sat: "ᱥᱟᱱᱛᱟᱲᱤ",
  sc: "Sardu",
  sco: "Scots",
  si: "සිංහල",
  sk: "Slovenčina",
  skr: "سرائیکی",
  sl: "Slovenščina",
  son: "Soŋay",
  sq: "Shqip",
  sr: "Српски",
  "sv-SE": "Svenska",
  szl: "Ślōnsko godka",
  ta: "தமிழ்",
  te: "తెలుగు",
  tg: "Тоҷикӣ",
  th: "ไทย",
  tl: "Tagalog",
  tr: "Türkçe",
  trs: "Triqui",
  uk: "Українська",
  ur: "اردو",
  uz: "Oʻzbek tili",
  vi: "Tiếng Việt",
  xh: "isiXhosa",
  "zh-CN": "中文 (简体)",
  "zh-TW": "正體中文 (繁體)"
};
export const ALL_LANGUAGES = { ...LANGUAGES, ...MORE_LANGUAGES };
export const DEFAULT_LANGUAGE = "fr";
const FALLBACK_LANGUAGE = "en";
// Written right to left: the whole page is mirrored, as on the official sites of the countries using these languages.
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "skr", "ur"]);
// Browser codes that do not lead to the right language by themselves (old codes, Swiss German, regional variants).
const LANGUAGE_ALIASES = {
  gsw: "de",
  "ca-es-valencia": "ca-valencia",
  es: "es-ES",
  "es-419": "es-MX",
  fil: "tl",
  in: "id",
  iw: "he",
  no: "nb-NO",
  pt: "pt-PT",
  zh: "zh-CN",
  "zh-hans": "zh-CN",
  "zh-hant": "zh-TW",
  "zh-hk": "zh-TW",
  "zh-mo": "zh-TW"
};
// Spanish of Latin America: the closest variant of the list (Rioplatense for Uruguay and Paraguay, otherwise Mexico).
for (const region of ["bo", "co", "cr", "cu", "do", "ec", "gt", "hn", "ni", "pa", "pe", "pr", "sv", "us", "ve"]) LANGUAGE_ALIASES["es-" + region] = "es-MX";
for (const region of ["py", "uy"]) LANGUAGE_ALIASES["es-" + region] = "es-AR";
// Codes given to the browser to name a language in the list (script instead of country for Chinese).
const DISPLAY_CODES = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant", "ca-valencia": "ca-ES-valencia" };

const texts = { fr };
// Names of the languages in each loaded language (lang/<code>.js: names), the same in every browser.
const languageNames = { fr: frNames };

let current = DEFAULT_LANGUAGE;
let requested = DEFAULT_LANGUAGE;

// Language of the list for a browser code ("de-CH", "ast", "pt-BR", "sv"…), or null.
// The full code is tried first, then shorter and shorter (pt-BR-x → pt-BR → pt); the first part alone also finds a variant (sv → sv-SE).
export function matchLanguage(tag) {
  const codes = Object.keys(ALL_LANGUAGES);
  const parts = String(tag || "").toLowerCase().split(/[-_]/);
  for (let n = parts.length; n >= 1; n--) {
    const key = parts.slice(0, n).join("-");
    const found = [LANGUAGE_ALIASES[key], codes.find(c => c.toLowerCase() === key)]
      .find(c => c && c in ALL_LANGUAGES);
    if (found) return found;
    if (n === 1) return codes.find(c => c.toLowerCase().split("-")[0] === key) ?? null;
  }
  return null;
}
export function browserLanguage() {
  return matchLanguage(navigator.language) ?? FALLBACK_LANGUAGE;
}
// Loads the texts of the language if needed. If the file cannot be loaded (offline), the French texts are used.
export async function setLanguage(lang) {
  const code = lang in ALL_LANGUAGES ? lang : DEFAULT_LANGUAGE;
  requested = code;
  if (!texts[code]) {
    try {
      const file = await import(`./lang/${code}.js`);
      texts[code] = file.default;
      languageNames[code] = file.names;
    } catch {}
  }
  if (requested !== code) return; // another language was chosen in the meantime
  current = code;
  document.documentElement.lang = code;
  document.documentElement.dir = RTL_LANGUAGES.has(code) ? "rtl" : "ltr";
}
export function getLanguage() { return current; }
export function isRtl() { return document.documentElement.dir === "rtl"; }
// Name of a language in the language of the interface ("ja" → "japonais"), or in the language given ("en" → "Japanese"),
// or "" if the browser does not know it.
// The region is named only when the list has several variants of the language (pt-BR, pt-PT), not for hy-AM alone.
// The names of lang/<code>.js come first; the browser gives the others (English for the search, or a file that did not load).
export function languageNameInUi(code, inLanguage = current) {
  const own = languageNames[inLanguage]?.[code];
  if (own) return own;
  const base = code.split("-")[0];
  const variants = Object.keys(ALL_LANGUAGES).filter(c => c.split("-")[0] === base).length;
  try {
    const name = new Intl.DisplayNames([inLanguage], { type: "language" }).of(DISPLAY_CODES[code] ?? (variants > 1 ? code : base));
    return name && name.toLowerCase() !== code.toLowerCase() ? name : "";
  } catch {
    return "";
  }
}
// vars: values for {name} placeholders in the text.
export function t(key, vars) {
  let text = texts[current]?.[key] ?? texts[DEFAULT_LANGUAGE][key] ?? key;
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
