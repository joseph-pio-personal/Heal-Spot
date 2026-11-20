import bcrypt from "bcryptjs";
import { Router } from "express";
import { prisma } from "../../db.js";
import { STAFF_ROLES, normalizeEmail, normalizeName, passwordFromRequest } from "../../auth/validation.js";
import { publicStaff } from "../../auth/session.js";
import { authenticate, requireRole } from "../../middleware/authenticate.js";
import { ApiError } from "../../lib/api-error.js";
import { asyncRoute } from "../../lib/async-route.js";

const router = Router();

function normalizeStaffId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiError(400, "Invalid staff account ID.");
  }
  return value;
}

function auditData(staffId, action, entityId, details) {
  return {
    staffUserId: staffId,
    action,
    entityType: "StaffUser",
    entityId,
    details,
  };
}

router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (request, response) => {
    const name = normalizeName(request.body?.name);
    const email = normalizeEmail(request.body?.email);
    const password = passwordFromRequest(request.body?.password);
    const role = request.body?.role;
    if (!STAFF_ROLES.has(role)) {
      throw new ApiError(400, "Choose a valid staff role.");
    }
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const staff = await prisma.$transaction(async (transaction) => {
        const created = await transaction.staffUser.create({
          data: { name, email, passwordHash, role },
        });
        await transaction.auditLog.create({
          data: auditData(request.currentUser.id, "STAFF_ACCOUNT_CREATED", created.id, { role }),
        });
        return created;
      });
      response.status(201).json({ user: publicStaff(staff) });
    } catch (error) {
      if (error?.code === "P2002") {
        throw new ApiError(409, "An account with that email already exists.");
      }
      throw error;
    }
  }),
);

router.get(
  "/",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (_request, response) => {
    const staff = await prisma.staffUser.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    response.json({ staff });
  }),
);

router.patch(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (request, response) => {
    const id = normalizeStaffId(request.params.id);
    const hasRole = Object.prototype.hasOwnProperty.call(request.body ?? {}, "role");
    const hasActive = Object.prototype.hasOwnProperty.call(request.body ?? {}, "isActive");
    if (!hasRole && !hasActive) {
      throw new ApiError(400, "Provide a role or active status to update.");
    }

    const role = hasRole ? request.body.role : undefined;
    const isActive = hasActive ? request.body.isActive : undefined;
    if (hasRole && !STAFF_ROLES.has(role)) {
      throw new ApiError(400, "Choose a valid staff role.");
    }
    if (hasActive && typeof isActive !== "boolean") {
      throw new ApiError(400, "isActive must be true or false.");
    }
    if (
      id === request.currentUser.id
      && ((hasRole && role !== "ADMIN") || (hasActive && !isActive))
    ) {
      throw new ApiError(409, "You cannot deactivate or demote your own admin account.");
    }

    try {
      const staff = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.staffUser.findUnique({ where: { id } });
        if (!existing) throw new ApiError(404, "Staff account not found.");

        const nextRole = role ?? existing.role;
        const nextActive = isActive ?? existing.isActive;
        if (existing.role === "ADMIN" && existing.isActive && (nextRole !== "ADMIN" || !nextActive)) {
          const otherActiveAdmins = await transaction.staffUser.count({
            where: { role: "ADMIN", isActive: true, id: { not: id } },
          });
          if (otherActiveAdmins === 0) {
            throw new ApiError(409, "At least one active admin account must remain.");
          }
        }

        const updated = await transaction.staffUser.update({
          where: { id },
          data: {
            ...(hasRole ? { role } : {}),
            ...(hasActive ? { isActive } : {}),
            sessionVersion: { increment: 1 },
          },
        });
        await transaction.auditLog.create({
          data: auditData(request.currentUser.id, "STAFF_ACCOUNT_UPDATED", id, {
            ...(hasRole ? { role } : {}),
            ...(hasActive ? { isActive } : {}),
          }),
        });
        return updated;
      }, { isolationLevel: "Serializable" });
      response.json({ user: publicStaff(staff), isActive: staff.isActive });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.code === "P2034") {
        throw new ApiError(409, "Another staff account update conflicted. Please retry.");
      }
      throw error;
    }
  }),
);

router.post(
  "/:id/reset-password",
  authenticate,
  requireRole("ADMIN"),
  asyncRoute(async (request, response) => {
    const id = normalizeStaffId(request.params.id);
    if (id === request.currentUser.id) {
      throw new ApiError(409, "You cannot reset your own password from the staff panel.");
    }
    const password = passwordFromRequest(request.body?.password);
    const passwordHash = await bcrypt.hash(password, 12);

    const staff = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.staffUser.findUnique({ where: { id } });
      if (!existing) throw new ApiError(404, "Staff account not found.");
      const updated = await transaction.staffUser.update({
        where: { id },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 },
        },
      });
      await transaction.auditLog.create({
        data: auditData(request.currentUser.id, "STAFF_PASSWORD_RESET", id, {}),
      });
      return updated;
    });

    response.json({ user: publicStaff(staff), message: "Password reset. The staff member must sign in again." });
  }),
);

export { router as staffAdminRouter };
