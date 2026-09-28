// Clima real de Cordoba, Argentina (via Open-Meteo, sin necesidad de API
// key) para decidir la capa visual: lluvia, tormenta, fuego (cielo
// despejado) o viento (objetos se mueven mas rapido y erraticos).
const LAT = -31.4201;
const LON = -64.1888;
const REFRESH_MS = 10 * 60 * 1000; // cada 10 minutos alcanza y sobra

const URL_ =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  `&current=weather_code,wind_speed_10m,precipitation&timezone=auto`;

function classify(code, windKmh) {
  // Codigos WMO que usa Open-Meteo
  const isStorm = code === 95 || code === 96 || code === 99;
  const isRain =
    (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code === 45 || code === 48;
  const isClear = code === 0 || code === 1;
  const isWindy = windKmh >= 25;

  let kind = "none";
  if (isStorm) kind = "storm";
  else if (isRain) kind = "rain";
  else if (isClear) kind = "fire";

  return { kind, windy: isWindy, windKmh };
}

export function createWeatherWatcher(onChange) {
  let current = { kind: "none", windy: false, windKmh: 0, label: "Cargando clima..." };
  onChange(current);

  async function refresh() {
    try {
      const res = await fetch(URL_);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const code = data.current?.weather_code ?? 0;
      const windKmh = data.current?.wind_speed_10m ?? 0;
      const cls = classify(code, windKmh);

      const labels = { storm: "Tormenta en Cordoba", rain: "Lluvia en Cordoba", fire: "Cielo despejado en Cordoba", none: "Cordoba" };
      current = {
        kind: cls.kind,
        windy: cls.windy,
        windKmh,
        label: labels[cls.kind] + (cls.windy ? " (con viento)" : ""),
      };
      onChange(current);
    } catch (err) {
      console.warn("No se pudo obtener el clima de Cordoba:", err);
      // se mantiene el ultimo estado conocido (o "none" si nunca funciono)
    }
  }

  refresh();
  const timer = setInterval(refresh, REFRESH_MS);

  return {
    stop: () => clearInterval(timer),
    getCurrent: () => current,
  };
}
