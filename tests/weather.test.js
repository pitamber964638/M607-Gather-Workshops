import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherService } from '../src/weather.js';
const workshop = { latitude: 51.5, longitude: -0.1, starts_at: '2026-09-15T13:00:00.000Z' };
const daily = {
  time: ['2026-09-15'],
  temperature_2m_max: [20],
  temperature_2m_min: [12],
  precipitation_probability_max: [30],
  weather_code: [3],
};
test('weather uses the provider endpoint, workshop date, and a shared cache', async () => {
  let calls = 0,
    url;
  const service = createWeatherService(async (value) => {
    calls++;
    url = new URL(value);
    return { ok: true, json: async () => ({ daily }) };
  });
  const [a, b] = await Promise.all([service(workshop), service(workshop)]);
  await service(workshop);
  assert.equal(calls, 1);
  assert.equal(a.status, 'available');
  assert.equal(b.rain, 30);
  assert.equal(a.high, 20);
  assert.equal(a.date, '2026-09-15');
  assert.equal(url.hostname, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('timezone'), 'Europe/London');
});
test('forecast dates outside the provider window are not fabricated', async () => {
  const service = createWeatherService(async () => ({ ok: true, json: async () => ({ daily }) }));
  assert.equal(
    (await service({ ...workshop, starts_at: '2026-11-01T13:00:00.000Z' })).status,
    'outside_range',
  );
});
test('provider errors and malformed or incomplete data degrade gracefully', async () => {
  for (const fetcher of [
    async () => {
      throw new Error('Offline');
    },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({ daily: {} }) }),
    async () => ({
      ok: true,
      json: async () => ({ daily: { ...daily, temperature_2m_max: [null] } }),
    }),
  ]) {
    const result = await createWeatherService(fetcher)(workshop);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.high, undefined);
  }
});
test('workshop date is converted to the venue timezone', async () => {
  const service = createWeatherService(async () => ({ ok: true, json: async () => ({ daily }) }));
  assert.equal(
    (await service({ ...workshop, starts_at: '2026-09-14T23:30:00.000Z' })).date,
    '2026-09-15',
  );
});
