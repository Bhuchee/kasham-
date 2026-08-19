import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    BadRequestException,
    UseGuards,
    Request,
    ForbiddenException,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(AuthGuard)
@Controller('workspaces')
export class WorkspaceController {
    constructor(private readonly workspaceService: WorkspaceService) {}

    // GET /workspaces/mine — get all workspaces user belongs to
    @Get('mine')
    getMyWorkspaces(@Request() req: any) {
        return this.workspaceService.getMyWorkspaces(req.user.sub);
    }

    // POST /workspaces — create a new workspace (tier-gated)
    @Post()
    createWorkspace(@Request() req: any, @Body() body: Record<string, any>) {
        if (!body.name) throw new BadRequestException('Workspace name is required');
        return this.workspaceService.create(req.user.sub, body.name, body.business_type, body.country_code);
    }

    // GET /workspaces/:id/members — list all members (OWNER + MANAGER)
    @UseGuards(RolesGuard)
    @Roles('OWNER', 'MANAGER')
    @Get(':id/members')
    getMembers(@Param('id') id: string) {
        return this.workspaceService.getMembers(id);
    }

    // POST /workspaces/:id/members — invite staff by email (OWNER only)
    @UseGuards(RolesGuard)
    @Roles('OWNER')
    @Post(':id/members')
    inviteMember(@Param('id') id: string, @Request() req: any, @Body() body: Record<string, any>) {
        if (!body.email || !body.role) throw new BadRequestException('Email and role are required');
        return this.workspaceService.inviteMember(id, req.user.sub, body.email, body.role);
    }

    // POST /workspaces/:id/members/:memberId/resend — resend invite (OWNER only)
    @UseGuards(RolesGuard)
    @Roles('OWNER')
    @HttpCode(HttpStatus.OK)
    @Post(':id/members/:memberId/resend')
    resendInvite(@Param('id') workspaceId: string, @Param('memberId') memberId: string) {
        return this.workspaceService.resendInvite(memberId, workspaceId);
    }

    // DELETE /workspaces/:id/members/:memberId/cancel — cancel pending invite (OWNER only)
    @UseGuards(RolesGuard)
    @Roles('OWNER')
    @HttpCode(HttpStatus.OK)
    @Delete(':id/members/:memberId/cancel')
    cancelInvite(@Param('id') workspaceId: string, @Param('memberId') memberId: string) {
        return this.workspaceService.cancelInvite(memberId, workspaceId);
    }

    // PATCH /workspaces/:id/members/:memberId — change role (OWNER only)
    @UseGuards(RolesGuard)
    @Roles('OWNER')
    @Patch(':id/members/:memberId')
    updateMemberRole(
        @Param('id') id: string,
        @Param('memberId') memberId: string,
        @Body() body: Record<string, any>,
    ) {
        if (!body.role) throw new BadRequestException('Role is required');
        return this.workspaceService.updateMemberRole(id, memberId, body.role);
    }

    // DELETE /workspaces/:id/members/:memberId — remove a member (OWNER only)
    @UseGuards(RolesGuard)
    @Roles('OWNER')
    @Delete(':id/members/:memberId')
    @HttpCode(HttpStatus.OK)
    removeMember(@Param('id') id: string, @Param('memberId') memberId: string) {
        return this.workspaceService.removeMember(id, memberId);
    }

    // DELETE /workspaces/:id/leave — staff self-exits
    @UseGuards(RolesGuard)
    @Roles('OWNER', 'MANAGER', 'STAFF')
    @Delete(':id/leave')
    @HttpCode(HttpStatus.OK)
    leaveWorkspace(@Param('id') id: string, @Request() req: any) {
        return this.workspaceService.leaveWorkspace(id, req.user.sub);
    }

    // DELETE /workspaces/:id — soft-delete workspace (OWNER only)
    @UseGuards(RolesGuard)
    @Roles('OWNER')
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    deleteWorkspace(@Param('id') id: string, @Request() req: any) {
        return this.workspaceService.deleteWorkspace(id, req.user.sub);
    }

    // ── Upgrade Workspace Tier ─────────────────────────────────────────────────
    
    @UseGuards(RolesGuard)
    @Roles('OWNER')
    @HttpCode(HttpStatus.OK)
    @Post(':id/upgrade')
    async upgradeTier(@Param('id') id: string, @Body('tier') tier: 'FREE' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE') {
        if (!['FREE', 'GROWTH', 'BUSINESS', 'ENTERPRISE'].includes(tier)) {
            throw new BadRequestException('Invalid tier. Must be one of: FREE, GROWTH, BUSINESS, ENTERPRISE');
        }
        return this.workspaceService.upgradeTier(id, tier);
    }

    // GET /workspaces/:id — get workspace details
    @Get(':id')
    getWorkspace(@Param('id') id: string) {
        return this.workspaceService.getById(id);
    }

    // PATCH /workspaces/:id — update workspace name/details (OWNER only)
    @UseGuards(RolesGuard)
    @Roles('OWNER')
    @Patch(':id')
    updateWorkspace(
        @Param('id') id: string,
        @Body() body: Record<string, any>,
    ) {
        return this.workspaceService.update(
            id, 
            body.name, 
            body.businessType !== undefined ? body.businessType : body.business_type, 
            body.country_code
        );
    }

    // ── Staff Activity Log ─────────────────────────────────────────────────────

    // GET /workspaces/:id/members/:memberId/activity?filter=today|week|month
    @UseGuards(RolesGuard)
    @Roles('OWNER', 'MANAGER')
    @Get(':id/members/:memberId/activity')
    async getStaffActivity(
        @Param('id') workspaceId: string,
        @Param('memberId') memberId: string,
        @Query('filter') filter: string,
    ) {
        const validFilter = ['today', 'week', 'month', 'all'].includes(filter)
            ? (filter as 'today' | 'week' | 'month' | 'all')
            : 'today';
        return this.workspaceService.getStaffActivity(workspaceId, memberId, validFilter);
    }
}
