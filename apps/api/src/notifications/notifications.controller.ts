import { Controller, Get, Post, Body, HttpCode, HttpStatus, BadRequestException, ForbiddenException, UseGuards, Request, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { AuthGuard } from '../auth/auth.guard';
import { WorkspaceService } from '../workspace/workspace.service';

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
    constructor(
        private notificationsService: NotificationsService,
        private workspaceService: WorkspaceService,
    ) {}

    @Get()
    async getNotifications(@Request() req: any, @Query('workspaceId') workspaceId?: string) {
        if (workspaceId) {
            const isMember = await this.workspaceService.isMember(workspaceId, req.user.sub);
            if (!isMember) throw new ForbiddenException('You do not have access to this workspace');
            return this.notificationsService.getWorkspaceNotifications(workspaceId, req.user.sub);
        }
        return this.notificationsService.getNotifications(req.user.sub);
    }

    @HttpCode(HttpStatus.OK)
    @Post('mark-read')
    markAllRead(@Request() req: any) {
        return this.notificationsService.markAllRead(req.user.sub);
    }
}
