jest.mock('expo-server-sdk', () => {
    return {
        __esModule: true,
        default: jest.fn(),
        Expo: Object.assign(jest.fn(), { isExpoPushToken: jest.fn().mockReturnValue(true) }),
    };
});

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

describe('NotificationsController', () => {
    let controller: NotificationsController;
    let notificationsService: { getNotifications: jest.Mock; getWorkspaceNotifications: jest.Mock };
    let workspaceService: { isMember: jest.Mock };

    beforeEach(async () => {
        notificationsService = { getNotifications: jest.fn(), getWorkspaceNotifications: jest.fn() };
        workspaceService = { isMember: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [NotificationsController],
            providers: [
                { provide: NotificationsService, useValue: notificationsService },
                { provide: WorkspaceService, useValue: workspaceService },
                { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
                { provide: PrismaService, useValue: {} },
            ],
        }).compile();

        controller = module.get<NotificationsController>(NotificationsController);
    });

    it('without workspaceId, returns the caller\'s own notifications (unchanged behavior)', async () => {
        const req = { user: { sub: 'user-1' } };
        await controller.getNotifications(req);
        expect(notificationsService.getNotifications).toHaveBeenCalledWith('user-1');
        expect(workspaceService.isMember).not.toHaveBeenCalled();
    });

    it('with workspaceId, rejects a caller who is not a member of that workspace', async () => {
        workspaceService.isMember.mockResolvedValue(false);
        const req = { user: { sub: 'outsider' } };

        await expect(controller.getNotifications(req, 'ws-1')).rejects.toThrow(ForbiddenException);
        expect(notificationsService.getWorkspaceNotifications).not.toHaveBeenCalled();
    });

    it('with workspaceId, returns workspace notifications for an active member', async () => {
        workspaceService.isMember.mockResolvedValue(true);
        notificationsService.getWorkspaceNotifications.mockResolvedValue([{ id: 'n1' }]);
        const req = { user: { sub: 'member-1' } };

        const result = await controller.getNotifications(req, 'ws-1');

        expect(workspaceService.isMember).toHaveBeenCalledWith('ws-1', 'member-1');
        expect(notificationsService.getWorkspaceNotifications).toHaveBeenCalledWith('ws-1', 'member-1');
        expect(result).toEqual([{ id: 'n1' }]);
    });
});
