import { Router } from "express";
import { prisma } from "../../db.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";
import { normalizeId, optionalText, parseStatus, requiredText } from "../../catalog/validation.js";

const router = Router();

async function ensureUniqueDepartmentName(transaction, name, excludeId) {
  const duplicate = await transaction.department.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, "A department with that name already exists.");
}

router.get(
  "/departments",
  asyncRoute(async (_request, response) => {
    const departments = await prisma.department.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, status: true },
    });
    response.json({ departments });
  }),
);

router.get(
  "/admin/departments",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (_request, response) => {
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { doctors: true } } },
    });
    response.json({ departments });
  }),
);

router.post(
  "/admin/departments",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (request, response) => {
    const name = requiredText(request.body?.name, "Department name", 120);
    const description = optionalText(request.body?.description, "Description", 500);
    const department = await prisma.$transaction(async (transaction) => {
      await ensureUniqueDepartmentName(transaction, name);
      const created = await transaction.department.create({
        data: { name, description },
      });
      await transaction.auditLog.create({
        data: {
          staffUserId: request.currentUser.id,
          action: "DEPARTMENT_CREATED",
          entityType: "Department",
          entityId: created.id,
          details: { name },
        },
      });
      return created;
    });
    response.status(201).json({ department });
  }),
);

router.patch(
  "/admin/departments/:id",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (request, response) => {
    const id = normalizeId(request.params.id, "department ID");
    const body = request.body ?? {};
    const data = {};
    if (Object.prototype.hasOwnProperty.call(body, "name")) {
      data.name = requiredText(body.name, "Department name", 120);
    }
    if (Object.prototype.hasOwnProperty.call(body, "description")) {
      data.description = optionalText(body.description, "Description", 500);
    }
    if (Object.prototype.hasOwnProperty.call(body, "status")) {
      data.status = parseStatus(body.status);
    }
    if (Object.keys(data).length === 0) throw new ApiError(400, "Provide department fields to update.");

    const department = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.department.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, "Department not found.");
      if (data.name) await ensureUniqueDepartmentName(transaction, data.name, id);
      const updated = await transaction.department.update({ where: { id }, data });
      await transaction.auditLog.create({
        data: {
          staffUserId: request.currentUser.id,
          action: "DEPARTMENT_UPDATED",
          entityType: "Department",
          entityId: id,
          details: data,
        },
      });
      return updated;
    });
    response.json({ department });
  }),
);

export { router as departmentRouter };
