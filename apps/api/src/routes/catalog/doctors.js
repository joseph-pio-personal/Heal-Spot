import { Router } from "express";
import { prisma } from "../../db.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import {
  normalizeId,
  optionalText,
  parseExperience,
  parseFee,
  parsePhotoUrl,
  parseSchedules,
  parseStatus,
  requiredText,
  toDatabaseSchedule,
} from "../../catalog/validation.js";
import { doctorInclude, doctorResponse } from "../../catalog/doctor-response.js";

const router = Router();

router.get(
  "/doctors",
  asyncRoute(async (request, response) => {
    const departmentId = request.query.departmentId !== undefined
      ? normalizeId(request.query.departmentId, "department ID")
      : undefined;
    if (request.query.search !== undefined && typeof request.query.search !== "string") {
      throw new ApiError(400, "Search text must be a single string.");
    }
    const search = request.query.search?.trim() ?? "";
    if (search.length > 100) throw new ApiError(400, "Search text is too long.");

    const doctors = await prisma.doctor.findMany({
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
      include: doctorInclude(),
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    });
    response.json({ doctors: doctors.map(doctorResponse) });
  }),
);

router.get(
  "/admin/doctors",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (_request, response) => {
    const doctors = await prisma.doctor.findMany({
      include: doctorInclude(),
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    });
    response.json({ doctors: doctors.map(doctorResponse) });
  }),
);

router.post(
  "/admin/doctors",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (request, response) => {
    const body = request.body ?? {};
    const departmentId = normalizeId(body.departmentId, "department ID");
    const name = requiredText(body.name, "Doctor name", 160);
    const consultationFee = parseFee(body.consultationFee);
    const schedules = parseSchedules(body.schedules);
    const experienceYears = parseExperience(body.experienceYears);
    const status = body.status === undefined ? "ACTIVE" : parseStatus(body.status);
    if (status === "ACTIVE" && !schedules.some((schedule) => schedule.isActive)) {
      throw new ApiError(400, "An active doctor must have at least one active schedule session.");
    }

    const doctor = await prisma.$transaction(async (transaction) => {
      const department = await transaction.department.findUnique({ where: { id: departmentId } });
      if (!department || (status === "ACTIVE" && department.status !== "ACTIVE")) {
        throw new ApiError(400, "An active doctor must belong to an active department.");
      }
      const created = await transaction.doctor.create({
        data: {
          departmentId,
          name,
          photoUrl: parsePhotoUrl(body.photoUrl),
          qualification: optionalText(body.qualification, "Qualification", 200),
          specialization: optionalText(body.specialization, "Specialization", 200),
          experienceYears,
          consultationFee,
          status,
          schedules: { create: schedules.map(toDatabaseSchedule) },
        },
        include: doctorInclude(),
      });
      await transaction.auditLog.create({
        data: {
          staffUserId: request.currentUser.id,
          action: "DOCTOR_CREATED",
          entityType: "Doctor",
          entityId: created.id,
          details: { departmentId, name, consultationFee, schedules },
        },
      });
      return created;
    });
    response.status(201).json({ doctor: doctorResponse(doctor) });
  }),
);

router.patch(
  "/admin/doctors/:id",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (request, response) => {
    const id = normalizeId(request.params.id, "doctor ID");
    const body = request.body ?? {};
    const data = {};
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      data.name = requiredText(body.name, "Doctor name", 160);
    }
    if (Object.prototype.hasOwnProperty.call(body, "departmentId")) {
      data.departmentId = normalizeId(body.departmentId, "department ID");
    }
    if (Object.prototype.hasOwnProperty.call(body, "photoUrl")) {
      data.photoUrl = parsePhotoUrl(body.photoUrl);
    }
    if (Object.prototype.hasOwnProperty.call(body, "qualification")) {
      data.qualification = optionalText(body.qualification, "Qualification", 200);
    }
    if (Object.prototype.hasOwnProperty.call(body, "specialization")) {
      data.specialization = optionalText(body.specialization, "Specialization", 200);
    }
    if (Object.prototype.hasOwnProperty.call(body, "experienceYears")) {
      data.experienceYears = parseExperience(body.experienceYears);
    }
    if (Object.prototype.hasOwnProperty.call(body, "consultationFee")) {
      data.consultationFee = parseFee(body.consultationFee);
    }
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      data.status = parseStatus(body.status);
    }
    const schedules = Object.prototype.hasOwnProperty.call(body, "schedules")
      ? parseSchedules(body.schedules)
      : undefined;
    if (Object.keys(data).length === 0 && !schedules) {
      throw new ApiError(400, "Provide doctor fields or schedule sessions to update.");
    }

    const doctor = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.doctor.findUnique({
        where: { id },
        include: { department: true },
      });
      if (!existing) throw new ApiError(404, "Doctor not found.");
      const nextDepartmentId = data.departmentId ?? existing.departmentId;
      const nextStatus = data.status ?? existing.status;
      if (nextStatus === "ACTIVE" && schedules && !schedules.some((schedule) => schedule.isActive)) {
        throw new ApiError(400, "An active doctor must have at least one active schedule session.");
      }
      const department = nextDepartmentId === existing.departmentId
        ? existing.department
        : await transaction.department.findUnique({ where: { id: nextDepartmentId } });
      if (!department) throw new ApiError(404, "Department not found.");
      const activatingOrMoving = data.status === "ACTIVE"
        || (data.departmentId && nextDepartmentId !== existing.departmentId && nextStatus === "ACTIVE");
      if (activatingOrMoving && department.status !== "ACTIVE") {
        throw new ApiError(400, "An active doctor must belong to an active department.");
      }

      const updated = await transaction.doctor.update({
        where: { id },
        data: {
          ...data,
          ...(schedules ? {
            schedules: {
              deleteMany: {},
              create: schedules.map(toDatabaseSchedule),
            },
          } : {}),
        },
        include: doctorInclude(),
      });
      await transaction.auditLog.create({
        data: {
          staffUserId: request.currentUser.id,
          action: "DOCTOR_UPDATED",
          entityType: "Doctor",
          entityId: id,
          details: { ...data, ...(schedules ? { schedules } : {}) },
        },
      });
      return updated;
    });
    response.json({ doctor: doctorResponse(doctor) });
  }),
);

export { router as doctorRouter };
