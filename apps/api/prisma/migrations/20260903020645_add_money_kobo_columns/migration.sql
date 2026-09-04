-- ──────────────────────────────────────────────
-- B5: integer minor-unit (kobo) mirror columns.
-- Purely additive — existing Float columns are untouched and remain the
-- columns every current query reads. These new columns are backfilled from
-- the existing data and kept in sync by application code on every future
-- write. Nothing reads from them yet; that cutover is a deliberate,
-- separate follow-up once the mirror has been running in production for a
-- while and can be spot-checked against the Float columns.
-- ──────────────────────────────────────────────

ALTER TABLE "UserProduct" ADD COLUMN     "sellingPriceKobo" INTEGER;
ALTER TABLE "UserProduct" ADD COLUMN     "costPriceKobo" INTEGER;

ALTER TABLE "Sale" ADD COLUMN     "totalKobo" INTEGER;
ALTER TABLE "Sale" ADD COLUMN     "discountAmountKobo" INTEGER DEFAULT 0;

ALTER TABLE "SaleItem" ADD COLUMN     "priceKobo" INTEGER;

ALTER TABLE "Payment" ADD COLUMN     "amountKobo" INTEGER;

ALTER TABLE "Debt" ADD COLUMN     "amountOwedKobo" INTEGER;
ALTER TABLE "Debt" ADD COLUMN     "originalAmountKobo" INTEGER;

ALTER TABLE "DebtPayment" ADD COLUMN     "amountKobo" INTEGER;

-- Backfill from existing Float data. ROUND(..., 0) matches the application's
-- Math.round(naira * 100) — nearest-kobo rounding, not truncation.
UPDATE "UserProduct" SET "sellingPriceKobo" = ROUND("sellingPrice" * 100) WHERE "sellingPriceKobo" IS NULL;
UPDATE "UserProduct" SET "costPriceKobo" = ROUND("costPrice" * 100) WHERE "costPriceKobo" IS NULL AND "costPrice" IS NOT NULL;

UPDATE "Sale" SET "totalKobo" = ROUND("total" * 100) WHERE "totalKobo" IS NULL;
UPDATE "Sale" SET "discountAmountKobo" = ROUND("discountAmount" * 100) WHERE "discountAmountKobo" IS NULL;

UPDATE "SaleItem" SET "priceKobo" = ROUND("price" * 100) WHERE "priceKobo" IS NULL;

UPDATE "Payment" SET "amountKobo" = ROUND("amount" * 100) WHERE "amountKobo" IS NULL;

UPDATE "Debt" SET "amountOwedKobo" = ROUND("amountOwed" * 100) WHERE "amountOwedKobo" IS NULL;
UPDATE "Debt" SET "originalAmountKobo" = ROUND("originalAmount" * 100) WHERE "originalAmountKobo" IS NULL AND "originalAmount" IS NOT NULL;

UPDATE "DebtPayment" SET "amountKobo" = ROUND("amount" * 100) WHERE "amountKobo" IS NULL;
