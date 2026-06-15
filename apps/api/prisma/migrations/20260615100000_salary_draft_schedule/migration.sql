-- Add monthly draft/scheduling support for teacher salary closing.
ALTER TABLE "salaries"
ADD COLUMN "monthKey" TEXT,
ADD COLUMN "isCurrentDraft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scheduledFinalizeAt" TIMESTAMP(3),
ADD COLUMN "manualFinalizeAt" TIMESTAMP(3);

CREATE INDEX "salaries_teacherId_monthKey_isCurrentDraft_idx"
ON "salaries"("teacherId", "monthKey", "isCurrentDraft");

CREATE INDEX "salaries_status_scheduledFinalizeAt_idx"
ON "salaries"("status", "scheduledFinalizeAt");

CREATE TABLE "salary_schedule_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'monthly',
  "monthlyFinalizeDay" INTEGER,
  "monthlyFinalizeTimeMinutes" INTEGER,
  "lastPromptedMonth" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "salary_schedule_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "salary_schedule_settings_key_key"
ON "salary_schedule_settings"("key");
