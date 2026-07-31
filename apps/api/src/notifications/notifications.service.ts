import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Expo, { ExpoPushMessage } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private readonly expo = new Expo();

    constructor(private prisma: PrismaService) {}

    // ── Send push notification to a single user ────────────────────────────────
    async sendToUser(userId: string, title: string, body: string, data?: Record<string, any>) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { expoPushToken: true },
        });

        if (!user?.expoPushToken || !Expo.isExpoPushToken(user.expoPushToken)) {
            this.logger.warn(`[Push] No valid Expo push token for user ${userId}`);
            return;
        }

        const message: ExpoPushMessage = {
            to: user.expoPushToken,
            sound: 'default',
            title,
            body,
            data,
        };

        try {
            const chunks = this.expo.chunkPushNotifications([message]);
            for (const chunk of chunks) {
                const receipts = await this.expo.sendPushNotificationsAsync(chunk);
                this.logger.log(`[Push] Sent to ${userId}: ${JSON.stringify(receipts)}`);
            }
        } catch (err: any) {
            this.logger.error(`[Push] Failed to send to ${userId}: ${err.message}`);
        }
    }

    // ── Send to all members of a workspace ────────────────────────────────────
    async sendToWorkspace(
        workspaceId: string, 
        title: string, 
        body: string, 
        excludeUserId?: string,
        targetRoles?: string[]
    ) {
        const members = await this.prisma.workspaceMember.findMany({
            where: { 
                workspaceId, 
                status: 'ACTIVE',
                ...(targetRoles && targetRoles.length > 0 ? { role: { in: targetRoles as any } } : {})
            },
            include: { user: { select: { id: true, expoPushToken: true } } },
        });

        const messages: ExpoPushMessage[] = members
            .filter((m) => m.userId !== excludeUserId && m.user?.expoPushToken && Expo.isExpoPushToken(m.user.expoPushToken))
            .map((m) => ({
                to: m.user!.expoPushToken!,
                sound: 'default' as const,
                title,
                body,
                data: { workspaceId },
            }));

        if (messages.length === 0) return;

        try {
            const chunks = this.expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
                await this.expo.sendPushNotificationsAsync(chunk);
            }
            this.logger.log(`[Push] Sent workspace notification to ${messages.length} members of ${workspaceId}`);
        } catch (err: any) {
            this.logger.error(`[Push] Failed workspace notification: ${err.message}`);
        }
    }

    // ── Save notification to DB ────────────────────────────────────────────────
    async createNotification(userId: string, type: string, message: string, workspaceId?: string) {
        return this.prisma.notification.create({
            data: { userId, type, message, workspaceId },
        });
    }

    // ── Get user's notifications ───────────────────────────────────────────────
    async getNotifications(userId: string) {
        return this.prisma.notification.findMany({
            where: { userId },
            orderBy: { timestamp: 'desc' },
            take: 50,
        });
    }

    // ── Mark all as read ───────────────────────────────────────────────────────
    async markAllRead(userId: string) {
        await this.prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true },
        });
        return { success: true };
    }
}
