ALTER TABLE "PatientAccount"
ADD COLUMN "verificationOtpHash" VARCHAR(64),
ADD COLUMN "verificationOtpExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN "verificationOtpAttempts" INTEGER NOT NULL DEFAULT 0;
