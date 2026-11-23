CREATE TYPE "PrescriptionStatus" AS ENUM ('DRAFT', 'FINALIZED');

ALTER TABLE "AuditLog"
ADD COLUMN "doctorId" UUID,
ADD COLUMN "patientAccountId" UUID;

CREATE INDEX "AuditLog_doctorId_createdAt_idx"
ON "AuditLog"("doctorId", "createdAt");

CREATE INDEX "AuditLog_patientAccountId_createdAt_idx"
ON "AuditLog"("patientAccountId", "createdAt");

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_doctorId_fkey"
FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_patientAccountId_fkey"
FOREIGN KEY ("patientAccountId") REFERENCES "PatientAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Prescription" (
  "id" UUID NOT NULL,
  "visitId" UUID NOT NULL,
  "doctorId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
  "replacesPrescriptionId" UUID,
  "notes" VARCHAR(2000),
  "issuedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Prescription_visitId_fkey" FOREIGN KEY ("visitId")
    REFERENCES "Visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Prescription_doctorId_fkey" FOREIGN KEY ("doctorId")
    REFERENCES "Doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Prescription_replacesPrescriptionId_fkey" FOREIGN KEY ("replacesPrescriptionId")
    REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Prescription_visitId_version_key"
ON "Prescription"("visitId", "version");
CREATE UNIQUE INDEX "Prescription_replacesPrescriptionId_key"
ON "Prescription"("replacesPrescriptionId");
CREATE INDEX "Prescription_doctorId_status_createdAt_idx"
ON "Prescription"("doctorId", "status", "createdAt");

CREATE TABLE "PrescriptionItem" (
  "id" UUID NOT NULL,
  "prescriptionId" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "medicationName" VARCHAR(200) NOT NULL,
  "strength" VARCHAR(100),
  "dosage" VARCHAR(120) NOT NULL,
  "route" VARCHAR(80),
  "frequency" VARCHAR(120) NOT NULL,
  "duration" VARCHAR(100) NOT NULL,
  "quantity" VARCHAR(100),
  "instructions" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId")
    REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PrescriptionItem_prescriptionId_position_key"
ON "PrescriptionItem"("prescriptionId", "position");
