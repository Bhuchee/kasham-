-- ──────────────────────────────────────────────
-- CatalogueProduct: contribution tracking (A3 fix)
-- ──────────────────────────────────────────────
ALTER TABLE "CatalogueProduct" ADD COLUMN     "contributedBy" TEXT,
ADD COLUMN     "lastEditedBy" TEXT,
ADD COLUMN     "lastEditedAt" TIMESTAMP(3);
