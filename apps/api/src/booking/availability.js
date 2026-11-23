import {
  addCalendarDays,
  assertWithinBookingWindow,
  getHospitalTimeZone,
  hospitalLocalDate,
  hospitalLocalTime,
  parseBookingDate,
  weekdayForDate,
} from "./dates.js";
import { serializeSchedule } from "../catalog/validation.js";

function isSessionAvailable(sessions, date, timeZone, now) {
  if (date !== hospitalLocalDate(now, timeZone)) return sessions.length > 0;
  const localTime = hospitalLocalTime(now, timeZone);
  return sessions.some((session) => session.endTime.toISOString().slice(11, 16) > localTime);
}

export async function listAvailability(database, { dateValue, departmentId, search }) {
  const date = parseBookingDate(dateValue);
  const timeZone = await getHospitalTimeZone(database);
  assertWithinBookingWindow(dateValue, timeZone);
  const weekday = weekdayForDate(dateValue);
  const now = new Date();

  const doctors = await database.doctor.findMany({
    where: {
      status: "ACTIVE",
      department: { status: "ACTIVE" },
      ...(departmentId ? { departmentId } : {}),
      ...(search
        ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { specialization: { contains: search, mode: "insensitive" } },
          ],
        }
        : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      schedules: {
        where: { weekday, isActive: true },
        orderBy: { startTime: "asc" },
      },
    },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });
  const doctorIds = doctors.map((doctor) => doctor.id);
  if (doctorIds.length === 0) {
    return {
      date: dateValue,
      timeZone,
      bookingThrough: addCalendarDays(hospitalLocalDate(now, timeZone), 7),
      doctors: [],
    };
  }

  const [doctorDays, existingBookings] = await Promise.all([
    database.doctorDay.findMany({
      where: { doctorId: { in: doctorIds }, date },
      select: { doctorId: true, status: true },
    }),
    database.booking.findMany({
      where: { doctorId: { in: doctorIds }, date },
      select: { doctorId: true, tokenNumber: true, status: true },
    }),
  ]);
  const statusByDoctor = new Map(doctorDays.map((doctorDay) => [doctorDay.doctorId, doctorDay.status]));
  const lastTokenByDoctor = new Map();
  const usedCapacityByDoctor = new Map();
  for (const booking of existingBookings) {
    lastTokenByDoctor.set(
      booking.doctorId,
      Math.max(lastTokenByDoctor.get(booking.doctorId) ?? 0, booking.tokenNumber),
    );
    if (booking.status !== "CANCELLED") {
      usedCapacityByDoctor.set(
        booking.doctorId,
        (usedCapacityByDoctor.get(booking.doctorId) ?? 0) + 1,
      );
    }
  }

  return {
    date: dateValue,
    timeZone,
    bookingThrough: addCalendarDays(hospitalLocalDate(now, timeZone), 7),
    doctors: doctors.map((doctor) => {
      const sessions = doctor.schedules;
      const capacity = sessions.reduce((total, session) => total + session.maxTokens, 0);
      const lastTokenNumber = lastTokenByDoctor.get(doctor.id) ?? 0;
      const remaining = Math.max(0, capacity - (usedCapacityByDoctor.get(doctor.id) ?? 0));
      const doctorStatus = statusByDoctor.get(doctor.id) ?? "NOT_YET_ARRIVED";
      const hasFutureSession = isSessionAvailable(sessions, dateValue, timeZone, now);
      const availabilityReason = capacity === 0
        ? "NO_CLINIC_SESSIONS"
        : doctorStatus === "ON_LEAVE"
          ? "DOCTOR_ON_LEAVE"
          : remaining === 0
            ? "NO_TOKENS_REMAINING"
            : !hasFutureSession
              ? "CLINIC_SESSIONS_ENDED"
              : null;
      return {
        id: doctor.id,
        name: doctor.name,
        department: doctor.department,
        photoUrl: doctor.photoUrl,
        qualification: doctor.qualification,
        specialization: doctor.specialization,
        experienceYears: doctor.experienceYears,
        consultationFee: doctor.consultationFee.toFixed(2),
        schedules: sessions.map(serializeSchedule),
        doctorStatus,
        capacity,
        lastTokenNumber,
        remaining,
        available: availabilityReason === null,
        availabilityReason,
      };
    }),
  };
}
