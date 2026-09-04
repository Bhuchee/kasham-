import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { AdminGuard } from '../auth/guards/admin.guard';

const VALID_TIERS = ['FREE', 'GROWTH', 'BUSINESS', 'ENTERPRISE'];

// Admin-only tier overrides (e.g. manually provisioning an Enterprise customer).
// Authenticated purely via the X-Admin-Secret header — not a consumer-facing route.
@UseGuards(AdminGuard)
@Controller('admin/workspaces')
export class AdminWorkspaceController {
    constructor(private readonly workspaceService: WorkspaceService) {}

    @Post(':id/tier')
    async setTier(@Param('id') id: string, @Body('tier') tier: string) {
        if (!VALID_TIERS.includes(tier)) {
            throw new BadRequestException(`Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}`);
        }
        return this.workspaceService.upgradeTier(id, tier as 'FREE' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE');
    }
}
