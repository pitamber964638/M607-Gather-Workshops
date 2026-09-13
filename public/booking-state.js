export function bookingStage(booking, now = Date.now()) {
  if (booking.status === 'cancelled') return 'cancelled';
  const start = Date.parse(booking.starts_at);
  if (start + booking.duration_minutes * 60000 <= now) return 'past';
  return start <= now ? 'ongoing' : 'upcoming';
}

export function reservationChanged(before, after, now = Date.now()) {
  return (
    [
      'capacity',
      'booked_seats',
      'status',
      'starts_at',
      'duration_minutes',
      'venue',
      'address',
      'title',
    ].some((field) => before.workshop[field] !== after.workshop[field]) ||
    before.booking?.id !== after.booking?.id ||
    before.booking?.seats !== after.booking?.seats ||
    (Date.parse(after.workshop.starts_at) <= now && !before.started)
  );
}
