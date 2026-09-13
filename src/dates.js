const londonDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function londonDayStart(value) {
  if (!isCalendarDate(value)) throw new Error('Enter a valid calendar date.');
  const midnight = Date.parse(`${value}T00:00:00.000Z`);
  const previousHour = new Date(midnight - 3600000);
  return londonDate.format(previousHour) === value
    ? previousHour.toISOString()
    : new Date(midnight).toISOString();
}

export function isZonedTimestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    isCalendarDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}
