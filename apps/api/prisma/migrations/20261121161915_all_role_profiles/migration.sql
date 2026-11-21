-- AlterTable
ALTER TABLE "Doctor" ADD COLUMN     "email" VARCHAR(254),
ADD COLUMN     "passwordHash" VARCHAR(255),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PatientAccount" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PatientProfile" ADD COLUMN     "photoStorageKey" VARCHAR(500);

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "photoStorageKey" VARCHAR(500);

-- CreateIndex
CREATE UNIQUE INDEX "Doctor_email_key" ON "Doctor"("email");
