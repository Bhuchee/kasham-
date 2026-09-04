import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Ratelimit } from '@upstash/ratelimit';
import { RedisService } from '../../shared/redis.service';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
    private readonly logger = new Logger(AuthRateLimitGuard.name);
    // Lazily initialized after RedisService.onModuleInit() completes
    private ratelimit: Ratelimit | null = null;

    constructor(private redisService: RedisService) {}

    private getRatelimit(): Ratelimit {
        if (!this.ratelimit) {
            // Lazy init — ensures RedisService.client is ready before we use it
            this.ratelimit = new Ratelimit({
                redis: this.redisService.getClient(),
                limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 attempts per minute per IP
                analytics: true,
            });
        }
        return this.ratelimit;
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (!this.redisService.isAvailable()) {
            this.logger.warn('Redis unavailable — skipping auth rate limit check');
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const ip =
            request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            request.ip ||
            request.connection?.remoteAddress ||
            'unknown';

        const identifier = `auth:${ip}`;
        const { success, reset } = await this.getRatelimit().limit(identifier);

        if (!success) {
            const secondsUntilReset = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
            throw new HttpException(
                {
                    statusCode: 429,
                    message: `Too many attempts. Please wait ${secondsUntilReset} seconds before trying again.`,
                    retryAfter: secondsUntilReset,
                },
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        return true;
    }
}
