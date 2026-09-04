import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { DebtsService } from './debts.service';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(AuthGuard, RolesGuard)
@Controller('debts')
export class DebtsController {
    constructor(private readonly debtsService: DebtsService) {}

    // Any active workspace member can list the workspace's debts — this is
    // what lets a device other than the one that created a debt (e.g. the
    // owner, or a different staff member) ever see it at all.
    @Roles('OWNER', 'MANAGER', 'STAFF')
    @Get()
    findAll(@Request() req: any) {
        return this.debtsService.findAllForWorkspace(req.user.workspaceId);
    }

    // Staff can record debts (credit sales) at checkout
    @Roles('OWNER', 'MANAGER', 'STAFF')
    @Post()
    create(@Request() req: any, @Body() body: any) {
        return this.debtsService.create({ ...body, workspaceId: req.user.workspaceId, staffId: req.user.sub });
    }

    // Staff can record payments against a debt — synced as individual
    // payment events (not a recomputed total) so concurrent partial
    // payments from different devices don't clobber each other.
    @Roles('OWNER', 'MANAGER', 'STAFF')
    @Post('payments/sync')
    syncPayments(@Request() req: any, @Body() body: { payments: Array<{ id: string; debtId: string; amount: number; deviceId?: string }> }) {
        return this.debtsService.syncDebtPayments(body.payments ?? [], req.user.workspaceId, req.user.sub);
    }
}
