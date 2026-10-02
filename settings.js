// Any code change requires updating the version number (see sw.js).
export const settings = {
  // Max number of departures fetched from the API
  stationboardLimit: 150,
  // Max display window for departures (hh:mm:ss)
  maxDisplayPeriod: "06:30:00",
  // Auto-refresh interval (hh:mm:ss)
  refreshInterval: "00:01:00",
  stopName: {
    // Size of the prefix (before the comma) in % of the normal size
    prefixScalePct: 80,
    // Color of the suffix (after the comma): "default" or any valid CSS color
    suffixColor: "#2d327d",
    // Same, in dark mode
    suffixColorDark: "#A5ABE8"
  }
};