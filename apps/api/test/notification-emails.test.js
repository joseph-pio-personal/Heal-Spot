import assert from "node:assert/strict";
import test from "node:test";
import { encryptEmailOtp, hashEmailOtp } from "../src/auth/email-otp.js";
import { buildEmail } from "../src/notifications/processor.js";

process.env.JWT_SECRET = "test-secret-with-more-than-thirty-two-characters";
process.env.WEB_APP_URL = "http://localhost:5173";

const booking = {
  id: "booking-id",
  status: "BOOKED",
  date: new Date("2026-11-29T00:00:00.000Z"),
  tokenNumber: 5,
  feeAtBooking: { toFixed: () => "750.00" },
  doctor: {
    name: "Dr Example",
    department: { name: "General Medicine" },
    schedules: [{
      weekday: "SUNDAY",
      startTime: new Date("1970-01-01T08:00:00.000Z"),
      endTime: new Date("1970-01-01T12:00:00.000Z"),
    }],
  },
  patientProfile: { name: "Patient Example" },
  bookedByAccount: { email: "patient@example.com" },
};

function bookingDatabase(currentBooking = booking) {
  return {
    booking: { findUnique: async () => currentBooking },
  };
}

test("patient registration email contains the current 6-digit code and no verification link", async () => {
  const accountId = "account-id";
  const code = "123456";
  const email = await buildEmail({
    patientAccount: {
      findUnique: async () => ({
        email: "patient@example.com",
        verifiedAt: null,
        verificationOtpHash: hashEmailOtp(accountId, code),
        verificationOtpExpiresAt: new Date(Date.now() + 60_000),
        profiles: [{ name: "Patient Example" }],
      }),
    },
  }, {
    eventType: "PATIENT_EMAIL_VERIFICATION",
    payload: { accountId, encryptedCode: encryptEmailOtp(code) },
  });

  assert.equal(email.to, "patient@example.com");
  assert.match(email.subject, /verification code/i);
  assert.match(email.text, /Patient Example/);
  assert.match(email.text, /123456/);
  assert.match(email.text, /expires in 10 minutes/i);
  assert.doesNotMatch(email.text, /http|verify-email/i);
});

test("patient registration email skips stale or expired codes", async (t) => {
  for (const [label, verificationOtpHash, verificationOtpExpiresAt] of [
    ["stale", hashEmailOtp("account-id", "654321"), new Date(Date.now() + 60_000)],
    ["expired", hashEmailOtp("account-id", "123456"), new Date(Date.now() - 1_000)],
  ]) {
    await t.test(label, async () => {
      const email = await buildEmail({
        patientAccount: {
          findUnique: async () => ({
            email: "patient@example.com",
            verifiedAt: null,
            verificationOtpHash,
            verificationOtpExpiresAt,
            profiles: [],
          }),
        },
      }, {
        eventType: "PATIENT_EMAIL_VERIFICATION",
        payload: { accountId: "account-id", encryptedCode: encryptEmailOtp("123456") },
      });
      assert.equal(email, null);
    });
  }
});

test("booking confirmation includes patient, doctor, token, clinic hours, and fee", async () => {
  const email = await buildEmail(bookingDatabase(), {
    eventType: "BOOKING_CONFIRMED",
    payload: { bookingId: booking.id },
  });

  assert.equal(email.to, "patient@example.com");
  assert.match(email.subject, /token 5/);
  assert.match(email.text, /Patient: Patient Example/);
  assert.match(email.text, /Doctor: Dr Example \(General Medicine\)/);
  assert.match(email.text, /Clinic hours: 08:00-12:00/);
  assert.match(email.text, /Consultation fee: INR 750\.00/);
});

test("reminders, cancellations, and two-position queue alerts use current booking details", async (t) => {
  const cases = [
    {
      eventType: "APPOINTMENT_REMINDER",
      payload: { bookingId: booking.id },
      expected: /appointment tomorrow/,
    },
    {
      eventType: "BOOKING_CANCELLED",
      payload: { bookingId: booking.id, reason: "Cancelled by patient." },
      currentBooking: { ...booking, status: "CANCELLED" },
      expected: /Cancelled by patient\./,
    },
    {
      eventType: "DOCTOR_LEAVE_CANCELLATION",
      payload: { bookingId: booking.id, reason: "Doctor is on leave." },
      currentBooking: { ...booking, status: "CANCELLED" },
      expected: /doctor is on leave/,
    },
    {
      eventType: "TOKEN_APPROACHING",
      payload: { bookingId: booking.id, currentTokenNumber: 3 },
      expected: /attending token 3.*two places away/s,
    },
  ];

  for (const item of cases) {
    await t.test(item.eventType, async () => {
      const email = await buildEmail(bookingDatabase(item.currentBooking), item);
      assert.equal(email.to, "patient@example.com");
      assert.match(email.text, item.expected);
    });
  }
});

test("daily doctor summary includes the zero-booking case", async () => {
  const email = await buildEmail({
    doctor: { findUnique: async () => ({ name: "Dr Example", email: "doctor@example.com" }) },
  }, {
    eventType: "DOCTOR_DAILY_SUMMARY",
    payload: { doctorId: "doctor-id", date: "2026-11-29", bookedCount: 0 },
  });

  assert.equal(email.to, "doctor@example.com");
  assert.match(email.text, /0 active token booking/);
});

test("prescription email contains a login-required secure app link", async () => {
  const email = await buildEmail({
    medicalDocument: {
      findFirst: async () => ({
        id: "document-id",
        visit: {
          booking: {
            patientProfile: { name: "Patient Example" },
            bookedByAccount: { email: "patient@example.com" },
          },
        },
      }),
    },
  }, {
    eventType: "PRESCRIPTION_AVAILABLE",
    payload: { documentId: "document-id" },
  });

  assert.equal(email.to, "patient@example.com");
  assert.match(email.text, /#document\/document-id/);
  assert.match(email.text, /requires your patient account sign-in/);
});
