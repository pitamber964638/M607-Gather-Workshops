import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCalendarDate, londonDayStart, isZonedTimestamp } from '../src/dates.js';
import { bookingStage, reservationChanged } from '../public/booking-state.js';

test('date validation rejects impossible dates and ambiguous timestamps', () => {
  for (const value of ['2027-02-29', '2026-04-31', '2026-13-01', 'bad', ['2026-01-01']])
    assert.equal(isCalendarDate(value), false);
  assert.equal(isCalendarDate('2028-02-29'), true);
  assert.equal(isZonedTimestamp('2028-02-29T12:00:00Z'), true);
  assert.equal(isZonedTimestamp('2028-02-29T12:00:00+05:30'), true);
  assert.equal(isZonedTimestamp('2028-02-29T12:00:00'), false);
  assert.equal(isZonedTimestamp('2027-02-29T12:00:00Z'), false);
});

test('London date filters respect summer time and both daylight-saving transitions', () => {
  assert.equal(londonDayStart('2027-06-15'), '2027-06-14T23:00:00.000Z');
  assert.equal(londonDayStart('2027-01-15'), '2027-01-15T00:00:00.000Z');
  assert.equal(londonDayStart('2027-03-28'), '2027-03-28T00:00:00.000Z');
  assert.equal(londonDayStart('2027-03-29'), '2027-03-28T23:00:00.000Z');
  assert.equal(londonDayStart('2027-10-31'), '2027-10-30T23:00:00.000Z');
  assert.equal(londonDayStart('2027-11-01'), '2027-11-01T00:00:00.000Z');
});

test('booking status distinguishes upcoming, ongoing, completed and cancelled sessions', () => {
  const booking = { status: 'confirmed', starts_at: '2027-01-01T12:00:00Z', duration_minutes: 90 };
  assert.equal(bookingStage(booking, Date.parse('2027-01-01T11:59:00Z')), 'upcoming');
  assert.equal(bookingStage(booking, Date.parse('2027-01-01T12:00:00Z')), 'ongoing');
  assert.equal(bookingStage(booking, Date.parse('2027-01-01T13:29:00Z')), 'ongoing');
  assert.equal(bookingStage(booking, Date.parse('2027-01-01T13:30:00Z')), 'past');
  assert.equal(
    bookingStage({ ...booking, status: 'cancelled' }, Date.parse('2027-01-01T12:30:00Z')),
    'cancelled',
  );
});

test('live availability detects capacity, booking, venue and schedule changes', () => {
  const before = {
    workshop: {
      capacity: 10,
      booked_seats: 4,
      status: 'published',
      starts_at: '2099-01-01T12:00:00Z',
      venue: 'Studio',
    },
    booking: null,
    started: false,
  };
  assert.equal(reservationChanged(before, before), false);
  for (const update of [
    { capacity: 5 },
    { booked_seats: 8 },
    { status: 'cancelled' },
    { venue: 'New Studio' },
    { starts_at: '2099-02-01T12:00:00Z' },
  ])
    assert.equal(
      reservationChanged(before, { ...before, workshop: { ...before.workshop, ...update } }),
      true,
    );
  assert.equal(reservationChanged(before, { ...before, booking: { id: 1, seats: 1 } }), true);
  assert.equal(reservationChanged(before, before, Date.parse('2099-01-01T12:00:00Z')), true);
});
