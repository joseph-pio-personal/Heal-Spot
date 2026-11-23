import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDays,
  assertWithinBookingWindow,
  hospitalLocalDate,
  hospitalLocalDateTimeToUtc,
  parseBookingDate,
  weekdayForDate,
} from "../src/booking/dates.js";
import { shouldQueueAppointmentReminder } from "../src/services/bookings.js";

test("booking dates are validated against the hospital-local seven-day window", () => {
  const now = new Date("2025-01-01T22:00:00.000Z");
  const today = hospitalLocalDate(now, "Asia/Kolkata");
  const through = addCalendarDays(today, 7);

  assert.equal(today, "2025-01-02");
  assert.doesNotThrow(() => assertWithinBookingWindow(today, "Asia/Kolkata", now));
  assert.doesNotThrow(() => assertWithinBookingWindow(through, "Asia/Kolkata", now));
  assert.throws(() => assertWithinBookingWindow("2025-01-01", "Asia/Kolkata", now), (error) => error.status === 400);
  assert.throws(() => assertWithinBookingWindow("2025-01-10", "Asia/Kolkata", now), (error) => error.status === 400);
});

test("booking date parsing rejects impossible dates and computes weekdays in UTC date space", () => {
  assert.equal(parseBookingDate("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  assert.equal(weekdayForDate("2025-01-02"), "THURSDAY");
  assert.throws(() => parseBookingDate("2025-02-29"), (error) => error.status === 400);
});

test("hospital-local midnight converts to the correct UTC instant", () => {
  assert.equal(
    hospitalLocalDateTimeToUtc("2026-11-23", "00:00", "Asia/Kolkata").toISOString(),
    "2026-11-22T18:30:00.000Z",
  );
});

test("next-day bookings made after 07:00 receive their reminder without waiting another day", () => {
  assert.equal(
    shouldQueueAppointmentReminder("2026-11-29", "Asia/Kolkata", new Date("2026-11-28T01:29:00.000Z")),
    false,
  );
  assert.equal(
    shouldQueueAppointmentReminder("2026-11-29", "Asia/Kolkata", new Date("2026-11-28T01:30:00.000Z")),
    true,
  );
});
