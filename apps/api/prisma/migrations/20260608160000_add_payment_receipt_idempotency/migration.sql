-- Keep only the first receipt per payment before enforcing idempotency.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "paymentId"
      ORDER BY "issuedAt" ASC, "id" ASC
    ) AS rn
  FROM "receipts"
)
DELETE FROM "receipts"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "receipts_paymentId_key" ON "receipts"("paymentId");

CREATE UNIQUE INDEX IF NOT EXISTS "payments_bankTransactionId_key"
  ON "payments"("bankTransactionId");
