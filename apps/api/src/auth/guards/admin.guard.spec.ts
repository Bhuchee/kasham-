import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function makeContext(headers: Record<string, string>): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ headers }),
        }),
    } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
    const guard = new AdminGuard();
    const ORIGINAL_ENV = process.env.ADMIN_SECRET;

    afterEach(() => {
        process.env.ADMIN_SECRET = ORIGINAL_ENV;
    });

    it('rejects when ADMIN_SECRET is not configured on the server', () => {
        delete process.env.ADMIN_SECRET;
        expect(() => guard.canActivate(makeContext({}))).toThrow(ForbiddenException);
    });

    it('rejects when no header is provided', () => {
        process.env.ADMIN_SECRET = 'test-secret';
        expect(() => guard.canActivate(makeContext({}))).toThrow(ForbiddenException);
    });

    it('rejects when the header does not match', () => {
        process.env.ADMIN_SECRET = 'test-secret';
        expect(() => guard.canActivate(makeContext({ 'x-admin-secret': 'wrong' }))).toThrow(
            ForbiddenException,
        );
    });

    it('allows when the header matches', () => {
        process.env.ADMIN_SECRET = 'test-secret';
        expect(guard.canActivate(makeContext({ 'x-admin-secret': 'test-secret' }))).toBe(true);
    });
});
