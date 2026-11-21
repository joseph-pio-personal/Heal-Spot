import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { ApiError } from "../lib/api-error.js";
import { asyncRoute } from "../lib/async-route.js";
import { publicDoctor, publicPatient, publicStaff } from "../auth/session.js";
import { STAFF_ROLES } from "../auth/validation.js";

const SESSION_COOKIE = "heal_spot_session";

function clearInvalidSession(response) {
  response.clearCookie(SESSION_COOKIE, { path: "/" });
}

export const authenticate = asyncRoute(async (request, response, next) => {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) {
    throw new ApiError(401, "Please sign in to continue.");
  }

  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET, {
      audience: "heal-spot-app",
      issuer: "heal-spot-api",
    });
  } catch {
    clearInvalidSession(response);
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (typeof claims !== "object" || typeof claims.sub !== "string") {
    clearInvalidSession(response);
    throw new ApiError(401, "Your session is invalid. Please sign in again.");
  }

  if (claims.role === "PATIENT") {
    const account = await prisma.patientAccount.findUnique({
      where: { id: claims.sub },
      include: { profiles: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (
      !account
      || account.status !== "ACTIVE"
      || claims.sessionVersion !== account.sessionVersion
    ) {
      clearInvalidSession(response);
      throw new ApiError(401, "Your account is unavailable. Please sign in again.");
    }
    request.currentUser = publicPatient(account);
  } else if (claims.role === "DOCTOR") {
    const doctor = await prisma.doctor.findUnique({ where: { id: claims.sub } });
    if (
      !doctor
      || doctor.status !== "ACTIVE"
      || !doctor.email
      || !doctor.passwordHash
      || claims.sessionVersion !== doctor.sessionVersion
    ) {
      clearInvalidSession(response);
      throw new ApiError(401, "Your account is unavailable. Please sign in again.");
    }
    request.currentUser = publicDoctor(doctor);
  } else {
    const staff = await prisma.staffUser.findUnique({ where: { id: claims.sub } });
    if (
      !staff
      || !staff.isActive
      || !STAFF_ROLES.has(staff.role)
      || claims.sessionVersion !== staff.sessionVersion
    ) {
      clearInvalidSession(response);
      throw new ApiError(401, "Your account is unavailable. Please sign in again.");
    }
    request.currentUser = publicStaff(staff);
  }

  next();
});

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.currentUser || !roles.includes(request.currentUser.role)) {
      next(new ApiError(403, "You do not have permission to perform this action."));
      return;
    }
    next();
  };
}
