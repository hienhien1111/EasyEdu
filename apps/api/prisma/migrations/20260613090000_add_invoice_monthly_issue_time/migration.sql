ALTER TABLE "invoice_schedule_settings"
  ADD COLUMN IF NOT EXISTS "monthlyIssueTimeMinutes" INTEGER;
