import { Router } from "express";
import {
  getHospitalTimeZone,
  hospitalLocalDate,
  parseBookingDate,
  weekdayForDate,
} from "../../booking/dates.js";
import { serializeSchedule } from "../../catalog/validation.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { prisma } from "../../db.js";

const router = Router();

router.use(authenticate, requireRole("DOCTOR"));

router.get(
  "/dashboard",
  asyncRoute(async (request, response) => {
    const timeZone = await getHospitalTimeZone(prisma);
    const dateValue = hospitalLocalDate(new Date(), timeZone);
    const date = parseBookingDate(dateValue);
    const weekday = weekdayForDate(dateValue);
    const doctor = await prisma.doctor.findUnique({
      where: { id: request.currentUser.id },
      include: {
        department: { select: { id: true, name: true } },
        schedules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
      },
    });
    if (!doctor) throw new ApiError(404, "Doctor account not found.");

    const [doctorDay, bookings] = await Promise.all([
      prisma.doctorDay.findUnique({
        where: { doctorId_date: { doctorId: doctor.id, date } },
        select: { status: true, currentTokenNumber: true, updatedAt: true },
      }),
      prisma.booking.findMany({
        where: { doctorId: doctor.id, date },
        include: {
          patientProfile: { select: { id: true, name: true } },
        },
        orderBy: { tokenNumber: "asc" },
      }),
    ]);

    response.json({
      date: dateValue,
      timeZone,
      doctor: {
        id: doctor.id,
        name: doctor.name,
        department: doctor.department,
        specialization: doctor.specialization,
        qualification: doctor.qualification,
        experienceYears: doctor.experienceYears,
        consultationFee: doctor.consultationFee.toFixed(2),
        status: doctor.status,
        todaySessions: doctor.schedules
          .filter((schedule) => schedule.weekday === weekday && schedule.isActive)
          .map(serializeSchedule),
      },
      doctorDay: {
        status: doctorDay?.status ?? "NOT_YET_ARRIVED",
        currentTokenNumber: doctorDay?.currentTokenNumber ?? 0,
        updatedAt: doctorDay?.updatedAt ?? null,
      },
      bookings: bookings.map((booking) => ({
        id: booking.id,
        tokenNumber: booking.tokenNumber,
        status: booking.status,
        createdAt: booking.createdAt,
        patientProfile: booking.patientProfile,
      })),
    });
  }),
);

export { router as doctorDashboardRouter };
