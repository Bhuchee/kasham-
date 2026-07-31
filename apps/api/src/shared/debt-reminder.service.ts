import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DebtReminderService {
    private readonly logger = new Logger(DebtReminderService.name);

    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) {}

    // Runs daily at 9am UTC — remind workspace owners about overdue pay_later sales
    @Cron(CronExpression.EVERY_DAY_AT_9AM)
    async sendDebtReminders() {
        this.logger.log('[Cron] Running debt reminder check');
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        try {
            const overdueDebts = await this.prisma.sale.findMany({
                where: {
                    paymentType: 'PAY_LATER',
                    timestamp: { lte: threeDaysAgo },
                },
                select: {
                    id: true,
                    total: true,
                    workspaceId: true,
                    timestamp: true,
                    workspace: {
                        select: { ownerId: true, name: true },
                    },
                },
            });

            // Group by workspace to avoid spamming owners
            const grouped: Record<string, typeof overdueDebts> = {};
            for (const debt of overdueDebts) {
                const key = debt.workspaceId;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(debt);
            }

            for (const [, debts] of Object.entries(grouped)) {
                const first = debts[0];
                if (!first?.workspace?.ownerId) continue;

                const count = debts.length;
                const totalOwed = debts.reduce((sum, d) => sum + d.total, 0);

                await this.notificationsService.sendToUser(
                    first.workspace.ownerId,
                    'Outstanding debts reminder',
                    `You have ${count} unpaid sale${count > 1 ? 's' : ''} older than 3 days totaling ${totalOwed.toLocaleString('en-NG')}`,
                    { type: 'debt_reminder', workspaceId: first.workspaceId },
                );
                this.logger.log(`[Cron] Sent debt reminder for workspace ${first.workspaceId} (${count} debts)`);
            }
        } catch (err: any) {
            this.logger.error(`[Cron] Debt reminder failed: ${err.message}`);
        }
    }

    // Runs daily at 10am UTC — nudge users who signed up 24-48h ago with no sales
    @Cron(CronExpression.EVERY_DAY_AT_10AM)
    async sendOnboardingNudges() {
        this.logger.log('[Cron] Running onboarding nudge check');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        try {
            const newUsersWithNoSales = await this.prisma.user.findMany({
                where: {
                    createdAt: { gte: twoDaysAgo, lte: yesterday },
                    expoPushToken: { not: null },
                    memberships: {
                        none: {
                            workspace: {
                                sales: { some: {} }
                            }
                        },
                    },
                },
                select: { id: true },
            });

            for (const user of newUsersWithNoSales) {
                await this.notificationsService.sendToUser(
                    user.id,
                    'Make your first sale with Chobo',
                    'Tap to scan your first product and record a sale',
                    { type: 'onboarding_nudge' },
                );
            }

            if (newUsersWithNoSales.length > 0) {
                this.logger.log(`[Cron] Sent onboarding nudges to ${newUsersWithNoSales.length} users`);
            }
        } catch (err: any) {
            this.logger.error(`[Cron] Onboarding nudge failed: ${err.message}`);
        }
    }
}
