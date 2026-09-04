-- ──────────────────────────────────────────────
-- Debt: direct workspace scoping + creator attribution
-- (fixes the staff-debt-sync bug — Debt was the only money-bearing
-- model without a direct workspaceId column)
-- ──────────────────────────────────────────────
ALTER TABLE "Debt" ADD COLUMN     "workspaceId" TEXT;
ALTER TABLE "Debt" ADD COLUMN     "createdBy" TEXT;

CREATE INDEX "Debt_workspaceId_idx" ON "Debt"("workspaceId");

-- Backfill workspaceId for any existing debt from its Customer relation
-- (Customer already carries workspaceId reliably).
UPDATE "Debt" d
SET "workspaceId" = c."workspaceId"
FROM "Customer" c
WHERE d."customerId" = c."id" AND d."workspaceId" IS NULL;
