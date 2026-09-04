import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../shared/email.service';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { RedisService } from '../shared/redis.service';

const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!REFRESH_SECRET) {
    throw new Error(
        'JWT_REFRESH_SECRET environment variable is required in all environments.\n' +
        'Run: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"\n' +
        'and add the result to your .env file as JWT_REFRESH_SECRET=<value>'
    );
}
const REFRESH_SECRET_RESOLVED = REFRESH_SECRET;

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private emailService: EmailService,
        private redisService: RedisService,
    ) {}

    // ── Token helpers ──────────────────────────────────────────────────────────
    private async generateTokens(userId: string, email: string) {
        const payload = { sub: userId, email };
        const [access_token, refresh_token] = await Promise.all([
            this.jwtService.signAsync(payload),
            this.jwtService.signAsync(payload, {
                secret: REFRESH_SECRET_RESOLVED,
                expiresIn: '30d',
            }),
        ]);

        const tokenHash = createHash('sha256').update(refresh_token).digest('hex');
        await this.redisService.set(`refresh:${userId}`, tokenHash, 30 * 24 * 60 * 60);

        return { access_token, refresh_token };
    }

    // ── Workspace list helper ──────────────────────────────────────────────────
    private async getUserWorkspaces(userId: string) {
        const memberships = await this.prisma.workspaceMember.findMany({
            where: { userId, status: 'ACTIVE' },
            include: {
                workspace: { select: { id: true, name: true, tier: true, status: true } },
            },
        });
        return memberships.map((m) => ({
            workspaceId: m.workspaceId,
            name: m.workspace.name,
            role: m.role,
            tier: m.workspace.tier,
            status: m.workspace.status,
        }));
    }

    async register(
        email: string,
        password: string,
        name?: string,
        countryCode?: string,
        tosAccepted?: boolean,
        businessName?: string,
        businessType?: string,
    ) {
        if (!tosAccepted) {
            throw new BadRequestException('You must accept the Terms of Service to create an account');
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) throw new ConflictException('An account with this email already exists');

        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await this.prisma.user.create({
            data: {
                email: normalizedEmail,
                password: hashedPassword,
                name,
                countryCode: countryCode || 'NG',
                tosAccepted: true,
                emailVerified: false,
            },
        });

        // Create default workspace for new registered user
        const workspace = await this.prisma.workspace.create({
            data: {
                name: businessName || `${name || 'My'}'s Store`,
                businessType: businessType || 'Other',
                countryCode: countryCode || 'NG',
                ownerId: user.id,
                tier: 'FREE',
                status: 'ACTIVE',
                members: {
                    create: {
                        userId: user.id,
                        email: normalizedEmail,   // ← required by new schema
                        role: 'OWNER',
                        status: 'ACTIVE',
                    },
                },
            },
        });

        // Auto-link any pending workspace invites for this email
        await this.prisma.workspaceMember.updateMany({
            where: { email: normalizedEmail, status: 'PENDING' },
            data: {
                userId: user.id,
                status: 'ACTIVE',
                inviteToken: null,
                inviteExpiry: null,
            },
        });

        // Send verification email
        const token = randomBytes(32).toString('hex');
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await this.prisma.emailVerification.create({
            data: {
                email: normalizedEmail,
                token,
                code,
                type: 'VERIFY',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
        });
        await this.emailService.sendVerificationEmail(normalizedEmail, name || null, token, code);

        return {
            message: 'Registration successful. Please check your email to verify your account.',
            user_id: user.id,
            email: user.email,
            emailVerified: false,
        };
    }

    // ── Email Verification ─────────────────────────────────────────────────────
    async verifyEmail(token: string) {
        const record = await this.prisma.emailVerification.findUnique({ where: { token } });

        if (!record || record.used || record.type !== 'VERIFY') {
            throw new BadRequestException('Verification link is invalid or has already been used');
        }
        if (new Date() > record.expiresAt) {
            throw new BadRequestException('Verification link has expired. Please request a new one.');
        }

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { email: record.email },
                data: { emailVerified: true },
            }),
            this.prisma.emailVerification.update({
                where: { token },
                data: { used: true },
            }),
        ]);

        return { success: true, message: 'Email verified successfully. You can now log in.' };
    }

    // ── Resend Verification ────────────────────────────────────────────────────
    async resendVerification(email: string) {
        const normalizedEmail = email.toLowerCase().trim();
        const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!user) throw new NotFoundException('No account found with this email');
        if (user.emailVerified) throw new BadRequestException('This email is already verified');

        // Invalidate all old tokens for this email
        await this.prisma.emailVerification.updateMany({
            where: { email: normalizedEmail, type: 'VERIFY', used: false },
            data: { used: true },
        });

        const token = randomBytes(32).toString('hex');
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await this.prisma.emailVerification.create({
            data: {
                email: normalizedEmail,
                token,
                code,
                type: 'VERIFY',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
        await this.emailService.sendVerificationEmail(normalizedEmail, user.name || null, token, code);

        return { success: true, message: 'A new verification email has been sent' };
    }

    // ── Login ──────────────────────────────────────────────────────────────────
    async login(email: string, password: string) {
        const normalizedEmail = email.toLowerCase().trim();
        const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

        if (!user || !user.password) throw new UnauthorizedException('Invalid email or password');
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new UnauthorizedException('Invalid email or password');

        if (!user.emailVerified) {
            throw new ForbiddenException('Please verify your email before logging in. Check your inbox or request a new verification email.');
        }

        const tokens = await this.generateTokens(user.id, user.email);
        const workspaces = await this.getUserWorkspaces(user.id);
        const ownerWorkspace = workspaces.find(w => w.role === 'OWNER');
        const businessName = ownerWorkspace ? ownerWorkspace.name : (workspaces[0] ? workspaces[0].name : '');

        return {
            ...tokens,
            user_id: user.id,
            email: user.email,
            name: user.name,
            country_code: user.countryCode,
            workspaces,
            businessName,
        };
    }

    // ── Google OAuth ───────────────────────────────────────────────────────────
    async googleAuth(idToken: string) {
        let ticket: any;
        try {
            ticket = await googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
        } catch {
            throw new UnauthorizedException('Invalid Google token');
        }

        const payload = ticket.getPayload();
        if (!payload?.email) throw new UnauthorizedException('Google token missing email');

        const normalizedEmail = payload.email.toLowerCase();

        // Find or create user
        let isNewUser = false;
        let user = await this.prisma.user.findFirst({
            where: { OR: [{ googleId: payload.sub }, { email: normalizedEmail }] },
        });

        if (!user) {
            isNewUser = true;
            user = await this.prisma.user.create({
                data: {
                    email: normalizedEmail,
                    name: payload.name || null,
                    googleId: payload.sub,
                    emailVerified: true,
                    tosAccepted: true,
                    countryCode: 'NG',
                },
            });
            // Create default workspace for new Google users
            await this.prisma.workspace.create({
                data: {
                    name: `${payload.name || 'My'}'s Store`,
                    businessType: 'Other',
                    countryCode: 'NG',
                    ownerId: user.id,
                    tier: 'FREE',
                    status: 'ACTIVE',
                    members: {
                        create: {
                            userId: user.id,
                            email: normalizedEmail,   // ← required by new schema
                            role: 'OWNER',
                            status: 'ACTIVE',
                        },
                    },
                },
            });
            // Auto-link any pending workspace invites for this email
            await this.prisma.workspaceMember.updateMany({
                where: { email: normalizedEmail, status: 'PENDING' },
                data: {
                    userId: user.id,
                    status: 'ACTIVE',
                    inviteToken: null,
                    inviteExpiry: null,
                },
            });
        } else if (!user.googleId) {
            // Link existing account to Google
            user = await this.prisma.user.update({
                where: { id: user.id },
                data: { googleId: payload.sub, emailVerified: true },
            });
        }

        const tokens = await this.generateTokens(user.id, user.email);
        const workspaces = await this.getUserWorkspaces(user.id);
        const ownerWorkspace = workspaces.find(w => w.role === 'OWNER');
        const businessName = ownerWorkspace ? ownerWorkspace.name : (workspaces[0] ? workspaces[0].name : '');

        return {
            ...tokens,
            user_id: user.id,
            email: user.email,
            name: user.name,
            workspaces,
            businessName,
            isNewUser,
        };
    }

    // ── Refresh Tokens ─────────────────────────────────────────────────────────
    async refreshTokens(refreshToken: string) {
        try {
            const payload = await this.jwtService.verifyAsync(refreshToken, {
                secret: REFRESH_SECRET_RESOLVED,
            });
            const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
            if (!user) throw new UnauthorizedException();

            if (this.redisService.isAvailable()) {
                const storedHash = await this.redisService.get(`refresh:${user.id}`);
                const incomingHash = createHash('sha256').update(refreshToken).digest('hex');

                if (!storedHash || storedHash !== incomingHash) {
                    throw new UnauthorizedException('Refresh token revoked or invalid');
                }
            }
            // If Redis is unavailable, we can't check revocation — fall back to
            // trusting the JWT's own signature and expiry rather than hard-failing
            // every refresh in the app during a Redis outage.

            const tokens = await this.generateTokens(user.id, user.email);
            const workspaces = await this.getUserWorkspaces(user.id);
            const ownerWorkspace = workspaces.find(w => w.role === 'OWNER');
            const businessName = ownerWorkspace ? ownerWorkspace.name : (workspaces[0] ? workspaces[0].name : '');
            return { ...tokens, user_id: user.id, workspaces, businessName };
        } catch (e: any) {
            if (e instanceof UnauthorizedException) throw e;
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }

    // ── Logout ─────────────────────────────────────────────────────────────────
    async logout(userId: string) {
        await this.redisService.delete(`refresh:${userId}`);
        return { success: true, message: 'Logged out successfully' };
    }

    // ── Forgot Password ────────────────────────────────────────────────────────
    async forgotPassword(email: string) {
        const normalizedEmail = email.toLowerCase().trim();
        const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

        // Always return success to prevent email enumeration attacks
        if (!user) return { success: true, message: 'If an account exists, a reset link has been sent' };

        // Invalidate old reset tokens
        await this.prisma.emailVerification.updateMany({
            where: { email: normalizedEmail, type: 'RESET_PASSWORD', used: false },
            data: { used: true },
        });

        const token = randomBytes(32).toString('hex');
        await this.prisma.emailVerification.create({
            data: {
                email: normalizedEmail,
                token,
                type: 'RESET_PASSWORD',
                expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
            },
        });
        await this.emailService.sendPasswordResetEmail(normalizedEmail, user.name || null, token);

        return { success: true, message: 'If an account exists, a reset link has been sent' };
    }

    // ── Reset Password (token-based) ───────────────────────────────────────────
    async resetPassword(token: string, newPassword: string) {
        const record = await this.prisma.emailVerification.findUnique({ where: { token } });

        if (!record || record.used || record.type !== 'RESET_PASSWORD') {
            throw new BadRequestException('Reset link is invalid or has already been used');
        }
        if (new Date() > record.expiresAt) {
            throw new BadRequestException('Reset link has expired. Please request a new one.');
        }
        if (newPassword.length < 8) {
            throw new BadRequestException('Password must be at least 8 characters');
        }

        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { email: record.email },
                data: { password: hashedPassword },
            }),
            this.prisma.emailVerification.update({
                where: { token },
                data: { used: true },
            }),
        ]);

        return { success: true, message: 'Password reset successful. You can now log in.' };
    }

    // ── Update Expo Push Token ─────────────────────────────────────────────────
    async updatePushToken(userId: string, token: string) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { expoPushToken: token },
        });
        return { success: true };
    }

    // ── Get My Workspaces ──────────────────────────────────────────────────────
    async getMyWorkspaces(userId: string) {
        return this.getUserWorkspaces(userId);
    }

    // ── Verify Email Code (OTP) ────────────────────────────────────────────────
    async verifyEmailCode(email: string, code: string) {
        const normalizedEmail = email.toLowerCase().trim();
        const record = await this.prisma.emailVerification.findFirst({
            where: {
                email: normalizedEmail,
                code,
                type: 'VERIFY',
                used: false,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        if (!record) {
            throw new BadRequestException('Verification code is invalid');
        }
        if (new Date() > record.expiresAt) {
            throw new BadRequestException('Verification code has expired. Please request a new one.');
        }

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { email: record.email },
                data: { emailVerified: true },
            }),
            this.prisma.emailVerification.update({
                where: { id: record.id },
                data: { used: true },
            }),
        ]);

        return { success: true, message: 'Email verified successfully. You can now log in.' };
    }

    // ── Change Password ────────────────────────────────────────────────────────
    async changePassword(userId: string, currentPassword: string, newPassword: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        // Google-only OAuth users have no password — they can't use this endpoint
        if (!user.password) {
            throw new BadRequestException(
                'This account uses Google Sign-In and does not have a password. ' +
                'You cannot change your password here.'
            );
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) throw new UnauthorizedException('Current password is incorrect');

        if (newPassword.length < 8) {
            throw new BadRequestException('New password must be at least 8 characters');
        }
        if (newPassword === currentPassword) {
            throw new BadRequestException('New password must be different from your current password');
        }

        const hashed = await bcrypt.hash(newPassword, 12);
        await this.prisma.user.update({
            where: { id: userId },
            data: { password: hashed },
        });

        return { success: true, message: 'Password updated successfully' };
    }

    // ── Delete Account ─────────────────────────────────────────────────────────
    async deleteAccount(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const ownedWorkspaces = await this.prisma.workspace.findMany({ where: { ownerId: userId } });
        const ownedWorkspaceIds = ownedWorkspaces.map(w => w.id);

        await this.prisma.$transaction([
            // Delete staff activities in owned workspaces
            this.prisma.staffActivity.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
            // Delete staff activities of user
            this.prisma.staffActivity.deleteMany({ where: { userId } }),
            
            // Delete sales in owned workspaces
            this.prisma.sale.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
            // Delete sales made by the user
            this.prisma.sale.deleteMany({ where: { staffId: userId } }),

            // Delete products in owned workspaces
            this.prisma.userProduct.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),

            // Delete members in owned workspaces
            this.prisma.workspaceMember.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
            // Delete memberships of the user
            this.prisma.workspaceMember.deleteMany({ where: { userId } }),

            // Delete customers in owned workspaces
            this.prisma.customer.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),

            // Delete notifications in owned workspaces
            this.prisma.notification.deleteMany({ where: { workspaceId: { in: ownedWorkspaceIds } } }),
            // Delete user notifications
            this.prisma.notification.deleteMany({ where: { userId } }),

            // Delete email verification records for the user's email
            this.prisma.emailVerification.deleteMany({ where: { email: user.email } }),

            // Delete the workspaces themselves
            this.prisma.workspace.deleteMany({ where: { ownerId: userId } }),

            // Finally, delete the User
            this.prisma.user.delete({ where: { id: userId } }),
        ]);

        return { success: true, message: 'Account and all associated data deleted successfully' };
    }
}
