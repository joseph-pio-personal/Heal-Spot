import { Router } from "express";
import { authRateLimit } from "../auth/rate-limit.js";
import { asyncRoute } from "../lib/async-route.js";
import { ApiError } from "../lib/api-error.js";
import { authenticate, requireRole } from "../middleware/authenticate.js";
import { normalizeId } from "../catalog/validation.js";
import { parseBookingDate, dateString } from "../booking/dates.js";
import { listAvailability } from "../booking/availability.js";
import { cancelPatientBooking, createPatientBooking } from "../services/bookings.js";
import { prisma } from "../db.js";

const router = Router();

router.use(authenticate, requireRole("PATIENT"));

router.get(
  "/availability",
  asyncRoute(async (request, response) => {
    if (typeof request.query.date !== "string") {
      throw new ApiError(400, "A booking date is required.");
    }
    const departmentId = request.query.departmentId !== undefined
      ? normalizeId(request.query.departmentId, "department ID")
      : undefined;
    if (request.query.search !== undefined && typeof request.query.search !== "string") {
      throw new ApiError(400, "Search text must be a single string.");
    }
    const search = request.query.search?.trim() ?? "";
    if (search.length > 100) throw new ApiError(400, "Search text is too long.");

    response.json(await listAvailability(prisma, {
      dateValue: request.query.date,
      departmentId,
      search,
    }));
  }),
);

router.get(
  "/",
  asyncRoute(async (request, response) => {
    const bookings = await prisma.booking.findMany({
      where: { bookedByAccountId: request.currentUser.id },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            department: { select: { name: true } },
          },
        },
        patientProfile: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { tokenNumber: "asc" }],
    });
    response.json({
      bookings: bookings.map((booking) => ({
        ...booking,
        date: dateString(booking.date),
        feeAtBooking: booking.feeAtBooking.toFixed(2),
      })),
    });
  }),
);

router.post(
  "/",
  authRateLimit(10, 15 * 60 * 1000),
  asyncRoute(async (request, response) => {
    const profileId = normalizeId(request.body?.profileId, "profile ID");
    const doctorId = normalizeId(request.body?.doctorId, "doctor ID");
    const dateValue = request.body?.date;
    parseBookingDate(dateValue);
    const booking = await createPatientBooking(prisma, {
      accountId: request.currentUser.id,
      profileId,
      doctorId,
      dateValue,
    });
    response.status(201).json({
      booking: {
        ...booking,
        date: dateString(booking.date),
        feeAtBooking: booking.feeAtBooking.toFixed(2),
      },
    });
  }),
);

router.get(
  "/:id/tracking",
  asyncRoute(async (request, response) => {
    const id = normalizeId(request.params.id, "booking ID");
    const booking = await prisma.booking.findFirst({
      where: { id, bookedByAccountId: request.currentUser.id },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            department: { select: { name: true } },
          },
        },
        patientProfile: { select: { id: true, name: true } },
      },
    });
    if (!booking) throw new ApiError(404, "Booking not found.");

    const [doctorDay, peopleAhead] = await Promise.all([
      prisma.doctorDay.findUnique({
        where: { doctorId_date: { doctorId: booking.doctorId, date: booking.date } },
        select: { status: true, currentTokenNumber: true, updatedAt: true },
      }),
      booking.status === "BOOKED" || booking.status === "CALLED"
        ? prisma.booking.count({
          where: {
            doctorId: booking.doctorId,
            date: booking.date,
            tokenNumber: { lt: booking.tokenNumber },
            status: { in: ["BOOKED", "CALLED"] },
          },
        })
        : Promise.resolve(0),
    ]);

    response.json({
      booking: {
        ...booking,
        date: dateString(booking.date),
        feeAtBooking: booking.feeAtBooking.toFixed(2),
      },
      queue: {
        doctorStatus: doctorDay?.status ?? "NOT_YET_ARRIVED",
        currentTokenNumber: doctorDay?.currentTokenNumber ?? 0,
        peopleAhead,
        updatedAt: doctorDay?.updatedAt ?? null,
      },
    });
  }),
);

router.delete(
  "/:id",
  asyncRoute(async (request, response) => {
    const id = normalizeId(request.params.id, "booking ID");
    const booking = await cancelPatientBooking(prisma, {
      accountId: request.currentUser.id,
      bookingId: id,
    });
    response.json({
      booking: {
        ...booking,
        date: dateString(booking.date),
        feeAtBooking: booking.feeAtBooking.toFixed(2),
      },
    });
  }),
);

export { router as bookingsRouter };
