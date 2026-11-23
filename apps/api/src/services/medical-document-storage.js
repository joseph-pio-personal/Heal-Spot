import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ApiError } from "../lib/api-error.js";

const DOCUMENT_DIRECTORY = fileURLToPath(new URL("../../uploads/medical-documents/", import.meta.url));
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png)$/;

function identifyDocument(buffer) {
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return { extension: "pdf", mimeType: "application/pdf" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: "png", mimeType: "image/png" };
  }
  throw new ApiError(400, "Upload a valid PDF, JPEG, or PNG prescription.");
}

function documentPath(storageKey) {
  if (typeof storageKey !== "string" || !STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new ApiError(404, "Medical document not found.");
  }
  return path.join(DOCUMENT_DIRECTORY, storageKey);
}

export async function saveMedicalDocument(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(400, "Choose a prescription file to upload.");
  }
  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new ApiError(413, "Prescription files must be 10 MB or smaller.");
  }
  const { extension, mimeType } = identifyDocument(buffer);
  const storageKey = `${randomUUID()}.${extension}`;
  const target = documentPath(storageKey);
  const temporary = path.join(DOCUMENT_DIRECTORY, `${storageKey}.${randomUUID()}.tmp`);

  await mkdir(DOCUMENT_DIRECTORY, { recursive: true });
  try {
    await writeFile(temporary, buffer, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { storageKey, mimeType, fileSizeBytes: buffer.length };
}

export async function readMedicalDocument(storageKey) {
  return readFile(documentPath(storageKey));
}

export async function removeMedicalDocument(storageKey) {
  await rm(documentPath(storageKey), { force: true });
}
