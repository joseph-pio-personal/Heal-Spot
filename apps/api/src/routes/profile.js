import { Router } from "express";
import express from "express";
import { authRateLimit } from "../auth/rate-limit.js";
import { authenticate } from "../middleware/authenticate.js";
import { ApiError } from "../lib/api-error.js";
import { asyncRoute } from "../lib/async-route.js";
import { normalizeId, serializeSchedule } from "../catalog/validation.js";
import { prisma } from "../db.js";
import {
  readProfilePhoto,
  removeProfilePhoto,
  saveProfilePhoto,
} from "../services/profile-photo-storage.js";

const router = Router();
const profilePhotoBody = express.raw({
  type: ["image/jpeg", "image/png", "image/webp"],
  limit: "5mb",
});

function patientPhotoUrl(profileId) {
  return `/api/profile/photo/${profileId}`;
}

function accountPhotoUrl() {
  return "/api/profile/photo";
}

router.use(authenticate);

router.get(
  "/",
  asyncRoute(async (request, response) => {
    const { id, role } = request.currentUser;
    if (role === "PATIENT") {
      const account = await prisma.patientAccount.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          username: true,
          mobile: true,
          status: true,
          createdAt: true,
          profiles: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              mobile: true,
              relationship: true,
              dateOfBirth: true,
              gender: true,
              address: true,
              bloodGroup: true,
              photoStorageKey: true,
            },
          },
        },
      });
      if (!account) throw new ApiError(404, "Account not found.");
      const profiles = account.profiles.map(({ photoStorageKey, ...profile }) => ({
        ...profile,
        photoUrl: photoStorageKey ? patientPhotoUrl(profile.id) : null,
      }));
      response.json({
        profile: {
          role,
          name: profiles.find((profile) => profile.relationship === "SELF")?.name
            ?? profiles[0]?.name
            ?? "Patient",
          email: account.email,
          username: account.username,
          mobile: account.mobile,
          status: account.status,
          createdAt: account.createdAt,
          profiles,
        },
      });
      return;
    }

    if (role === "DOCTOR") {
      const doctor = await prisma.doctor.findUnique({
        where: { id },
        include: {
          department: { select: { id: true, name: true } },
          schedules: { orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
        },
      });
      if (!doctor) throw new ApiError(404, "Doctor account not found.");
      response.json({
        profile: {
          role,
          name: doctor.name,
          email: doctor.email,
          department: doctor.department.name,
          specialization: doctor.specialization,
          qualification: doctor.qualification,
          experienceYears: doctor.experienceYears,
          consultationFee: doctor.consultationFee.toFixed(2),
          status: doctor.status,
          schedules: doctor.schedules.map(serializeSchedule),
          photoUrl: doctor.photoStorageKey ? accountPhotoUrl() : null,
          createdAt: doctor.createdAt,
        },
      });
      return;
    }

    const staff = await prisma.staffUser.findUnique({
      where: { id },
      select: {
        name: true,
        email: true,
        role: true,
        isActive: true,
        photoStorageKey: true,
        createdAt: true,
      },
    });
    if (!staff) throw new ApiError(404, "Staff account not found.");
    response.json({
      profile: {
        role: staff.role,
        name: staff.name,
        email: staff.email,
        status: staff.isActive ? "ACTIVE" : "INACTIVE",
        photoUrl: staff.photoStorageKey ? accountPhotoUrl() : null,
        createdAt: staff.createdAt,
      },
    });
  }),
);

async function findCurrentPhoto(currentUser, profileId) {
  if (currentUser.role === "PATIENT") {
    if (!profileId) throw new ApiError(400, "Select a patient profile.");
    return prisma.patientProfile.findFirst({
      where: { id: profileId, accountId: currentUser.id },
      select: { photoStorageKey: true },
    });
  }
  if (profileId) throw new ApiError(400, "This account does not use a patient profile ID.");
  if (currentUser.role === "DOCTOR") {
    return prisma.doctor.findUnique({
      where: { id: currentUser.id },
      select: { photoStorageKey: true },
    });
  }
  return prisma.staffUser.findUnique({
    where: { id: currentUser.id },
    select: { photoStorageKey: true },
  });
}

async function updateCurrentPhoto(currentUser, profileId, photoStorageKey) {
  if (currentUser.role === "PATIENT") {
    if (!profileId) throw new ApiError(400, "Select a patient profile.");
    return prisma.patientProfile.updateMany({
      where: { id: profileId, accountId: currentUser.id },
      data: { photoStorageKey },
    });
  }
  if (profileId) throw new ApiError(400, "This account does not use a patient profile ID.");
  if (currentUser.role === "DOCTOR") {
    return prisma.doctor.updateMany({
      where: { id: currentUser.id },
      data: { photoStorageKey },
    });
  }
  return prisma.staffUser.updateMany({
    where: { id: currentUser.id },
    data: { photoStorageKey },
  });
}

router.get(
  "/photo/:profileId?",
  asyncRoute(async (request, response) => {
    const profileId = request.params.profileId
      ? normalizeId(request.params.profileId, "profile ID")
      : undefined;
    const record = await findCurrentPhoto(request.currentUser, profileId);
    if (!record?.photoStorageKey) throw new ApiError(404, "Profile photo not found.");
    let photo;
    try {
      photo = await readProfilePhoto(record.photoStorageKey);
    } catch (error) {
      if (error?.code === "ENOENT") throw new ApiError(404, "Profile photo not found.");
      throw error;
    }
    response
      .set("Cache-Control", "private, no-store")
      .set("X-Content-Type-Options", "nosniff")
      .type(photo.mimeType)
      .send(photo.buffer);
  }),
);

router.put(
  "/photo/:profileId?",
  authRateLimit(10, 15 * 60 * 1000),
  profilePhotoBody,
  asyncRoute(async (request, response) => {
    const profileId = request.params.profileId
      ? normalizeId(request.params.profileId, "profile ID")
      : undefined;
    const currentPhoto = await findCurrentPhoto(request.currentUser, profileId);
    if (!currentPhoto) throw new ApiError(404, "Profile not found.");
    const { storageKey } = await saveProfilePhoto(request.body);
    try {
      const result = await updateCurrentPhoto(request.currentUser, profileId, storageKey);
      if (result.count !== 1) throw new ApiError(404, "Profile not found.");
    } catch (error) {
      try {
        await removeProfilePhoto(storageKey);
      } catch (cleanupError) {
        console.error("Could not clean up an unused profile photo:", cleanupError);
      }
      throw error;
    }
    if (currentPhoto.photoStorageKey) {
      await removeProfilePhoto(currentPhoto.photoStorageKey);
    }
    const photoUrl = request.currentUser.role === "PATIENT"
      ? patientPhotoUrl(profileId)
      : accountPhotoUrl();
    response.json({ photoUrl });
  }),
);

export { router as profileRouter };
