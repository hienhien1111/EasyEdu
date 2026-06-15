-- AlterTable: Add PayOS fields to payments table
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payosOrderCode" BIGINT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payosPaymentLinkId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT;

-- CreateIndex: unique constraint on payosOrderCode
CREATE UNIQUE INDEX IF NOT EXISTS "payments_payosOrderCode_key" ON "payments"("payosOrderCode");
