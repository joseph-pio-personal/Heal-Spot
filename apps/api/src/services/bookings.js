import {
  assertWithinBookingWindow,
  getHospitalTimeZone,
  hospitalLocalDate,
  hospitalLocalTime,
  parseBookingDate,
  weekdayForDate,
} from "../booking/dates.js";
import { lockDoctorDay } from "../booking/doctor-day.js";
import { ApiError } from "../lib/api-error.js";

const ACTIVE_BOOKING_STATUSES = ["BOOKED", "CALLED"];

function isSessionAvailable(sessions, dateValue, timeZone, now) {
  if (dateValue !== hospitalLocalDate(now, timeZone)) return sessions.length > 0;
  const localTime = hospitalLocalTime(now, timeZone);
  return sessions.some((session) => session.endTime.toISOString().slice(11, 16) > localTime);
}

export async function createPatientBooking(database, {
  accountId,
  profileId,
  doctorId,
  dateValue,
}) {
  const date = parseBookingDate(dateValue);
  return database.$transaction(async (transaction) => {
    const timeZone = await getHospitalTimeZone(transaction);
    assertWithinBookingWindow(dateValue, timeZone);

    const profile = await transaction.patientProfile.findFirst({
      where: { id: profileId, accountId },
      select: { id: true },
    });
    if (!profile) throw new ApiError(404, "Patient profile not found.");

    await transaction.$queryRaw`
      SELECT "id" FROM "Doctor" WHERE "id" = ${doctorId}::uuid FOR SHARE
    `;
    const doctor = await transaction.doctor.findUnique({
      where: { id: doctorId },
      include: { department: true, schedules: { where: { isActive: true } } },
    });
    if (!doctor || doctor.status !== "ACTIVE" || doctor.department.status !== "ACTIVE") {
      throw new ApiError(404, "Doctor is not available.");
    }

    const weekday = weekdayForDate(dateValue);
    const sessions = doctor.schedules.filter((session) => session.weekday === weekday);
    const capacity = sessions.reduce((total, session) => total + session.maxTokens, 0);
    if (capacity === 0 || !isSessionAvailable(sessions, dateValue, timeZone, new Date())) {
      throw new ApiError(409, "This doctor has no upcoming clinic session on the selected date.");
    }

    const doctorDay = await lockDoctorDay(transaction, doctorId, date);
    if (doctorDay.status === "ON_LEAVE") {
      throw new ApiError(409, "This doctor is unavailable on the selected date.");
    }

    const existingBooking = await transaction.booking.findFirst({
      where: {
        doctorId,
        patientProfileId: profileId,
        date,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      select: { id: true },
    });
    if (existingBooking) {
      throw new ApiError(409, "This profile already has an active booking with this doctor on that date.");
    }

    const [lastBooking, usedCapacity] = await Promise.all([
      transaction.booking.aggregate({
        where: { doctorId, date },
        _max: { tokenNumber: true },
      }),
      transaction.booking.count({
        where: { doctorId, date, status: { not: "CANCELLED" } },
      }),
    ]);
    const tokenNumber = (lastBooking._max.tokenNumber ?? 0) + 1;
    if (usedCapacity >= capacity) {
      throw new ApiError(409, "No tokens remain for this doctor on the selected date.");
    }

    return transaction.booking.create({
      data: {
        patientProfileId: profileId,
        doctorId,
        date,
        tokenNumber,
        status: "BOOKED",
        source: "APP",
        feeAtBooking: doctor.consultationFee,
        bookedByAccountId: accountId,
      },
      include: {
        doctor: { select: { id: true, name: true, department: { select: { name: true } } } },
        patientProfile: { select: { id: true, name: true } },
      },
    });
  }, {
    maxWait: 5_000,
    timeout: 10_000,
  });
}

export async function cancelPatientBooking(database, { accountId, bookingId }) {
  return database.$transaction(async (transaction) => {
    const booking = await transaction.booking.findFirst({
      where: { id: bookingId, bookedByAccountId: accountId },
      select: { id: true, doctorId: true, date: true, status: true },
    });
    if (!booking) throw new ApiError(404, "Booking not found.");

    await lockDoctorDay(transaction, booking.doctorId, booking.date);
    const current = await transaction.booking.findUnique({ where: { id: booking.id } });
    if (!current || current.status !== "BOOKED") {
      throw new ApiError(409, "A booking can only be cancelled before the doctor calls its token.");
    }

    return transaction.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancellationReason: "PATIENT_CANCELLED",
        cancelledAt: new Date(),
      },
      include: {
        doctor: { select: { id: true, name: true, department: { select: { name: true } } } },
        patientProfile: { select: { id: true, name: true } },
      },
    });
  });
}
