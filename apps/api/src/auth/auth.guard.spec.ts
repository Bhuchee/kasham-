import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';

function makeContext(authHeader?: string): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ headers: { authorization: authHeader } }),
        }),
    } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
    it('rejects when no token is present', async () => {
        const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
        const guard = new AuthGuard(jwtService);
        await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(UnauthorizedException);
    });

    it('never passes a hardcoded fallback secret to verifyAsync — trusts the module-configured secret', async () => {
        const verifyAsync = jest.fn().mockResolvedValue({ sub: 'user-1' });
        const jwtService = { verifyAsync } as unknown as JwtService;
        const guard = new AuthGuard(jwtService);

        await guard.canActivate(makeContext('Bearer valid.jwt.token'));

        expect(verifyAsync).toHaveBeenCalledWith('valid.jwt.token');
        expect(verifyAsync).not.toHaveBeenCalledWith('valid.jwt.token', expect.objectContaining({ secret: expect.anything() }));
    });

    it('rejects a token that fails verification against the real configured secret', async () => {
        const verifyAsync = jest.fn().mockRejectedValue(new Error('invalid signature'));
        const jwtService = { verifyAsync } as unknown as JwtService;
        const guard = new AuthGuard(jwtService);

        await expect(guard.canActivate(makeContext('Bearer forged.with.old.fallback'))).rejects.toThrow(
            UnauthorizedException,
        );
    });
});
