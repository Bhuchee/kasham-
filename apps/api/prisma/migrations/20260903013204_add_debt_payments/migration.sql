-- ──────────────────────────────────────────────
-- Debt: originalAmount (B1 fix) + DebtPayment log
-- ──────────────────────────────────────────────
ALTER TABLE "Debt" ADD COLUMN     "originalAmount" DOUBLE PRECISION;

CREATE TABLE "DebtPayment" (
    "id" TEXT NOT NULL,
    "debtId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidBy" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT,

    CONSTRAINT "DebtPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtPayment_debtId_idx" ON "DebtPayment"("debtId");

ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "Debt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
