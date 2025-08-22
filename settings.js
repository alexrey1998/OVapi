// settings.js
export const settings = {
  // Nombre de départs à récupérer auprès de l’API (utilisé partout)
  stationboardLimit: 50,

  // Période max d’affichage des départs (hh:mm:ss)
  maxDisplayPeriod: "01:30:00",

  // Limite courte pour l’ajustement de destination
  adjustLookupLimit: 5,

  // Intervalle de rafraîchissement (hh:mm:ss)
  refreshInterval: "00:01:00",

  // Apparence de la partie après la virgule (suffixe) des noms d’arrêts
  stopSuffix: {
    // Taille du suffixe en % par rapport au texte normal (ex: 75 => 75%)
    sizeRatioPercent: 75,
    // Couleur du suffixe : "default" (hérite/noir actuel), ou "blue", "green", "#000000", etc.
    color: "default"
  }
};
