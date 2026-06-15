-- Payment reconciliation workflow, immutable event log, and ledger foundation.

CREATE TYPE "PaymentEventActorType" AS ENUM ('SYSTEM', 'STUDENT', 'ADMIN', 'TEACHER', 'PAYOS');

CREATE TYPE "PaymentEventType" AS ENUM (
  'QR_LINK_CREATED',
  'CASH_INITIATED',
  'CASH_CONFIRMED',
  'WEBHOOK_RECEIVED',
  'WEBHOOK_AMOUNT_MISMATCH',
  'WEBHOOK_FAILED',
  'STUDENT_CHECK_REQUESTED',
  'STUDENT_STATUS_CHECK',
  'PAYOS_REQUERY',
  'PAYOS_REQUERY_CONFIRMED',
  'PAYOS_REQUERY_PENDING',
  'PAYOS_REQUERY_CANCELLED',
  'MANUAL_APPROVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_MARKED_NOT_SUCCESSFUL',
  'INQUIRY_OPENED',
  'INQUIRY_ESCALATED',
  'INQUIRY_RESOLVED',
  'SETTLEMENT_EXCEPTION_OPENED',
  'LEDGER_POSTED'
);

CREATE TYPE "PaymentInquiryReason" AS ENUM (
  'STUDENT_REPORTED_MONEY_DEDUCTED',
  'WEBHOOK_MISSED',
  'PAYOS_PENDING',
  'PAYOS_CANCELLED',
  'GATEWAY_ERROR',
  'AMOUNT_MISMATCH',
  'ADMIN_BANK_RECONCILIATION',
  'OTHER'
);

CREATE TYPE "PaymentInquiryResolution" AS ENUM (
  'PAYOS_CONFIRMED',
  'MANUAL_BANK_CONFIRMED',
  'NOT_RECEIVED',
  'GATEWAY_CANCELLED',
  'AMOUNT_MISMATCH',
  'DUPLICATE',
  'REFUND_REQUIRED',
  'OTHER'
);

CREATE TYPE "PaymentInquirySeverity" AS ENUM ('NORMAL', 'HIGH', 'CRITICAL');

CREATE TYPE "LedgerEntryType" AS ENUM (
  'STUDENT_PAYMENT',
  'CASH_COLLECTION',
  'DEPOSIT_APPLIED',
  'REFUND_TO_STUDENT',
  'TEACHER_SALARY_PAYOUT',
  'MANUAL_ADJUSTMENT'
);

CREATE TYPE "LedgerDirection" AS ENUM ('IN', 'OUT', 'INTERNAL');

CREATE TYPE "LedgerEntryStatus" AS ENUM ('PENDING', 'POSTED', 'VOIDED');

ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'NEEDS_MANUAL_REVIEW';
ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'NOT_RECEIVED';
ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

ALTER TABLE "payment_inquiries"
  ADD COLUMN IF NOT EXISTS "reason" "PaymentInquiryReason",
  ADD COLUMN IF NOT EXISTS "resolution" "PaymentInquiryResolution",
  ADD COLUMN IF NOT EXISTS "severity" "PaymentInquirySeverity" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "openedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "handledBy" TEXT,
  ADD COLUMN IF NOT EXISTS "handledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "studentNote" TEXT,
  ADD COLUMN IF NOT EXISTS "adminNote" TEXT;

CREATE TABLE "payment_events" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT,
  "invoiceId" TEXT,
  "actorType" "PaymentEventActorType" NOT NULL DEFAULT 'SYSTEM',
  "actorId" TEXT,
  "type" "PaymentEventType" NOT NULL,
  "message" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_entries" (
  "id" TEXT NOT NULL,
  "entryNo" TEXT NOT NULL,
  "type" "LedgerEntryType" NOT NULL,
  "direction" "LedgerDirection" NOT NULL,
  "status" "LedgerEntryStatus" NOT NULL DEFAULT 'POSTED',
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "description" TEXT,
  "invoiceId" TEXT,
  "invoiceItemId" TEXT,
  "paymentId" TEXT,
  "studentId" TEXT,
  "teacherId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_entries_entryNo_key" ON "ledger_entries"("entryNo");
CREATE INDEX "payment_inquiries_status_severity_idx" ON "payment_inquiries"("status", "severity");
CREATE INDEX "payment_events_paymentId_createdAt_idx" ON "payment_events"("paymentId", "createdAt");
CREATE INDEX "payment_events_invoiceId_createdAt_idx" ON "payment_events"("invoiceId", "createdAt");
CREATE INDEX "payment_events_type_createdAt_idx" ON "payment_events"("type", "createdAt");
CREATE INDEX "ledger_entries_studentId_occurredAt_idx" ON "ledger_entries"("studentId", "occurredAt");
CREATE INDEX "ledger_entries_teacherId_occurredAt_idx" ON "ledger_entries"("teacherId", "occurredAt");
CREATE INDEX "ledger_entries_invoiceId_occurredAt_idx" ON "ledger_entries"("invoiceId", "occurredAt");
CREATE INDEX "ledger_entries_paymentId_idx" ON "ledger_entries"("paymentId");
CREATE INDEX "ledger_entries_type_direction_status_idx" ON "ledger_entries"("type", "direction", "status");

ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_events"
  ADD CONSTRAINT "payment_events_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_invoiceItemId_fkey"
  FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_entries_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
