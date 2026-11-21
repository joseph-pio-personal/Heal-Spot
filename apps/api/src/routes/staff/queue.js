import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { getHospitalTimeZone, hospitalLocalDate, parseBookingDate } from "../../booking/dates.js";
import { lockDoctorDay } from "../../booking/doctor-day.js";
import { normalizeId } from "../../catalog/validation.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { prisma } from "../../db.js";

const router = Router();
const STAFF_QUEUE_ROLES = ["ADMIN", "RECEPTIONIST", "NURSE"];
const DOCTOR_DAY_STATUSES = new Set(["PRESENT", "NOT_YET_ARRIVED", "ON_BREAK", "ON_LEAVE"]);
const QUEUE_ACTIONS = new Set(["CALL_NEXT", "RECALL", "SKIP", "COMPLETE"]);

router.use(authenticate, requireRole(...STAFF_QUEUE_ROLES));

async function ensureDoctor(database, doctorId) {
  const doctor = await database.doctor.findUnique({
    where: { id: doctorId },
    select: { id: true },
  });
  if (!doctor) throw new ApiError(404, "Doctor not found.");
}

async function ensureToday(database, date) {
  const timeZone = await getHospitalTimeZone(database);
  if (date !== hospitalLocalDate(new Date(), timeZone)) {
    throw new ApiError(400, "Queue actions are only available for the current hospital day.");
  }
}

router.get(
  "/",
  asyncRoute(async (request, response) => {
    const doctorId = normalizeId(request.query.doctorId, "doctor ID");
    const dateValue = request.query.date;
    if (typeof dateValue !== "string") throw new ApiError(400, "A queue date is required.");
    const date = parseBookingDate(dateValue);
    await ensureDoctor(prisma, doctorId);

    const [doctorDay, bookings] = await Promise.all([
      prisma.doctorDay.findUnique({
        where: { doctorId_date: { doctorId, date } },
        select: { status: true, currentTokenNumber: true, updatedAt: true },
      }),
      prisma.booking.findMany({
        where: { doctorId, date },
        include: {
          patientProfile: { select: { id: true, name: true, mobile: true } },
        },
        orderBy: { tokenNumber: "asc" },
      }),
    ]);

    response.json({
      date: dateValue,
      doctorDay: {
        status: doctorDay?.status ?? "NOT_YET_ARRIVED",
        currentTokenNumber: doctorDay?.currentTokenNumber ?? 0,
        updatedAt: doctorDay?.updatedAt ?? null,
      },
      bookings: bookings.map((booking) => ({
        ...booking,
        date: dateValue,
        feeAtBooking: booking.feeAtBooking.toFixed(2),
      })),
    });
  }),
);

router.patch(
  "/:doctorId/status",
  asyncRoute(async (request, response) => {
    const doctorId = normalizeId(request.params.doctorId, "doctor ID");
    const date = parseBookingDate(request.body?.date);
    const status = request.body?.status;
    if (!DOCTOR_DAY_STATUSES.has(status)) {
      throw new ApiError(400, "Doctor status must be PRESENT, NOT_YET_ARRIVED, ON_BREAK, or ON_LEAVE.");
    }

    const doctorDay = await prisma.$transaction(async (transaction) => {
      await ensureToday(transaction, request.body.date);
      await ensureDoctor(transaction, doctorId);
      const current = await lockDoctorDay(transaction, doctorId, date);
      if (current.status === status) return current;

      const updated = await transaction.doctorDay.update({
        where: { doctorId_date: { doctorId, date } },
        data: { status },
      });
      await transaction.queueEvent.create({
        data: {
          doctorId,
          date,
          staffUserId: request.currentUser.id,
          action: "DOCTOR_STATUS_CHANGED",
          details: { previousStatus: current.status, status },
        },
      });
      return updated;
    });
    response.json({ doctorDay });
  }),
);

router.post(
  "/:doctorId/actions",
  asyncRoute(async (request, response) => {
    const doctorId = normalizeId(request.params.doctorId, "doctor ID");
    const date = parseBookingDate(request.body?.date);
    const action = request.body?.action;
    if (!QUEUE_ACTIONS.has(action)) {
      throw new ApiError(400, "Choose CALL_NEXT, RECALL, SKIP, or COMPLETE.");
    }
    const bookingId = action === "CALL_NEXT"
      ? undefined
      : normalizeId(request.body?.bookingId, "booking ID");

    const result = await prisma.$transaction(async (transaction) => {
      await ensureToday(transaction, request.body.date);
      await ensureDoctor(transaction, doctorId);
      const doctorDay = await lockDoctorDay(transaction, doctorId, date);
      if (doctorDay.status !== "PRESENT") {
        throw new ApiError(409, "Set the doctor status to Present before managing the queue.");
      }

      let booking;
      if (action === "CALL_NEXT") {
        const currentlyCalled = await transaction.booking.findFirst({
          where: { doctorId, date, status: "CALLED" },
          select: { id: true },
        });
        if (currentlyCalled) {
          throw new ApiError(409, "Complete, skip, or recall the currently called token before calling the next one.");
        }
        booking = await transaction.booking.findFirst({
          where: {
            doctorId,
            date,
            status: "BOOKED",
            tokenNumber: { gt: doctorDay.currentTokenNumber },
          },
          orderBy: { tokenNumber: "asc" },
        });
        if (!booking) throw new ApiError(409, "There are no waiting bookings to call.");
        booking = await transaction.booking.update({
          where: { id: booking.id },
          data: { status: "CALLED" },
          include: { patientProfile: { select: { id: true, name: true } } },
        });
        await transaction.doctorDay.update({
          where: { doctorId_date: { doctorId, date } },
          data: { currentTokenNumber: booking.tokenNumber },
        });
      } else {
        booking = await transaction.booking.findFirst({
          where: { id: bookingId, doctorId, date },
          include: { patientProfile: { select: { id: true, name: true } } },
        });
        if (!booking) throw new ApiError(404, "Queue booking not found.");
        if (booking.status !== "CALLED" || booking.tokenNumber !== doctorDay.currentTokenNumber) {
          throw new ApiError(409, "Only the currently called booking can be recalled, skipped, or completed.");
        }
        if (action === "SKIP" || action === "COMPLETE") {
          booking = await transaction.booking.update({
            where: { id: booking.id },
            data: { status: action === "SKIP" ? "SKIPPED" : "COMPLETED" },
            include: { patientProfile: { select: { id: true, name: true } } },
          });
        }
      }

      await transaction.queueEvent.create({
        data: {
          doctorId,
          date,
          bookingId: booking.id,
          staffUserId: request.currentUser.id,
          action: action === "CALL_NEXT"
            ? "CALLED"
            : action === "COMPLETE"
              ? "COMPLETED"
              : action === "SKIP"
                ? "SKIPPED"
                : "RECALLED",
          details: { tokenNumber: booking.tokenNumber },
        },
      });
      return { booking, doctorDay };
    });

    response.json(result);
  }),
);

export { router as staffQueueRouter };
