import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffActivityAction } from '../shared/enums';
import { toKobo } from '../shared/money';

@Injectable()
export class DebtsService {
    constructor(private prisma: PrismaService) {}

    async create(data: any) {
        // Verify customer belongs to this workspace
        let customer = await this.prisma.customer.findFirst({
            where: { id: data.customerId, workspaceId: data.workspaceId },
        });

        // Auto-create the customer if it doesn't exist yet on the backend —
        // there's no customer-sync endpoint, so mobile may not have synced
        // the customer record before the debt referencing it arrives.
        if (!customer && data.customerId && data.customerName) {
            customer = await this.prisma.customer.create({
                data: {
                    id: data.customerId,
                    workspaceId: data.workspaceId,
                    name: data.customerName,
                    phone: data.customerPhone ?? null,
                },
            });
        }

        if (!customer) {
            throw new BadRequestException('Customer does not belong to this workspace');
        }

        // Verify sale (if provided) belongs to this workspace
        if (data.saleId) {
            const sale = await this.prisma.sale.findFirst({
                where: { id: data.saleId, workspaceId: data.workspaceId },
            });
            if (!sale) {
                throw new BadRequestException('Sale does not belong to this workspace');
            }
        }

        const debt = await this.prisma.debt.upsert({
            where: { id: data.id },
            update: {
                // Backfills workspaceId for a legacy debt created before this
                // fix (workspaceId was null) the next time it's touched.
                // Already-correct debts just get reassigned the same value.
                workspaceId: data.workspaceId,
                customerId: data.customerId,
                amountOwed: data.amountOwed,
                amountOwedKobo: toKobo(data.amountOwed),
                saleId: data.saleId,
                status: data.status,
            },
            create: {
                id: data.id,
                workspaceId: data.workspaceId,
                createdBy: data.staffId ?? null,
                customerId: data.customerId,
                amountOwed: data.amountOwed,
                amountOwedKobo: toKobo(data.amountOwed),
                originalAmount: data.amountOwed,
                originalAmountKobo: toKobo(data.amountOwed),
                saleId: data.saleId,
                status: data.status,
            },
        });

        // Log DEBT_CREATED activity (non-blocking, only on create — not on
        // status update). Only logged when staffId is known — StaffActivity.
        // userId is a required FK to User, and previously this silently
        // failed on every call because it fell back to workspaceId (not a
        // valid User id) whenever staffId was missing.
        if (data.status !== 'PAID' && data.staffId) {
            this.prisma.staffActivity.create({
                data: {
                    workspaceId: data.workspaceId,
                    userId: data.staffId,
                    action: StaffActivityAction.DEBT_CREATED,
                    details: {
                        customerName: customer.name || customer.phone || 'Unknown',
                        amount: data.amountOwed,
                    },
                },
            }).catch(() => {/* non-blocking */});
        }

        return debt;
    }

    async findAllForWorkspace(workspaceId: string) {
        return this.prisma.debt.findMany({
            where: { workspaceId },
            include: { customer: { select: { name: true, phone: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ── Record a payment against a debt (transaction-safe, idempotent) ────────
    // Payments are logged individually and amountOwed is always recomputed
    // from the full payment history, so two staff paying down the same debt
    // from different devices add up instead of one overwriting the other.
    async recordPayment(
        debtId: string,
        workspaceId: string,
        amount: number,
        paymentId: string,
        userId: string,
        deviceId?: string,
    ) {
        return this.prisma.$transaction(async (tx) => {
            const debt = await tx.debt.findFirst({
                where: { id: debtId, customer: { workspaceId } },
            });
            if (!debt) {
                throw new BadRequestException('Debt does not belong to this workspace');
            }

            // Idempotent: a retried sync replaying the same client-generated
            // paymentId must not double-apply it.
            try {
                await tx.debtPayment.create({
                    data: { id: paymentId, debtId, amount, amountKobo: toKobo(amount), paidBy: userId, deviceId },
                });
            } catch (e: any) {
                if (e.code === 'P2002') {
                    return debt; // already recorded — return current state unchanged
                }
                throw e;
            }

            // Debts created before this fix have no originalAmount — backfill
            // it from the current amountOwed the first time a payment-log
            // entry is recorded against them.
            const baseline = debt.originalAmount ?? debt.amountOwed;

            const totalPaid = await tx.debtPayment.aggregate({
                where: { debtId },
                _sum: { amount: true },
            });
            const remaining = baseline - (totalPaid._sum.amount ?? 0);
            const newStatus = remaining <= 0 ? 'PAID' : 'PARTIAL';

            const finalAmountOwed = Math.max(0, remaining);
            return tx.debt.update({
                where: { id: debtId },
                data: {
                    originalAmount: baseline,
                    originalAmountKobo: toKobo(baseline),
                    amountOwed: finalAmountOwed,
                    amountOwedKobo: toKobo(finalAmountOwed),
                    status: newStatus,
                },
            });
        });
    }

    async syncDebtPayments(
        payments: Array<{ id: string; debtId: string; amount: number; deviceId?: string }>,
        workspaceId: string,
        userId: string,
    ) {
        const results = [];
        for (const payment of payments) {
            results.push(
                await this.recordPayment(
                    payment.debtId,
                    workspaceId,
                    payment.amount,
                    payment.id,
                    userId,
                    payment.deviceId,
                ),
            );
        }
        return results;
    }
}

