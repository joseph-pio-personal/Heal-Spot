import assert from "node:assert/strict";
import test from "node:test";
import { addCalendarDays, hospitalLocalDate, weekdayForDate } from "../src/booking/dates.js";
import { listAvailability } from "../src/booking/availability.js";

const TIME_ZONE = "Asia/Kolkata";
const DOCTOR_ID = "doctor-id";

function nextMonday() {
  const today = hospitalLocalDate(new Date(), TIME_ZONE);
  for (let offset = 1; offset <= 7; offset += 1) {
    const date = addCalendarDays(today, offset);
    if (weekdayForDate(date) === "MONDAY") return date;
  }
  throw new Error("Could not find Monday within the booking window.");
}

function availabilityDatabase({ sessions, doctorStatus = "NOT_YET_ARRIVED", bookings = [] }) {
  return {
    hospitalSettings: {
      findUnique: async () => ({ timezone: TIME_ZONE }),
    },
    doctor: {
      findMany: async ({ include }) => [{
        id: DOCTOR_ID,
        departmentId: "department-id",
        name: "Dr. Test Doctor",
        photoUrl: null,
        qualification: "MBBS",
        specialization: "Cardiology",
        experienceYears: 10,
        consultationFee: { toFixed: () => "500.00" },
        department: { id: "department-id", name: "Cardiology", status: "ACTIVE" },
        schedules: sessions.map((session, index) => ({
          id: `session-${index}`,
          weekday: include.schedules.where.weekday,
          startTime: new Date(`1970-01-01T${session.startTime}:00.000Z`),
          endTime: new Date(`1970-01-01T${session.endTime}:00.000Z`),
          maxTokens: session.maxTokens,
          isActive: true,
        })),
      }],
    },
    doctorDay: {
      findMany: async () => [{ doctorId: DOCTOR_ID, status: doctorStatus }],
    },
    booking: {
      findMany: async () => bookings,
    },
  };
}

test("patient availability reports remaining tokens and availability for scheduled doctors", async () => {
  const database = availabilityDatabase({
    sessions: [
      { startTime: "09:00", endTime: "12:00", maxTokens: 6 },
      { startTime: "13:00", endTime: "16:00", maxTokens: 4 },
    ],
    bookings: [
      { doctorId: DOCTOR_ID, tokenNumber: 1, status: "BOOKED" },
      { doctorId: DOCTOR_ID, tokenNumber: 2, status: "COMPLETED" },
      { doctorId: DOCTOR_ID, tokenNumber: 3, status: "CANCELLED" },
    ],
  });

  const result = await listAvailability(database, {
    dateValue: nextMonday(),
    search: "",
  });
  const [doctor] = result.doctors;

  assert.equal(doctor.capacity, 10);
  assert.equal(doctor.remaining, 8);
  assert.equal(doctor.lastTokenNumber, 3);
  assert.equal(doctor.available, true);
  assert.equal(doctor.availabilityReason, null);
});

test("patient availability explains missing sessions, exhausted tokens, and doctor leave", async () => {
  const dateValue = nextMonday();
  const noSessions = await listAvailability(
    availabilityDatabase({ sessions: [] }),
    { dateValue, search: "" },
  );
  assert.equal(noSessions.doctors[0].available, false);
  assert.equal(noSessions.doctors[0].availabilityReason, "NO_CLINIC_SESSIONS");

  const noTokens = await listAvailability(
    availabilityDatabase({
      sessions: [{ startTime: "09:00", endTime: "16:00", maxTokens: 1 }],
      bookings: [{ doctorId: DOCTOR_ID, tokenNumber: 1, status: "BOOKED" }],
    }),
    { dateValue, search: "" },
  );
  assert.equal(noTokens.doctors[0].remaining, 0);
  assert.equal(noTokens.doctors[0].availabilityReason, "NO_TOKENS_REMAINING");

  const onLeave = await listAvailability(
    availabilityDatabase({
      sessions: [{ startTime: "09:00", endTime: "16:00", maxTokens: 2 }],
      doctorStatus: "ON_LEAVE",
    }),
    { dateValue, search: "" },
  );
  assert.equal(onLeave.doctors[0].availabilityReason, "DOCTOR_ON_LEAVE");
});

test("patient availability closes a same-day clinic session after its end time", async () => {
  const dateValue = hospitalLocalDate(new Date(), TIME_ZONE);
  const result = await listAvailability(
    availabilityDatabase({
      sessions: [{ startTime: "00:00", endTime: "00:00", maxTokens: 2 }],
      doctorStatus: "PRESENT",
    }),
    { dateValue, search: "" },
  );

  assert.equal(result.doctors[0].availabilityReason, "CLINIC_SESSIONS_ENDED");
  assert.equal(result.doctors[0].available, false);
});

test("patient availability keeps a same-day clinic session open before its end time", async () => {
  const dateValue = hospitalLocalDate(new Date(), TIME_ZONE);
  const result = await listAvailability(
    availabilityDatabase({
      sessions: [{ startTime: "00:00", endTime: "23:59", maxTokens: 30 }],
      doctorStatus: "PRESENT",
    }),
    { dateValue, search: "" },
  );

  assert.equal(result.doctors[0].availabilityReason, null);
  assert.equal(result.doctors[0].available, true);
});
