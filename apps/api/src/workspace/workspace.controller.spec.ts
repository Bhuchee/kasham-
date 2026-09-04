import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

describe('WorkspaceController', () => {
    let controller: WorkspaceController;
    let workspaceService: { upgradeTier: jest.Mock; isMember: jest.Mock; getById: jest.Mock };

    beforeEach(async () => {
        workspaceService = {
            upgradeTier: jest.fn(),
            isMember: jest.fn(),
            getById: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [WorkspaceController],
            providers: [
                { provide: WorkspaceService, useValue: workspaceService },
                { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
                { provide: PrismaService, useValue: {} },
            ],
        }).compile();

        controller = module.get<WorkspaceController>(WorkspaceController);
    });

    describe('upgradeTier (POST /workspaces/:id/upgrade)', () => {
        it('always rejects — tier changes no longer go through this route', async () => {
            await expect(controller.upgradeTier()).rejects.toThrow(ForbiddenException);
        });

        it('never calls WorkspaceService.upgradeTier, regardless of what a caller sends', async () => {
            await expect(controller.upgradeTier()).rejects.toThrow();
            expect(workspaceService.upgradeTier).not.toHaveBeenCalled();
        });
    });

    describe('getWorkspace (GET /workspaces/:id)', () => {
        it('returns the workspace when the caller is an active member', async () => {
            workspaceService.isMember.mockResolvedValue(true);
            workspaceService.getById.mockResolvedValue({ id: 'ws1', name: 'Test Store' });

            const result = await controller.getWorkspace('ws1', { user: { sub: 'user-a' } });

            expect(workspaceService.isMember).toHaveBeenCalledWith('ws1', 'user-a');
            expect(result).toEqual({ id: 'ws1', name: 'Test Store' });
        });

        it('rejects with 403 when the caller is not a member of that workspace', async () => {
            workspaceService.isMember.mockResolvedValue(false);

            await expect(
                controller.getWorkspace('ws1', { user: { sub: 'user-b' } }),
            ).rejects.toThrow(ForbiddenException);
            expect(workspaceService.getById).not.toHaveBeenCalled();
        });
    });
});
