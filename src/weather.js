export function createWeatherService(fetcher = fetch) {
  const cache = new Map();
  const pending = new Map();
  return async function getWeather(workshop) {
    const key = `${workshop.latitude},${workshop.longitude}`;
    const cached = cache.get(key);
    let result;
    if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) result = cached;
    else {
      try {
        if (!pending.has(key)) {
          pending.set(
            key,
            (async () => {
              const url = new URL('https://api.open-meteo.com/v1/forecast');
              url.search = new URLSearchParams({
                latitude: workshop.latitude,
                longitude: workshop.longitude,
                daily:
                  'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
                timezone: 'Europe/London',
                forecast_days: '16',
              });
              const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
              if (!response.ok) throw new Error('Weather provider unavailable');
              const payload = await response.json();
              const daily = payload.daily;
              if (
                !daily ||
                !Array.isArray(daily.time) ||
                ![
                  'temperature_2m_max',
                  'temperature_2m_min',
                  'precipitation_probability_max',
                  'weather_code',
                ].every((k) => Array.isArray(daily[k]) && daily[k].length === daily.time.length)
              )
                throw new Error('Invalid weather data');
              const value = { daily, timestamp: Date.now() };
              if (cache.size >= 100) cache.delete(cache.keys().next().value);
              cache.set(key, value);
              return value;
            })(),
          );
        }
        result = await pending.get(key);
      } catch {
        if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000)
          result = { ...cached, stale: true };
        else
          return {
            status: 'unavailable',
            message: 'The weather service is temporarily unavailable. Please try again later.',
            source: 'Open-Meteo',
          };
      } finally {
        pending.delete(key);
      }
    }
    const eventDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(workshop.starts_at));
    const index = result.daily.time.indexOf(eventDate);
    if (index < 0)
      return {
        status: 'outside_range',
        message: 'Forecasts are available up to 16 days ahead. Check back closer to your workshop.',
        source: 'Open-Meteo',
      };
    const values = [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'weather_code',
    ].map((k) => result.daily[k][index]);
    if (!values.every(Number.isFinite))
      return {
        status: 'unavailable',
        message: 'A complete forecast is not yet available for this date.',
        source: 'Open-Meteo',
      };
    return {
      status: 'available',
      date: eventDate,
      high: values[0],
      low: values[1],
      rain: values[2],
      code: values[3],
      updated_at: new Date(result.timestamp).toISOString(),
      stale: !!result.stale,
      source: 'Open-Meteo',
    };
  };
}
