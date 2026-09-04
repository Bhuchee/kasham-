import { createHash } from 'crypto';

// auth.service.ts throws at module load if JWT_REFRESH_SECRET is unset, so it
// must be set before the module is first required, and the module must be
// re-evaluated fresh per test via isolateModules.
function loadAuthService() {
    process.env.JWT_REFRESH_SECRET = 'a'.repeat(64);
    let AuthServiceClass: any;
    jest.isolateModules(() => {
        AuthServiceClass = require('./auth.service').AuthService;
    });
    return AuthServiceClass;
}

describe('AuthService.refreshTokens — resilience when Redis is down (B4)', () => {
    const refreshToken = 'valid.refresh.token';
    const userId = 'user-1';

    function makeService(redisAvailable: boolean, storedHash: string | null) {
        const AuthService = loadAuthService();

        const jwtService = {
            verifyAsync: jest.fn().mockResolvedValue({ sub: userId, email: 'a@b.com' }),
            signAsync: jest.fn().mockResolvedValue('new.token'),
        };
        const prisma = {
            user: { findUnique: jest.fn().mockResolvedValue({ id: userId, email: 'a@b.com' }) },
            workspaceMember: { findMany: jest.fn().mockResolvedValue([]) },
        };
        const emailService = {};
        const redisService = {
            isAvailable: jest.fn().mockReturnValue(redisAvailable),
            get: jest.fn().mockResolvedValue(storedHash),
            set: jest.fn().mockResolvedValue(undefined),
        };

        const service = new AuthService(prisma, jwtService, emailService, redisService);
        return service;
    }

    it('when Redis is available and the stored hash matches, refresh succeeds', async () => {
        const incomingHash = createHash('sha256').update(refreshToken).digest('hex');
        const service = makeService(true, incomingHash);

        const result = await service.refreshTokens(refreshToken);
        expect(result.user_id).toBe(userId);
    });

    it('when Redis is available and the token was revoked (no stored hash), refresh is rejected', async () => {
        const service = makeService(true, null);

        // Not asserting `instanceof UnauthorizedException` here: jest.isolateModules
        // gives auth.service.ts its own copy of @nestjs/common's exception classes,
        // so instanceof checks against this file's own import would false-negative
        // despite being functionally the same error. Message + status are what
        // actually reach the client, so assert on those instead.
        await expect(service.refreshTokens(refreshToken)).rejects.toMatchObject({
            message: 'Refresh token revoked or invalid',
            status: 401,
        });
    });

    it('when Redis is UNAVAILABLE, refresh still succeeds by trusting the JWT alone — does not hard-fail app-wide', async () => {
        // storedHash would be null/irrelevant here since isAvailable() is false —
        // the revocation check must be skipped entirely, not treated as "no match".
        const service = makeService(false, null);

        const result = await service.refreshTokens(refreshToken);
        expect(result.user_id).toBe(userId);
    });
});
