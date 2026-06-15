-- Enums for invoice payment mode, issue reason, payment checks, and installment requests.
DO $$ BEGIN
  CREATE TYPE "PaymentCheckStatus" AS ENUM ('NONE', 'REQUESTED', 'CHECKING', 'CONFIRMED', 'NOT_RECEIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentLimitRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InvoicePaymentMode" AS ENUM ('UNDECIDED', 'QR', 'CASH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceIssueReason" AS ENUM ('MONTHLY', 'MANUAL', 'STUDENT_LOCK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "monthKey" TEXT,
  ADD COLUMN IF NOT EXISTS "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "depositApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentMode" "InvoicePaymentMode" NOT NULL DEFAULT 'UNDECIDED',
  ADD COLUMN IF NOT EXISTS "issueReason" "InvoiceIssueReason",
  ADD COLUMN IF NOT EXISTS "isCurrentDraft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "scheduledIssueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "manualIssueAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archiveReason" TEXT,
  ADD COLUMN IF NOT EXISTS "cashSplitCreatedAt" TIMESTAMP(3);

UPDATE "invoices"
SET
  "grossAmount" = "totalAmount",
  "monthKey" = to_char("periodStart", 'YYYY-MM')
WHERE "grossAmount" = 0;

ALTER TABLE "invoice_items"
  ADD COLUMN IF NOT EXISTS "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "depositApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "payableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "invoice_items"
SET
  "grossAmount" = "amount",
  "payableAmount" = "amount"
WHERE "grossAmount" = 0 AND "payableAmount" = 0;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "invoiceItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "checkStatus" "PaymentCheckStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "studentRequestedCheckAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "adminCheckedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "invoices_studentId_monthKey_isCurrentDraft_idx"
  ON "invoices"("studentId", "monthKey", "isCurrentDraft");

CREATE INDEX IF NOT EXISTS "invoices_status_scheduledIssueAt_idx"
  ON "invoices"("status", "scheduledIssueAt");

CREATE INDEX IF NOT EXISTS "invoices_archivedAt_idx"
  ON "invoices"("archivedAt");

CREATE INDEX IF NOT EXISTS "payments_invoiceItemId_idx"
  ON "payments"("invoiceItemId");

DO $$ BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "payments_invoiceItemId_fkey"
    FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "payment_limit_requests" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "requestedExtraTimes" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT,
  "status" "PaymentLimitRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_limit_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_limit_requests_status_createdAt_idx"
  ON "payment_limit_requests"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "payment_limit_requests_studentId_invoiceId_idx"
  ON "payment_limit_requests"("studentId", "invoiceId");

DO $$ BEGIN
  ALTER TABLE "payment_limit_requests"
    ADD CONSTRAINT "payment_limit_requests_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_limit_requests"
    ADD CONSTRAINT "payment_limit_requests_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "payment_limit_requests"
    ADD CONSTRAINT "payment_limit_requests_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "invoice_schedule_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'monthly',
  "monthlyIssueDay" INTEGER,
  "lastPromptedMonth" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_schedule_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_schedule_settings_key_key"
  ON "invoice_schedule_settings"("key");
