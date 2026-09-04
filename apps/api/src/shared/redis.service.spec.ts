import { RedisService } from './redis.service';

describe('RedisService — resilience (B4)', () => {
    const ORIGINAL_URL = process.env.UPSTASH_REDIS_REST_URL;
    const ORIGINAL_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

    afterEach(() => {
        process.env.UPSTASH_REDIS_REST_URL = ORIGINAL_URL;
        process.env.UPSTASH_REDIS_REST_TOKEN = ORIGINAL_TOKEN;
    });

    it('does NOT throw on init when Upstash env vars are missing (app must still boot)', () => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const service = new RedisService();
        expect(() => service.onModuleInit()).not.toThrow();
        expect(service.isAvailable()).toBe(false);
    });

    it('get/set/delete/exists all safely no-op instead of throwing when unavailable', async () => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;

        const service = new RedisService();
        service.onModuleInit();

        await expect(service.set('k', 'v')).resolves.toBeUndefined();
        await expect(service.get('k')).resolves.toBeNull();
        await expect(service.delete('k')).resolves.toBeUndefined();
        await expect(service.exists('k')).resolves.toBe(false);
    });

    it('is available when Upstash env vars are present', () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

        const service = new RedisService();
        service.onModuleInit();
        expect(service.isAvailable()).toBe(true);
    });
});
