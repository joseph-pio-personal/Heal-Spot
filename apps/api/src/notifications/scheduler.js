import { addCalendarDays, getHospitalTimeZone, hospitalLocalDate, hospitalLocalTime, parseBookingDate } from "../booking/dates.js";
import { emailService } from "./email.js";
import { enqueueEmail } from "./outbox.js";
import { processEmailOutbox } from "./processor.js";

const DAILY_EMAIL_TIME = "07:00";
const WORKER_INTERVAL_MS = 5_000;

async function enqueueDailyEmails(database, dateValue, timeZone) {
  const date = parseBookingDate(dateValue);
  const nextDate = parseBookingDate(addCalendarDays(dateValue, 1));
  const [doctors, counts, reminders] = await Promise.all([
    database.doctor.findMany({
      where: { status: "ACTIVE", email: { not: null } },
      select: { id: true },
    }),
    database.booking.groupBy({
      by: ["doctorId"],
      where: { date, status: { not: "CANCELLED" } },
      _count: { _all: true },
    }),
    database.booking.findMany({
      where: { date: nextDate, status: "BOOKED", bookedByAccountId: { not: null } },
      select: { id: true },
    }),
  ]);
  const countByDoctor = new Map(counts.map((entry) => [entry.doctorId, entry._count._all]));

  await database.$transaction(async (transaction) => {
    for (const doctor of doctors) {
      await enqueueEmail(transaction, {
        dedupeKey: `doctor-daily-summary:${doctor.id}:${dateValue}`,
        eventType: "DOCTOR_DAILY_SUMMARY",
        payload: {
          doctorId: doctor.id,
          date: dateValue,
          bookedCount: countByDoctor.get(doctor.id) ?? 0,
          timeZone,
        },
      });
    }
    for (const booking of reminders) {
      await enqueueEmail(transaction, {
        dedupeKey: `appointment-reminder:${booking.id}:${dateValue}`,
        eventType: "APPOINTMENT_REMINDER",
        payload: { bookingId: booking.id, sendDate: dateValue },
      });
    }
  });
}

export function startEmailNotifications(database) {
  let activeTick = false;
  let dailyScheduleDate = "";

  const tick = async () => {
    if (activeTick) return;
    activeTick = true;
    try {
      const timeZone = await getHospitalTimeZone(database);
      const now = new Date();
      const dateValue = hospitalLocalDate(now, timeZone);
      if (hospitalLocalTime(now, timeZone) >= DAILY_EMAIL_TIME && dailyScheduleDate !== dateValue) {
        await enqueueDailyEmails(database, dateValue, timeZone);
        dailyScheduleDate = dateValue;
      }
      if (emailService.configured) await processEmailOutbox(database);
    } catch (error) {
      console.error("Email notification worker tick failed:", error?.message ?? error);
    } finally {
      activeTick = false;
    }
  };

  const interval = setInterval(tick, WORKER_INTERVAL_MS);
  interval.unref();
  void tick();
  return () => clearInterval(interval);
}
