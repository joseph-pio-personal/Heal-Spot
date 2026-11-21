import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ApiError } from "../lib/api-error.js";

const PROFILE_PHOTO_DIRECTORY = fileURLToPath(new URL("../../uploads/profile-images/", import.meta.url));
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

function identifyImage(buffer) {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) return { extension: "jpg", mimeType: "image/jpeg" };
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return { extension: "png", mimeType: "image/png" };
  if (
    buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) return { extension: "webp", mimeType: "image/webp" };
  throw new ApiError(400, "Upload a valid JPEG, PNG, or WebP image.");
}

function storagePath(storageKey) {
  if (typeof storageKey !== "string" || !STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new ApiError(404, "Profile photo not found.");
  }
  return path.join(PROFILE_PHOTO_DIRECTORY, storageKey);
}

export async function saveProfilePhoto(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(400, "Choose an image to upload.");
  }
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new ApiError(413, "Profile images must be 5 MB or smaller.");
  }
  const { extension, mimeType } = identifyImage(buffer);
  const storageKey = `${randomUUID()}.${extension}`;
  const destination = storagePath(storageKey);
  const temporary = path.join(PROFILE_PHOTO_DIRECTORY, `${storageKey}.${randomUUID()}.tmp`);

  await mkdir(PROFILE_PHOTO_DIRECTORY, { recursive: true });
  try {
    await writeFile(temporary, buffer, { flag: "wx", mode: 0o600 });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { storageKey, mimeType };
}

export async function readProfilePhoto(storageKey) {
  const fullPath = storagePath(storageKey);
  const extension = storageKey.slice(storageKey.lastIndexOf(".") + 1);
  const mimeType = extension === "jpg"
    ? "image/jpeg"
    : extension === "png"
      ? "image/png"
      : "image/webp";
  return { buffer: await readFile(fullPath), mimeType };
}

export async function removeProfilePhoto(storageKey) {
  await rm(storagePath(storageKey), { force: true });
}
