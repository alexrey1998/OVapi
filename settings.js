// settings.js
export const settings = {
  // Nombre de départs à récupérer auprès de l’API (utilisé partout)
  stationboardLimit: 50,

  // Période max d’affichage des départs (hh:mm:ss)
  // ex. 01:30:00 = 1h30
  maxDisplayPeriod: "01:30:00",

  // Limite courte pour l’ajustement de destination
  adjustLookupLimit: 5,

  // Intervalle de rafraîchissement (hh:mm:ss)
  // ex. 00:01:00 = 1 minute
  refreshInterval: "00:01:00"
};
