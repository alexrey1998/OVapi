// settings.js
export const settings = {
  // Nombre max de départs récupérés depuis l'API
  stationboardLimit: 150,
  // Période max d'affichage des départs (format hh:mm:ss)
  maxDisplayPeriod: "06:30:00",
  // Intervalle de rafraîchissement automatique (format hh:mm:ss)
  refreshInterval: "00:01:00",
  stopName: {
    // Taille du préfixe (avant la virgule) en % de la taille normale
    prefixScalePct: 80,
    // Couleur du suffixe (après la virgule) - "default" ou valeur CSS valide
    suffixColor: "#2d327d"
  }
};