import {
    Controller,
    Post,
    Get,
    Delete,
    Body,
    Query,
    HttpCode,
    HttpStatus,
    BadRequestException,
    UseGuards,
    Request,
    Header,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthRateLimitGuard } from './guards/rate-limit.guard';
import { WorkspaceService } from '../workspace/workspace.service';

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private workspaceService: WorkspaceService,
    ) {}

    // ── Registration & Verification ───────────────────────────────────────────

    @UseGuards(AuthRateLimitGuard)
    @Post('register')
    register(@Body() body: Record<string, any>) {
        if (!body.email || !body.password) {
            throw new BadRequestException('Email and password are required');
        }
        return this.authService.register(
            body.email,
            body.password,
            body.name,
            body.country_code,
            body.tos_accepted,
            body.business_name,
            body.business_type,
        );
    }

    @Get('verify-email')
    verifyEmail(@Query('token') token: string) {
        if (!token) throw new BadRequestException('Verification token is required');
        return this.authService.verifyEmail(token);
    }

    @HttpCode(HttpStatus.OK)
    @Post('resend-verification')
    resendVerification(@Body() body: Record<string, any>) {
        if (!body.email) throw new BadRequestException('Email is required');
        return this.authService.resendVerification(body.email);
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    @UseGuards(AuthRateLimitGuard)
    @HttpCode(HttpStatus.OK)
    @Post('login')
    login(@Body() body: Record<string, any>) {
        if (!body.email || !body.password) {
            throw new BadRequestException('Email and password are required');
        }
        return this.authService.login(body.email, body.password);
    }

    // ── Google OAuth ──────────────────────────────────────────────────────────

    @HttpCode(HttpStatus.OK)
    @Post('google')
    googleAuth(@Body() body: Record<string, any>) {
        if (!body.id_token) throw new BadRequestException('Google ID token is required');
        return this.authService.googleAuth(body.id_token);
    }

    // ── Token Refresh ─────────────────────────────────────────────────────────

    @HttpCode(HttpStatus.OK)
    @Post('refresh')
    refresh(@Body() body: Record<string, any>) {
        if (!body.refresh_token) throw new BadRequestException('Refresh token is required');
        return this.authService.refreshTokens(body.refresh_token);
    }

    // ── Password Management ───────────────────────────────────────────────────

    @UseGuards(AuthRateLimitGuard)
    @HttpCode(HttpStatus.OK)
    @Post('forgot-password')
    forgotPassword(@Body() body: Record<string, any>) {
        if (!body.email) throw new BadRequestException('Email is required');
        return this.authService.forgotPassword(body.email);
    }

    @Get('reset-password')
    @Header('Content-Type', 'text/html')
    renderResetPasswordPage(@Query('token') token: string) {
        if (!token) throw new BadRequestException('Token is required');
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Reset Your Chobo Password</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        background-color: #f3f4f6;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 16px;
                        box-sizing: border-box;
                    }
                    .card {
                        background: white;
                        padding: 32px;
                        border-radius: 16px;
                        box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
                        width: 100%;
                        max-width: 400px;
                        box-sizing: border-box;
                    }
                    h2 {
                        color: #111827;
                        margin-top: 0;
                        margin-bottom: 8px;
                        font-size: 24px;
                        font-weight: 800;
                    }
                    p {
                        color: #6b7280;
                        font-size: 14px;
                        margin-bottom: 24px;
                    }
                    .form-group {
                        margin-bottom: 20px;
                    }
                    label {
                        display: block;
                        color: #374151;
                        font-size: 13px;
                        font-weight: 600;
                        margin-bottom: 6px;
                    }
                    input {
                        width: 100%;
                        padding: 12px;
                        border: 1px solid #d1d5db;
                        border-radius: 8px;
                        font-size: 16px;
                        box-sizing: border-box;
                    }
                    input:focus {
                        outline: none;
                        border-color: #16a34a;
                        box-shadow: 0 0 0 3px rgba(22,163,74,0.1);
                    }
                    button {
                        width: 100%;
                        background-color: #16a34a;
                        color: white;
                        border: none;
                        padding: 14px;
                        font-size: 16px;
                        font-weight: 600;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    }
                    button:hover {
                        background-color: #15803d;
                    }
                    .message {
                        display: none;
                        margin-top: 16px;
                        padding: 12px;
                        border-radius: 8px;
                        font-size: 14px;
                        text-align: center;
                    }
                    .success {
                        background-color: #f0fdf4;
                        color: #166534;
                        border: 1px solid #bbf7d0;
                    }
                    .error {
                        background-color: #fef2f2;
                        color: #991b1b;
                        border: 1px solid #fca5a5;
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>Reset Password</h2>
                    <p style="margin-bottom: 20px;">Please enter a new password for your Chobo account.</p>
                    <form id="resetForm" onsubmit="handleSubmit(event)">
                        <div class="form-group">
                            <label for="password">New Password</label>
                            <input type="password" id="password" required minlength="8" placeholder="At least 8 characters">
                        </div>
                        <div class="form-group">
                            <label for="confirmPassword">Confirm Password</label>
                            <input type="password" id="confirmPassword" required minlength="8" placeholder="Repeat new password">
                        </div>
                        <button type="submit" id="submitBtn">Update Password</button>
                    </form>
                    <div id="msg" class="message"></div>
                </div>

                <script>
                    async function handleSubmit(event) {
                        event.preventDefault();
                        const password = document.getElementById('password').value;
                        const confirmPassword = document.getElementById('confirmPassword').value;
                        const msg = document.getElementById('msg');
                        const submitBtn = document.getElementById('submitBtn');

                        if (password !== confirmPassword) {
                            msg.className = 'message error';
                            msg.textContent = 'Passwords do not match';
                            msg.style.display = 'block';
                            return;
                        }

                        submitBtn.disabled = true;
                        submitBtn.textContent = 'Updating...';
                        msg.style.display = 'none';

                        try {
                            const res = await fetch('/api/v1/auth/reset-password', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ token: '${token}', new_password: password })
                            });
                            const data = await res.json();
                            if (res.ok) {
                                msg.className = 'message success';
                                msg.textContent = 'Password reset successfully! You can now close this tab and log in to the app.';
                                msg.style.display = 'block';
                                document.getElementById('resetForm').style.display = 'none';
                            } else {
                                msg.className = 'message error';
                                msg.textContent = data.message || 'Failed to reset password';
                                msg.style.display = 'block';
                                submitBtn.disabled = false;
                                submitBtn.textContent = 'Update Password';
                            }
                        } catch (e) {
                            msg.className = 'message error';
                            msg.textContent = 'An error occurred. Please try again.';
                            msg.style.display = 'block';
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Update Password';
                        }
                    }
                </script>
            </body>
            </html>
        `;
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.OK)
    @Post('logout')
    logout(@Request() req: any) {
        return this.authService.logout(req.user.sub);
    }

    @HttpCode(HttpStatus.OK)
    @Post('reset-password')
    resetPassword(@Body() body: Record<string, any>) {
        if (!body.token || !body.new_password) {
            throw new BadRequestException('Token and new password are required');
        }
        return this.authService.resetPassword(body.token, body.new_password);
    }

    // ── Push Notification Token ───────────────────────────────────────────────

    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.OK)
    @Post('push-token')
    updatePushToken(@Request() req: any, @Body() body: Record<string, any>) {
        if (!body.expo_push_token) throw new BadRequestException('Expo push token is required');
        return this.authService.updatePushToken(req.user.sub, body.expo_push_token);
    }

    // ── My Workspaces ─────────────────────────────────────────────────────────

    @UseGuards(AuthGuard)
    @Get('me/workspaces')
    getMyWorkspaces(@Request() req: any) {
        return this.authService.getMyWorkspaces(req.user.sub);
    }

    // ── Me ────────────────────────────────────────────────────────────────────

    @UseGuards(AuthGuard)
    @Get('me')
    getMe(@Request() req: any) {
        return { user_id: req.user.sub, email: req.user.email };
    }

    // ── Workspace Invite (public + authenticated) ─────────────────────────────

    // GET /auth/invite?token=xxx — public: look up invite details before login
    @Get('invite')
    getInviteDetails(@Query('token') token: string) {
        if (!token) throw new BadRequestException('Invite token is required');
        return this.workspaceService.getInviteDetails(token);
    }

    // POST /auth/invite/accept — requires login; links the logged-in user to the invite
    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.OK)
    @Post('invite/accept')
    acceptInvite(@Request() req: any, @Body() body: Record<string, any>) {
        if (!body.token) throw new BadRequestException('Invite token is required');
        return this.workspaceService.acceptInvite(body.token, req.user.sub);
    }

    // POST /auth/invite/decline — public: anyone can decline (no account needed)
    @HttpCode(HttpStatus.OK)
    @Post('invite/decline')
    declineInvite(@Body() body: Record<string, any>) {
        if (!body.token) throw new BadRequestException('Invite token is required');
        return this.workspaceService.declineInvite(body.token);
    }

    // POST /auth/verify-email-code
    @HttpCode(HttpStatus.OK)
    @Post('verify-email-code')
    verifyEmailCode(@Body() body: Record<string, any>) {
        if (!body.email || !body.code) {
            throw new BadRequestException('Email and code are required');
        }
        return this.authService.verifyEmailCode(body.email, body.code);
    }

    // DELETE /auth/account
    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.OK)
    @Delete('account')
    deleteAccount(@Request() req: any) {
        return this.authService.deleteAccount(req.user.sub);
    }

    // POST /auth/change-password
    @UseGuards(AuthGuard)
    @HttpCode(HttpStatus.OK)
    @Post('change-password')
    changePassword(@Request() req: any, @Body() body: Record<string, any>) {
        if (!body.currentPassword || !body.newPassword) {
            throw new BadRequestException('currentPassword and newPassword are required');
        }
        return this.authService.changePassword(req.user.sub, body.currentPassword, body.newPassword);
    }
}
