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

  // Apparence des noms d’arrêts avec virgule :
  // - le PRÉFIXE (avant la virgule) est redimensionné
  // - le SUFFIXE (à partir de la virgule) garde la taille normale mais peut changer de couleur
  // - s’il n’y a PAS de virgule, on applique la couleur du suffixe à tout le nom (taille inchangée)
  stopSuffix: {
    // Taille du PRÉFIXE en % par rapport au texte normal (ex: 75 => 75%)
    sizeRatioPercent: 75,
    // Couleur du SUFFIXE : "default" (hérite/noir), ou "blue", "green", "#000000", etc.
    color: "#2d327d"
  }
};
