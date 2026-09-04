import { ExecutionContext } from '@nestjs/common';
import { AuthRateLimitGuard } from './rate-limit.guard';
import { RedisService } from '../../shared/redis.service';

function makeContext(): ExecutionContext {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ headers: {}, ip: '127.0.0.1' }),
        }),
    } as unknown as ExecutionContext;
}

describe('AuthRateLimitGuard — resilience (B4)', () => {
    it('fails OPEN (allows the request through) when Redis is unavailable, rather than hard-failing login app-wide', async () => {
        const redisService = { isAvailable: jest.fn().mockReturnValue(false), getClient: jest.fn() } as unknown as RedisService;
        const guard = new AuthRateLimitGuard(redisService);

        await expect(guard.canActivate(makeContext())).resolves.toBe(true);
        expect((redisService as any).getClient).not.toHaveBeenCalled();
    });
});
