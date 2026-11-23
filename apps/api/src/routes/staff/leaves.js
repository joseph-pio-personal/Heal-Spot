import { Router } from "express";
import { addCalendarDays, getHospitalTimeZone, hospitalLocalDate, hospitalLocalDateTimeToUtc, parseBookingDate } from "../../booking/dates.js";
import { lockDoctorDay } from "../../booking/doctor-day.js";
import { normalizeId, optionalText } from "../../catalog/validation.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { enqueueEmail } from "../../notifications/outbox.js";
import { prisma } from "../../db.js";

const router = Router();
const STAFF_ROLES = ["ADMIN", "RECEPTIONIST", "NURSE"];

router.use(authenticate, requireRole(...STAFF_ROLES));

router.post(
  "/",
  asyncRoute(async (request, response) => {
    const doctorId = normalizeId(request.body?.doctorId, "doctor ID");
    const startsOn = request.body?.startsOn;
    const endsOn = request.body?.endsOn;
    const reason = optionalText(request.body?.reason, "Leave reason", 500);
    if (typeof startsOn !== "string" || typeof endsOn !== "string") {
      throw new ApiError(400, "Provide the leave start and end dates.");
    }
    const startDate = parseBookingDate(startsOn);
    const endDate = parseBookingDate(endsOn);
    if (endsOn < startsOn) throw new ApiError(400, "Leave end date must be on or after its start date.");

    const result = await prisma.$transaction(async (transaction) => {
      const timeZone = await getHospitalTimeZone(transaction);
      const today = hospitalLocalDate(new Date(), timeZone);
      if (startsOn < today) throw new ApiError(400, "Leave cannot start before the current hospital date.");
      if (endsOn > addCalendarDays(today, 90)) {
        throw new ApiError(400, "Leave can be scheduled no more than 90 days ahead.");
      }

      const doctor = await transaction.doctor.findUnique({
        where: { id: doctorId },
        select: { id: true, name: true, status: true },
      });
      if (!doctor || doctor.status !== "ACTIVE") throw new ApiError(404, "Active doctor not found.");
      await transaction.$queryRaw`
        SELECT "id" FROM "Doctor" WHERE "id" = ${doctorId}::uuid FOR UPDATE
      `;

      const startAt = hospitalLocalDateTimeToUtc(startsOn, "00:00", timeZone);
      const endExclusive = hospitalLocalDateTimeToUtc(addCalendarDays(endsOn, 1), "00:00", timeZone);
      const overlap = await transaction.doctorLeave.findFirst({
        where: {
          doctorId,
          status: "ACTIVE",
          startsAt: { lt: endExclusive },
          endsAt: { gt: startAt },
        },
        select: { id: true },
      });
      if (overlap) throw new ApiError(409, "This doctor already has active leave during that date range.");

      const leaveDays = [];
      for (let dateValue = startsOn; dateValue <= endsOn; dateValue = addCalendarDays(dateValue, 1)) {
        const date = parseBookingDate(dateValue);
        const doctorDay = await lockDoctorDay(transaction, doctorId, date);
        leaveDays.push({ date, doctorDay });
      }

      const affectedBookings = await transaction.booking.findMany({
        where: {
          doctorId,
          date: { gte: startDate, lt: parseBookingDate(addCalendarDays(endsOn, 1)) },
          status: { in: ["BOOKED", "CALLED"] },
        },
        select: {
          id: true,
          date: true,
          status: true,
          bookedByAccount: { select: { email: true } },
        },
      });
      if (affectedBookings.some((booking) => booking.status === "CALLED")) {
        throw new ApiError(409, "Complete the currently called token before adding leave for that date.");
      }

      const leave = await transaction.doctorLeave.create({
        data: {
          doctorId,
          startsAt: startAt,
          endsAt: endExclusive,
          reason,
          createdByStaffId: request.currentUser.id,
        },
      });
      for (const { date, doctorDay } of leaveDays) {
        await transaction.doctorDay.update({
          where: { doctorId_date: { doctorId, date } },
          data: { status: "ON_LEAVE" },
        });
        if (doctorDay.status !== "ON_LEAVE") {
          await transaction.queueEvent.create({
            data: {
              doctorId,
              date,
              staffUserId: request.currentUser.id,
              action: "DOCTOR_STATUS_CHANGED",
              details: { previousStatus: doctorDay.status, status: "ON_LEAVE", leaveId: leave.id },
            },
          });
        }
      }

      for (const booking of affectedBookings) {
        await transaction.booking.update({
          where: { id: booking.id },
          data: {
            status: "CANCELLED",
            cancellationReason: reason || "Doctor is on leave.",
            cancelledAt: new Date(),
          },
        });
        await enqueueEmail(transaction, {
          dedupeKey: `doctor-leave-cancellation:${leave.id}:${booking.id}`,
          eventType: "DOCTOR_LEAVE_CANCELLATION",
          payload: { bookingId: booking.id, reason: reason || "Doctor is on leave." },
        });
      }

      await transaction.auditLog.create({
        data: {
          staffUserId: request.currentUser.id,
          action: "DOCTOR_LEAVE_CREATED",
          entityType: "DoctorLeave",
          entityId: leave.id,
          details: {
            doctorId,
            doctorName: doctor.name,
            startsOn,
            endsOn,
            cancelledBookingCount: affectedBookings.length,
          },
        },
      });
      return {
        leave,
        cancelledBookings: affectedBookings.length,
        emailsQueued: affectedBookings.filter((booking) => booking.bookedByAccount?.email).length,
      };
    });

    response.status(201).json(result);
  }),
);

export { router as staffLeavesRouter };
