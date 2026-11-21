CREATE TYPE "LeaveType" AS ENUM ('FULL_DAYp', 'HALF_DAY', 'CUSTOM');

DROP INDEX "PatientAccount_mobile_key";

ALTER TABLE "PatientAccount"
ADD COLUMN "email" VARCHAR(254),
ADD COLUMN "passwordHash" VARCHAR(255),
ADD COLUMN "username" VARCHAR(32),
ALTER COLUMN "mobile" DROP NOT NULL;

CREATE UNIQUE INDEX "PatientAccount_username_key" ON "PatientAccount"("username");
CREATE UNIQUE INDEX "PatientAccount_email_key" ON "PatientAccount"("email");
