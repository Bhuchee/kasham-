import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffActivityAction } from '../shared/enums';
import { toKobo } from '../shared/money';

@Injectable()
export class SalesService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) {}

    async syncData(changes: any, lastPulledAt: number, workspaceId: string, staffId: string) {
        if (changes?.sales?.created?.length > 0) {
            await this.prisma.sale.createMany({
                data: changes.sales.created.map((s: any) => {
                    const discountAmount = s.discount_amount || s.discountAmount || 0;
                    return {
                        id: s.id,
                        workspaceId,
                        staffId,       // track which staff member made the sale
                        total: s.total,
                        totalKobo: toKobo(s.total),
                        discountAmount,
                        discountAmountKobo: toKobo(discountAmount),
                        paymentType: s.payment_type || s.paymentType,
                        synced: true,
                        timestamp: s.timestamp ? new Date(s.timestamp) : new Date(),
                    };
                }),
                skipDuplicates: true,
            });

            // Trigger notification for staff sales activity to the workspace owner
            const workspace = await this.prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { ownerId: true, name: true },
            });

            if (workspace && staffId !== workspace.ownerId) {
                const staff = await this.prisma.user.findUnique({
                    where: { id: staffId },
                    select: { name: true, email: true },
                });
                const staffName = staff?.name || staff?.email || 'A staff member';

                for (const s of changes.sales.created) {
                    const message = `Staff member ${staffName} recorded a new sale of ${s.total} in workspace "${workspace.name}".`;
                    
                    // Create DB notification for owner
                    await this.notificationsService.createNotification(
                        workspace.ownerId,
                        'STAFF_ACTIVITY',
                        message,
                        workspaceId
                    );
                    
                    // Send push notification to owner
                    await this.notificationsService.sendToUser(
                        workspace.ownerId,
                        'New Staff Sale 🛒',
                        message,
                        { workspaceId }
                    );
                }
            }
            // Log each sale as SALE_COMPLETED activity (non-blocking)
            for (const s of changes.sales.created) {
                const discountAmt = s.discount_amount ?? s.discountAmount ?? 0;
                this.prisma.staffActivity.create({
                    data: {
                        workspaceId,
                        userId: staffId,
                        action: StaffActivityAction.SALE_COMPLETED,
                        details: {
                            amount: s.total ?? 0,
                            paymentMethod: s.payment_type ?? s.paymentType ?? 'CASH',
                            itemCount: 0, // saleItems not yet created at this point
                        },
                    },
                }).catch(() => {/* non-blocking */});

                // Log separate DISCOUNT_GIVEN if discount was applied
                if (discountAmt !== 0) {
                    this.prisma.staffActivity.create({
                        data: {
                            workspaceId,
                            userId: staffId,
                            action: StaffActivityAction.DISCOUNT_GIVEN,
                            details: {
                                originalAmount: (s.total ?? 0) + discountAmt,
                                finalAmount: s.total ?? 0,
                                discountAmount: discountAmt,
                            },
                        },
                    }).catch(() => {/* non-blocking */});
                }
            }
        }

        if (changes?.saleItems?.created?.length > 0) {
            await this.prisma.saleItem.createMany({
                data: changes.saleItems.created.map((si: any) => ({
                    id: si.id,
                    saleId: si.sale_id || si.saleId,
                    userProductId: si.user_product_id || si.userProductId || null,
                    productName: si.product_name || si.productName,
                    quantity: si.quantity,
                    price: si.price,
                    priceKobo: toKobo(si.price),
                })),
                skipDuplicates: true,
            });

            // Stock is authoritative via ProductsService.syncUserProducts (which
            // receives the client's already-decremented value and already sends
            // its own low-stock/out-of-stock notifications there). This block
            // used to attempt a second, independent stock read here — it always
            // threw (wrong Prisma model name) and was silently swallowed, but
            // implementing it for real would double-decrement stock on every
            // sale sync, since the product-sync push already applies the
            // decrement. Removed rather than fixed in place.
        }

        const since = lastPulledAt ? new Date(lastPulledAt) : new Date(0);
        return this.getSyncChanges(workspaceId, since);
    }

    // Pull-sync: returns everything in this workspace changed since the
    // client's last successful pull, so a second device (or this same
    // device after being offline) can catch up on changes made elsewhere.
    // Note: the mobile client does not yet merge this response into its
    // local SQLite store — that merge logic (conflict handling for a sale
    // referencing a product edited/deleted elsewhere, etc.) is a larger
    // follow-up. This makes the data available; it isn't consumed yet.
    async getSyncChanges(workspaceId: string, since: Date) {
        const changedProducts = await this.prisma.userProduct.findMany({
            where: { workspaceId, updatedAt: { gt: since } },
        });
        const changedSales = await this.prisma.sale.findMany({
            where: { workspaceId, updatedAt: { gt: since } },
            include: { items: true },
        });

        return {
            changes: { products: changedProducts, sales: changedSales },
            timestamp: Date.now(),
        };
    }



    async getDailySummary(workspaceId: string) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sales = await this.prisma.sale.findMany({
            where: { workspaceId, timestamp: { gte: today } },
            include: { staff: { select: { id: true, name: true, email: true } } },
        });

        const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
        const totalTransactions = sales.length;

        const breakdown = sales.reduce((acc: Record<string, number>, sale) => {
            acc[sale.paymentType] = (acc[sale.paymentType] || 0) + sale.total;
            return acc;
        }, {});

        // Per-staff summary
        const staffSummary = sales.reduce((acc: Record<string, any>, sale) => {
            const staffKey = sale.staffId || 'owner';
            if (!acc[staffKey]) {
                acc[staffKey] = {
                    name: sale.staff?.name || 'Owner',
                    email: sale.staff?.email || '',
                    totalSales: 0,
                    totalRevenue: 0,
                };
            }
            acc[staffKey].totalSales++;
            acc[staffKey].totalRevenue += sale.total;
            return acc;
        }, {});

        return {
            date: today,
            totalRevenue,
            totalTransactions,
            breakdown,
            staffSummary: Object.values(staffSummary),
        };
    }

    async getAnalytics(workspaceId: string, days: number = 7) {
        const from = new Date();
        from.setDate(from.getDate() - days);
        from.setHours(0, 0, 0, 0);

        const sales = await this.prisma.sale.findMany({
            where: { workspaceId, timestamp: { gte: from } },
            include: {
                items: {
                    include: { userProduct: { select: { name: true, costPrice: true, sellingPrice: true } } },
                },
                staff: { select: { id: true, name: true, email: true } },
            },
            orderBy: { timestamp: 'asc' },
        });

        // Daily breakdown (for bar chart)
        const dailyMap: Record<string, { revenue: number; transactions: number }> = {};
        for (const sale of sales) {
            const dayKey = sale.timestamp.toISOString().split('T')[0];
            if (!dailyMap[dayKey]) dailyMap[dayKey] = { revenue: 0, transactions: 0 };
            dailyMap[dayKey].revenue += sale.total;
            dailyMap[dayKey].transactions++;
        }

        // Per-product analytics
        const productMap: Record<string, { name: string; revenue: number; profit: number; units: number }> = {};
        for (const sale of sales) {
            for (const item of sale.items) {
                const key = item.userProductId || item.productName || 'unknown';
                if (!productMap[key]) {
                    productMap[key] = {
                        name: item.productName || item.userProduct?.name || 'Unknown',
                        revenue: 0,
                        profit: 0,
                        units: 0,
                    };
                }
                const revenue = item.price * item.quantity;
                const cost = (item.userProduct?.costPrice || 0) * item.quantity;
                productMap[key].revenue += revenue;
                productMap[key].profit += revenue - cost;
                productMap[key].units += item.quantity;
            }
        }

        return {
            daily: Object.entries(dailyMap).map(([date, data]) => ({ date, ...data })),
            products: Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
            totalRevenue: sales.reduce((s, sale) => s + sale.total, 0),
            totalTransactions: sales.length,
        };
    }
}
