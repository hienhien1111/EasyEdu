-- Add the new attendance status first so later migrations can use it safely.
ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'NOT_PRESENT';

ALTER TABLE "attendances"
  ADD COLUMN "weeklyOverrideId" TEXT,
  ADD COLUMN "classId" TEXT,
  ADD COLUMN "teacherId" TEXT,
  ADD COLUMN "sessionDate" TIMESTAMP(3),
  ADD COLUMN "sessionStartAt" TIMESTAMP(3),
  ADD COLUMN "sessionEndAt" TIMESTAMP(3),
  ADD COLUMN "editDeadlineAt" TIMESTAMP(3);

UPDATE "attendances" AS a
SET
  "classId" = s."classId",
  "teacherId" = s."teacherId",
  "sessionDate" = date_trunc('day', COALESCE(a."savedAt", a."createdAt")),
  "sessionStartAt" = COALESCE(a."savedAt", a."createdAt"),
  "sessionEndAt" = COALESCE(a."savedAt", a."createdAt"),
  "editDeadlineAt" = COALESCE(a."savedAt", a."createdAt") + interval '24 hours'
FROM "schedules" AS s
WHERE a."scheduleId" = s."id";

ALTER TABLE "attendances"
  ALTER COLUMN "classId" SET NOT NULL,
  ALTER COLUMN "teacherId" SET NOT NULL,
  ALTER COLUMN "sessionDate" SET NOT NULL,
  ALTER COLUMN "scheduleId" DROP NOT NULL;

DROP INDEX IF EXISTS "attendances_scheduleId_studentId_key";

CREATE UNIQUE INDEX "attendances_scheduleId_studentId_sessionDate_key"
  ON "attendances"("scheduleId", "studentId", "sessionDate");

CREATE UNIQUE INDEX "attendances_weeklyOverrideId_studentId_sessionDate_key"
  ON "attendances"("weeklyOverrideId", "studentId", "sessionDate");

CREATE INDEX "attendances_teacherId_sessionDate_idx"
  ON "attendances"("teacherId", "sessionDate");

CREATE INDEX "attendances_classId_sessionDate_idx"
  ON "attendances"("classId", "sessionDate");

ALTER TABLE "attendances"
  ADD CONSTRAINT "attendances_weeklyOverrideId_fkey"
    FOREIGN KEY ("weeklyOverrideId") REFERENCES "schedule_weekly_overrides"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "attendances_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "classes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attendances_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendances"
  DROP CONSTRAINT IF EXISTS "attendances_scheduleId_fkey",
  ADD CONSTRAINT "attendances_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
