import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminWorkspaceController } from './admin-workspace.controller';
import { WorkspaceService } from './workspace.service';

describe('AdminWorkspaceController', () => {
    let controller: AdminWorkspaceController;
    let workspaceService: { upgradeTier: jest.Mock };

    beforeEach(async () => {
        workspaceService = { upgradeTier: jest.fn().mockResolvedValue({ success: true }) };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AdminWorkspaceController],
            providers: [{ provide: WorkspaceService, useValue: workspaceService }],
        }).compile();

        controller = module.get<AdminWorkspaceController>(AdminWorkspaceController);
    });

    it('rejects an invalid tier without touching the database', async () => {
        await expect(controller.setTier('ws1', 'NOT_A_TIER')).rejects.toThrow(BadRequestException);
        expect(workspaceService.upgradeTier).not.toHaveBeenCalled();
    });

    it('forwards a valid tier to WorkspaceService.upgradeTier', async () => {
        await controller.setTier('ws1', 'ENTERPRISE');
        expect(workspaceService.upgradeTier).toHaveBeenCalledWith('ws1', 'ENTERPRISE');
    });
});
