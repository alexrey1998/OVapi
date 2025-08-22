export const settings = {
  // Nombre de départs à récupérer auprès de l’API stationboard
  stationboardLimit: 50,

  // Période d’affichage max des départs (hh:mm:ss)
  maxDisplayPeriod: "01:30:00",

  // Intervalle de rafraîchissement des données (hh:mm:ss)
  refreshInterval: "00:01:00",

  // Style des noms contenant une virgule: "Préfixe, " + "Suffixe"
  stopName: {
    // Taille du PRÉFIXE en pourcentage de la taille normale
    // Le SUFFIXE reste à 100%
    prefixScalePct: 80,
    // Couleur du SUFFIXE (et de tout le nom s’il n’y a pas de virgule).
    // "default" = couleur par défaut du texte. Sinon, toute valeur CSS valide "blue", "#008000", etc.
    suffixColor: "default"
  }
};
