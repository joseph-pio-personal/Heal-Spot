-- Preserve access for accounts created before email verification is enforced.
UPDATE "PatientAccount"
SET "verifiedAt" = "createdAt"
WHERE "verifiedAt" IS NULL;

ALTER TABLE "OutboxEvent"
ADD COLUMN "dedupeKey" VARCHAR(300),
ADD COLUMN "lastError" VARCHAR(500);

CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key"
ON "OutboxEvent"("dedupeKey");
