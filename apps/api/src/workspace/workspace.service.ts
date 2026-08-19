import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    GoneException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../auth/email.service';
import { randomBytes } from 'crypto';

// ── Staff Activity Action Types ─────────────────────────────────────────────
export enum StaffActivityAction {
    SALE_COMPLETED = 'SALE_COMPLETED',
    PRODUCT_ADDED = 'PRODUCT_ADDED',
    STOCK_UPDATED = 'STOCK_UPDATED',
    DISCOUNT_GIVEN = 'DISCOUNT_GIVEN',
    DEBT_CREATED = 'DEBT_CREATED',
    PAYMENT_LOGGED = 'PAYMENT_LOGGED',
}

@Injectable()
export class WorkspaceService {
    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
    ) {}

    // ── Create Workspace ───────────────────────────────────────────────────────
    async create(ownerId: string, name: string, businessType?: string, countryCode?: string) {
        // Tier gate: Free users can only own 1 workspace
        const existingOwned = await this.prisma.workspace.count({
            where: { ownerId, status: 'ACTIVE' },
        });

        if (existingOwned >= 1) {
            const ownerMembership = await this.prisma.workspaceMember.findFirst({
                where: { userId: ownerId, role: 'OWNER', status: 'ACTIVE' },
                include: { workspace: { select: { tier: true } } },
            });
            const tier = ownerMembership?.workspace.tier || 'FREE';

            if (tier === 'FREE' || tier === 'GROWTH' || tier === 'BUSINESS') {
                throw new ForbiddenException(
                    'Your current plan only allows 1 store. Upgrade to Enterprise to create unlimited stores.',
                );
            }
        }

        // Look up the owner's email to populate WorkspaceMember.email
        const owner = await this.prisma.user.findUnique({
            where: { id: ownerId },
            select: { email: true },
        });

        // Create workspace and add owner as OWNER member in a transaction
        const workspace = await this.prisma.$transaction(async (tx) => {
            const ws = await tx.workspace.create({
                data: {
                    name,
                    businessType,
                    countryCode: countryCode || 'NG',
                    ownerId,
                    tier: 'FREE',
                    status: 'ACTIVE',
                },
            });

            await tx.workspaceMember.create({
                data: {
                    workspaceId: ws.id,
                    userId: ownerId,
                    email: owner?.email ?? '',
                    role: 'OWNER',
                    status: 'ACTIVE',
                },
            });

            return ws;
        });

        return workspace;
    }

    // ── Get All Workspaces for User ────────────────────────────────────────────
    async getMyWorkspaces(userId: string) {
        const memberships = await this.prisma.workspaceMember.findMany({
            where: { userId, status: 'ACTIVE' },
            include: {
                workspace: {
                    select: {
                        id: true,
                        name: true,
                        businessType: true,
                        tier: true,
                        status: true,
                        ownerId: true,
                        createdAt: true,
                    },
                },
            },
        });

        return memberships.map((m) => ({
            workspaceId: m.workspaceId,
            name: m.workspace.name,
            businessType: m.workspace.businessType,
            tier: m.workspace.tier,
            status: m.workspace.status,
            isOwner: m.workspace.ownerId === userId,
            role: m.role,
            joinedAt: m.createdAt,
        }));
    }

    // ── Get Workspace Members ──────────────────────────────────────────────────
    async getMembers(workspaceId: string) {
        const members = await this.prisma.workspaceMember.findMany({
            where: { workspaceId, status: { in: ['ACTIVE', 'PENDING'] } },
            include: {
                user: { select: { id: true, name: true, expoPushToken: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        return members.map((m) => ({
            memberId: m.id,
            userId: m.userId,
            email: m.email,
            name: m.user?.name ?? null,
            role: m.role,
            status: m.status,
            joinedAt: m.createdAt,
        }));
    }

    // ── Invite Staff by Email (token-based) ────────────────────────────────────
    async inviteMember(workspaceId: string, inviterUserId: string, email: string, role: string) {
        if (!['MANAGER', 'STAFF'].includes(role)) {
            throw new BadRequestException('Role must be MANAGER or STAFF');
        }

        const workspace = await this.prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { owner: { select: { name: true } } },
        });
        if (!workspace) throw new NotFoundException('Workspace not found');

        // Staff limit check (count only ACTIVE members, not pending invites)
        const activeCount = await this.prisma.workspaceMember.count({
            where: { workspaceId, status: 'ACTIVE' },
        });

        if (workspace.tier === 'FREE' && activeCount >= 1) {
            throw new ForbiddenException('Free plan only allows the owner. Upgrade to Growth to add staff.');
        }
        if (workspace.tier === 'GROWTH' && activeCount >= 3) {
            throw new ForbiddenException('Growth plan allows up to 2 staff accounts. Upgrade to Business for up to 10 staff.');
        }
        if (workspace.tier === 'BUSINESS' && activeCount >= 11) {
            throw new ForbiddenException('Business plan allows up to 10 staff accounts. Upgrade to Enterprise for unlimited staff.');
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Can't invite yourself
        const inviter = await this.prisma.user.findUnique({ where: { id: inviterUserId } });
        if (inviter?.email === normalizedEmail) {
            throw new BadRequestException('You cannot invite yourself');
        }

        // Check if already a member with ACTIVE or PENDING status
        const existing = await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, email: normalizedEmail, status: { in: ['ACTIVE', 'PENDING'] } },
        });
        if (existing?.status === 'ACTIVE') {
            throw new ConflictException('This person is already an active member of this workspace');
        }

        // Check if email belongs to an existing Chobo user
        const existingUser = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
        const hasGoogleAccount = existingUser ? !existingUser.password : false;

        // Generate invite token (7 days expiry)
        const inviteToken = randomBytes(32).toString('hex');
        const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        let member: any;

        if (existing?.status === 'DECLINED' || existing) {
            // Re-invite: update the existing record with a fresh token
            member = await this.prisma.workspaceMember.update({
                where: { id: existing.id },
                data: {
                    role,
                    status: 'PENDING',
                    userId: existingUser?.id ?? null,
                    inviteToken,
                    inviteExpiry,
                },
            });
        } else {
            // New invite: create PENDING record
            member = await this.prisma.workspaceMember.create({
                data: {
                    workspaceId,
                    userId: existingUser?.id ?? null,
                    email: normalizedEmail,
                    role,
                    status: 'PENDING',
                    inviteToken,
                    inviteExpiry,
                },
            });
        }

        // Send appropriate email based on whether the user has an account
        if (existingUser) {
            await this.emailService.sendExistingUserInvite({
                toEmail: normalizedEmail,
                toName: existingUser.name ?? null,
                workspaceName: workspace.name,
                role,
                inviteToken,
            });
        } else {
            await this.emailService.sendNewUserInvite({
                toEmail: normalizedEmail,
                workspaceName: workspace.name,
                role,
                inviteToken,
            });
        }

        return {
            success: true,
            memberId: member.id,
            email: normalizedEmail,
            role,
            status: 'PENDING',
            isExistingUser: !!existingUser,
            hasGoogleAccount,
        };
    }

    // ── Get Invite Details (public — for deep link handling) ───────────────────
    async getInviteDetails(token: string) {
        const member = await this.prisma.workspaceMember.findUnique({
            where: { inviteToken: token },
            include: {
                workspace: { select: { name: true } },
                user: { select: { id: true, password: true } },
            },
        });

        if (!member) throw new NotFoundException('Invite not found or already used');
        if (member.inviteExpiry && member.inviteExpiry < new Date()) {
            throw new GoneException('This invite link has expired. Ask the workspace owner to send a new one.');
        }
        if (member.status !== 'PENDING') {
            throw new ConflictException('This invite has already been used or cancelled');
        }

        // hasGoogleAccount: user exists but has no password (Google-only signup)
        const hasGoogleAccount = member.user ? !member.user.password : false;

        return {
            workspaceName: member.workspace.name,
            role: member.role,
            email: member.email,
            emailExists: !!member.user,
            hasGoogleAccount,
        };
    }

    // ── Accept Invite ──────────────────────────────────────────────────────────
    async acceptInvite(token: string, userId: string) {
        const member = await this.prisma.workspaceMember.findUnique({
            where: { inviteToken: token },
            include: { workspace: { select: { name: true } } },
        });

        if (!member || member.status !== 'PENDING') {
            throw new BadRequestException('Invalid or already used invite');
        }
        if (member.inviteExpiry && member.inviteExpiry < new Date()) {
            throw new GoneException('This invite has expired');
        }

        await this.prisma.workspaceMember.update({
            where: { inviteToken: token },
            data: {
                status: 'ACTIVE',
                userId,
                inviteToken: null,   // invalidate after use
                inviteExpiry: null,
            },
        });

        return {
            message: 'Invite accepted',
            workspaceId: member.workspaceId,
            workspaceName: member.workspace.name,
        };
    }

    // ── Decline Invite ─────────────────────────────────────────────────────────
    async declineInvite(token: string) {
        const member = await this.prisma.workspaceMember.findUnique({
            where: { inviteToken: token },
        });
        if (!member) throw new NotFoundException('Invite not found');

        await this.prisma.workspaceMember.update({
            where: { inviteToken: token },
            data: { status: 'DECLINED', inviteToken: null, inviteExpiry: null },
        });

        return { message: 'Invite declined' };
    }

    // ── Resend Invite ──────────────────────────────────────────────────────────
    async resendInvite(memberId: string, workspaceId: string) {
        const member = await this.prisma.workspaceMember.findFirst({
            where: { id: memberId, workspaceId, status: 'PENDING' },
            include: { workspace: { select: { name: true } } },
        });
        if (!member) throw new NotFoundException('Pending invite not found');

        const inviteToken = randomBytes(32).toString('hex');
        const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await this.prisma.workspaceMember.update({
            where: { id: memberId },
            data: { inviteToken, inviteExpiry },
        });

        const existingUser = await this.prisma.user.findUnique({ where: { email: member.email } });

        if (existingUser) {
            await this.emailService.sendExistingUserInvite({
                toEmail: member.email,
                toName: existingUser.name ?? null,
                workspaceName: member.workspace.name,
                role: member.role,
                inviteToken,
            });
        } else {
            await this.emailService.sendNewUserInvite({
                toEmail: member.email,
                workspaceName: member.workspace.name,
                role: member.role,
                inviteToken,
            });
        }

        return { message: 'Invite resent' };
    }

    // ── Cancel Pending Invite ──────────────────────────────────────────────────
    async cancelInvite(memberId: string, workspaceId: string) {
        const member = await this.prisma.workspaceMember.findFirst({
            where: { id: memberId, workspaceId, status: 'PENDING' },
        });
        if (!member) throw new NotFoundException('Pending invite not found');

        await this.prisma.workspaceMember.delete({ where: { id: memberId } });
        return { message: 'Invite cancelled' };
    }

    // ── Change Member Role ─────────────────────────────────────────────────────
    async updateMemberRole(workspaceId: string, memberId: string, role: string) {
        if (!['MANAGER', 'STAFF'].includes(role)) {
            throw new BadRequestException('Role must be MANAGER or STAFF');
        }

        const member = await this.prisma.workspaceMember.findFirst({
            where: { id: memberId, workspaceId },
        });
        if (!member) throw new NotFoundException('Member not found in this workspace');
        if (member.role === 'OWNER') throw new ForbiddenException('Cannot change the role of the workspace owner');

        return this.prisma.workspaceMember.update({
            where: { id: memberId },
            data: { role },
        });
    }

    // ── Remove Member ──────────────────────────────────────────────────────────
    async removeMember(workspaceId: string, memberId: string) {
        const member = await this.prisma.workspaceMember.findFirst({
            where: { id: memberId, workspaceId },
        });
        if (!member) throw new NotFoundException('Member not found');
        if (member.role === 'OWNER') throw new ForbiddenException('Cannot remove the workspace owner');

        await this.prisma.workspaceMember.update({
            where: { id: memberId },
            data: { status: 'REMOVED' },
        });

        return { success: true, message: 'Member removed from workspace' };
    }

    // ── Leave Workspace (Self-Exit) ────────────────────────────────────────────
    async leaveWorkspace(workspaceId: string, userId: string) {
        const member = await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId, status: 'ACTIVE' },
        });
        if (!member) throw new NotFoundException('You are not a member of this workspace');
        if (member.role === 'OWNER') {
            throw new ForbiddenException(
                'Workspace owners cannot leave. Transfer ownership or delete the workspace first.',
            );
        }

        await this.prisma.workspaceMember.delete({ where: { id: member.id } });
        return { success: true, message: 'You have left this workspace' };
    }

    // ── Delete Workspace ───────────────────────────────────────────────────────
    async deleteWorkspace(workspaceId: string, ownerId: string) {
        const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) throw new NotFoundException('Workspace not found');
        if (workspace.ownerId !== ownerId) throw new ForbiddenException('Only the owner can delete this workspace');

        await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { status: 'SUSPENDED' },
        });

        return { success: true, message: 'Workspace has been deactivated' };
    }

    // ── Upgrade Workspace Tier ─────────────────────────────────────────────────
    async upgradeTier(workspaceId: string, tier: 'FREE' | 'GROWTH' | 'BUSINESS' | 'ENTERPRISE') {
        const workspace = await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: { tier },
        });
        return { success: true, workspace };
    }

    // ── Staff Activity Log ─────────────────────────────────────────────────────

    async logActivity(
        workspaceId: string,
        userId: string,
        action: StaffActivityAction,
        details: Record<string, any>,
    ): Promise<void> {
        try {
            await this.prisma.staffActivity.create({
                data: { workspaceId, userId, action, details },
            });
        } catch (e) {
            console.warn('[StaffActivity] Failed to log activity:', e);
        }
    }

    async getStaffActivity(
        workspaceId: string,
        targetUserId: string,
        filter: 'today' | 'week' | 'month' | 'all' = 'today',
    ) {
        let from: Date | null = new Date();
        if (filter === 'today') {
            from.setHours(0, 0, 0, 0);
        } else if (filter === 'week') {
            from.setDate(from.getDate() - 7);
            from.setHours(0, 0, 0, 0);
        } else if (filter === 'month') {
            from.setMonth(from.getMonth() - 1);
            from.setHours(0, 0, 0, 0);
        } else {
            from = null; // 'all' — no date filter
        }

        const activities = await this.prisma.staffActivity.findMany({
            where: {
                workspaceId,
                userId: targetUserId,
                ...(from ? { createdAt: { gte: from } } : {}),
            },
            orderBy: { createdAt: 'desc' },
        });

        const salesActivities = activities.filter(a => a.action === 'SALE_COMPLETED');
        const totalRevenue = salesActivities.reduce((sum, a) => {
            const d = a.details as Record<string, any>;
            return sum + (Number(d?.amount) || 0);
        }, 0);

        const actionCounts = activities.reduce((acc: Record<string, number>, a) => {
            acc[a.action] = (acc[a.action] || 0) + 1;
            return acc;
        }, {});
        const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

        return {
            activities,
            summary: {
                totalSales: salesActivities.length,
                totalRevenue,
                topAction,
                totalActions: activities.length,
            },
        };
    }

    async update(workspaceId: string, name?: string, businessType?: string, countryCode?: string) {
        const workspace = await this.prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                name: name !== undefined ? name : undefined,
                businessType: businessType !== undefined ? businessType : undefined,
                countryCode: countryCode !== undefined ? countryCode : undefined,
            },
        });
        return { success: true, workspace };
    }

    async getById(workspaceId: string) {
        const workspace = await this.prisma.workspace.findUnique({
            where: { id: workspaceId },
        });
        if (!workspace) throw new NotFoundException('Workspace not found');
        return workspace;
    }

    async getMemberRole(workspaceId: string, userId: string): Promise<string | null> {
        const member = await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId, status: 'ACTIVE' },
        });
        return member?.role ?? null;
    }
}
