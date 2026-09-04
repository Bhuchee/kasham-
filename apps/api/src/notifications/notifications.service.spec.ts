// expo-server-sdk is ESM-only — see sales/sales.service.spec.ts for the
// full explanation of why this needs mocking rather than a real import.
jest.mock('expo-server-sdk', () => {
    return {
        __esModule: true,
        default: jest.fn().mockImplementation(() => ({
            chunkPushNotifications: jest.fn((msgs) => [msgs]),
            sendPushNotificationsAsync: jest.fn().mockResolvedValue([]),
        })),
        Expo: Object.assign(
            jest.fn().mockImplementation(() => ({
                chunkPushNotifications: jest.fn((msgs: any) => [msgs]),
                sendPushNotificationsAsync: jest.fn().mockResolvedValue([]),
            })),
            { isExpoPushToken: jest.fn().mockReturnValue(true) },
        ),
    };
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsService', () => {
    let service: NotificationsService;
    let prisma: any;

    beforeEach(async () => {
        prisma = {
            notification: { findMany: jest.fn(), updateMany: jest.fn() },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
        }).compile();

        service = module.get<NotificationsService>(NotificationsService);
    });

    describe('getWorkspaceNotifications (Phase 7 — new capability)', () => {
        it('queries by workspaceId, not userId', async () => {
            prisma.notification.findMany.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);

            const result = await service.getWorkspaceNotifications('ws-1', 'user-1');

            expect(prisma.notification.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { workspaceId: 'ws-1' } }),
            );
            expect(result).toEqual([{ id: 'n1' }, { id: 'n2' }]);
        });
    });

    describe('getNotifications — unchanged, still per-user', () => {
        it('still queries by userId (this was never broken)', async () => {
            prisma.notification.findMany.mockResolvedValue([]);
            await service.getNotifications('user-1');
            expect(prisma.notification.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: 'user-1' } }),
            );
        });
    });
});
