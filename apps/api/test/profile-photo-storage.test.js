import assert from "node:assert/strict";
import test from "node:test";
import {
  readProfilePhoto,
  removeProfilePhoto,
  saveProfilePhoto,
} from "../src/services/profile-photo-storage.js";

test("profile photo storage detects image signatures and reads stored files", async () => {
  const image = Buffer.from("89504e470d0a1a0a0000", "hex");
  const saved = await saveProfilePhoto(image);
  try {
    assert.match(saved.storageKey, /^[0-9a-f-]+\.png$/);
    assert.equal(saved.mimeType, "image/png");
    const stored = await readProfilePhoto(saved.storageKey);
    assert.equal(stored.mimeType, "image/png");
    assert.deepEqual(stored.buffer, image);
  } finally {
    await removeProfilePhoto(saved.storageKey);
  }
});

test("profile photo storage rejects unsupported and oversized images", async () => {
  await assert.rejects(
    saveProfilePhoto(Buffer.from("not an image")),
    (error) => error.status === 400,
  );
  await assert.rejects(
    saveProfilePhoto(Buffer.alloc(5 * 1024 * 1024 + 1)),
    (error) => error.status === 413,
  );
  await assert.rejects(
    readProfilePhoto("../../outside.png"),
    (error) => error.status === 404,
  );
});
