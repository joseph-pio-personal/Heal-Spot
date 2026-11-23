import { weekdayForDate } from "../booking/dates.js";
import { decryptEmailOtp, hashEmailOtp } from "../auth/email-otp.js";
import { emailService } from "./email.js";

const MAX_ATTEMPTS = 5;
const PROCESSING_LEASE_MS = 60_000;

function emailErrorCode(error) {
  const code = String(error?.code ?? error?.name ?? "EMAIL_DELIVERY_FAILED");
  return code.slice(0, 500);
}

function appUrl() {
  const configuredUrl = process.env.WEB_APP_URL || process.env.CORS_ORIGIN?.split(",")[0];
  if (!configuredUrl) throw new Error("WEB_APP_URL or CORS_ORIGIN is required for email links.");
  return configuredUrl.trim().replace(/\/+$/, "");
}

function dateLabel(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

async function findBooking(database, bookingId) {
  if (typeof bookingId !== "string") return null;
  return database.booking.findUnique({
    where: { id: bookingId },
    include: {
      doctor: {
        select: {
          name: true,
          department: { select: { name: true } },
          schedules: { where: { isActive: true } },
        },
      },
      patientProfile: { select: { name: true } },
      bookedByAccount: { select: { id: true, email: true } },
    },
  });
}

export async function buildEmail(database, event) {
  const payload = event.payload;
  if (!payload || typeof payload !== "object") return null;

  if (event.eventType === "PATIENT_EMAIL_VERIFICATION") {
    if (typeof payload.encryptedCode !== "string") return null;
    const code = decryptEmailOtp(payload.encryptedCode);
    const account = await database.patientAccount.findUnique({
      where: { id: payload.accountId },
      select: {
        email: true,
        verifiedAt: true,
        verificationOtpHash: true,
        verificationOtpExpiresAt: true,
        profiles: { orderBy: { createdAt: "asc" }, take: 1 },
      },
    });
    if (
      !account?.email
      || account.verifiedAt
      || !code
      || account.verificationOtpHash !== hashEmailOtp(payload.accountId, code)
      || !account.verificationOtpExpiresAt
      || account.verificationOtpExpiresAt <= new Date()
    ) return null;
    return {
      to: account.email,
      subject: "Your Heal Spot verification code",
      text: [
        `Hello ${account.profiles[0]?.name ?? "Patient"},`,
        "",
        `Your Heal Spot email verification code is: ${code}`,
        "",
        "This code expires in 10 minutes. Do not share it with anyone.",
      ].join("\n"),
    };
  }

  if (event.eventType === "DOCTOR_DAILY_SUMMARY") {
    const doctor = await database.doctor.findUnique({
      where: { id: payload.doctorId },
      select: { name: true, email: true },
    });
    if (!doctor?.email) return null;
    return {
      to: doctor.email,
      subject: `Today's booking summary - ${dateLabel(payload.date)}`,
      text: [
        `Hello ${doctor.name},`,
        "",
        `You have ${Number(payload.bookedCount)} active token booking(s) for ${dateLabel(payload.date)}.`,
        "Sign in to Heal Spot to review your schedule and queue.",
      ].join("\n"),
    };
  }

  if (event.eventType === "PRESCRIPTION_AVAILABLE") {
    const document = await database.medicalDocument.findFirst({
      where: { id: payload.documentId, type: "PRESCRIPTION", deletedAt: null },
      include: {
        visit: {
          include: {
            booking: {
              include: {
                patientProfile: { select: { name: true } },
                bookedByAccount: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    const booking = document?.visit.booking;
    if (!booking?.bookedByAccount?.email) return null;
    return {
      to: booking.bookedByAccount.email,
      subject: "A prescription is available in Heal Spot",
      text: [
        `Hello ${booking.patientProfile.name},`,
        "",
        "A prescription from your visit is available. Sign in to Heal Spot to securely download it:",
        `${appUrl()}/#document/${document.id}`,
        "",
        "This link requires your patient account sign-in. Do not forward it.",
      ].join("\n"),
    };
  }

  if (event.eventType === "PRESCRIPTION_FINALIZED") {
    const prescription = await database.prescription.findFirst({
      where: { id: payload.prescriptionId, status: "FINALIZED" },
      include: {
        doctor: { select: { name: true } },
        visit: {
          include: {
            booking: {
              include: {
                patientProfile: { select: { name: true } },
                bookedByAccount: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    const booking = prescription?.visit.booking;
    if (!booking?.bookedByAccount?.email) return null;
    return {
      to: booking.bookedByAccount.email,
      subject: "A prescription is ready in Heal Spot",
      text: [
        `Hello ${booking.patientProfile.name},`,
        "",
        `${prescription.doctor.name} has prepared a prescription for your visit.`,
        "Sign in to Heal Spot to review and print it:",
        `${appUrl()}/#prescription/${prescription.id}`,
        "",
        "This private link requires your patient account sign-in.",
      ].join("\n"),
    };
  }

  if (event.eventType === "BOOKING_CONFIRMED"
    || event.eventType === "BOOKING_CANCELLED"
    || event.eventType === "APPOINTMENT_REMINDER"
    || event.eventType === "TOKEN_APPROACHING"
    || event.eventType === "DOCTOR_LEAVE_CANCELLATION") {
    const booking = await findBooking(database, payload.bookingId);
    if (!booking?.bookedByAccount?.email) return null;
    const date = dateLabel(booking.date);
    const weekday = weekdayForDate(date);
    const clinicHours = booking.doctor.schedules
      .filter((schedule) => schedule.weekday === weekday)
      .map((schedule) => `${schedule.startTime.toISOString().slice(11, 16)}-${schedule.endTime.toISOString().slice(11, 16)}`);
    const common = [
      `Patient: ${booking.patientProfile.name}`,
      `Doctor: ${booking.doctor.name} (${booking.doctor.department.name})`,
      `Date: ${date}`,
      ...(clinicHours.length ? [`Clinic hours: ${clinicHours.join(", ")}`] : []),
      `Token: ${booking.tokenNumber}`,
    ];

    if (event.eventType === "BOOKING_CONFIRMED") {
      return {
        to: booking.bookedByAccount.email,
        subject: `Booking confirmed - token ${booking.tokenNumber}`,
        text: [
          `Hello ${booking.patientProfile.name},`,
          "",
          "Your Heal Spot appointment token is confirmed.",
          ...common,
          `Consultation fee: INR ${booking.feeAtBooking.toFixed(2)}`,
        ].join("\n"),
      };
    }

    if (event.eventType === "BOOKING_CANCELLED" || event.eventType === "DOCTOR_LEAVE_CANCELLATION") {
      if (booking.status !== "CANCELLED") return null;
      return {
        to: booking.bookedByAccount.email,
        subject: "Heal Spot appointment cancelled",
        text: [
          `Hello ${booking.patientProfile.name},`,
          "",
          event.eventType === "DOCTOR_LEAVE_CANCELLATION"
            ? "Your appointment was cancelled because the doctor is on leave."
            : "Your appointment cancellation is confirmed.",
          ...common,
          ...(payload.reason ? [`Reason: ${String(payload.reason).slice(0, 500)}`] : []),
        ].join("\n"),
      };
    }

    if (event.eventType === "APPOINTMENT_REMINDER") {
      if (!["BOOKED", "CALLED"].includes(booking.status)) return null;
      return {
        to: booking.bookedByAccount.email,
        subject: "Heal Spot appointment reminder for tomorrow",
        text: [
          `Hello ${booking.patientProfile.name},`,
          "",
          "This is a reminder about your appointment tomorrow.",
          ...common,
          "Please arrive at the clinic in time for your session.",
        ].join("\n"),
      };
    }

    if (!["BOOKED", "CALLED"].includes(booking.status)) return null;
    return {
      to: booking.bookedByAccount.email,
      subject: `Your Heal Spot token is coming up`,
      text: [
        `Hello ${booking.patientProfile.name},`,
        "",
        `The doctor is now attending token ${Number(payload.currentTokenNumber)}. Your token is two places away in the queue.`,
        ...common,
      ].join("\n"),
    };
  }

  return null;
}

async function claimPendingEvent(database) {
  return database.$transaction(async (transaction) => {
    const now = new Date();
    await transaction.outboxEvent.updateMany({
      where: {
        status: "PROCESSING",
        availableAt: { lte: now },
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: { status: "PENDING", lastError: "Processing lease expired." },
    });
    await transaction.outboxEvent.updateMany({
      where: {
        status: "PROCESSING",
        availableAt: { lte: now },
        attempts: { gte: MAX_ATTEMPTS },
      },
      data: { status: "FAILED", lastError: "Processing lease expired after maximum attempts." },
    });
    const candidate = await transaction.outboxEvent.findFirst({
      where: { status: "PENDING", availableAt: { lte: now } },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return null;
    const claim = await transaction.outboxEvent.updateMany({
      where: { id: candidate.id, status: "PENDING", availableAt: { lte: now } },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        availableAt: new Date(now.getTime() + PROCESSING_LEASE_MS),
      },
    });
    return claim.count === 1 ? { ...candidate, attempts: candidate.attempts + 1 } : null;
  });
}

export async function processEmailOutbox(database, { sendMessage = emailService.sendMessage } = {}) {
  if (!emailService.configured && sendMessage === emailService.sendMessage) return 0;
  let processed = 0;
  for (let index = 0; index < 10; index += 1) {
    const event = await claimPendingEvent(database);
    if (!event) break;
    try {
      const message = await buildEmail(database, event);
      if (message) await sendMessage(message);
      await database.outboxEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
      });
    } catch (error) {
      const exhausted = event.attempts >= MAX_ATTEMPTS;
      const delayMs = Math.min(60_000 * (2 ** (event.attempts - 1)), 60 * 60 * 1000);
      await database.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: exhausted ? "FAILED" : "PENDING",
          availableAt: new Date(Date.now() + delayMs),
          lastError: emailErrorCode(error),
        },
      });
      console.error("Email outbox delivery failed.", {
        eventId: event.id,
        eventType: event.eventType,
        errorCode: emailErrorCode(error),
        attempts: event.attempts,
        exhausted,
      });
    }
    processed += 1;
  }
  return processed;
}
