import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class RedisService implements OnModuleInit {
    private readonly logger = new Logger(RedisService.name);
    private client: Redis;

    onModuleInit() {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;

        if (!url || !token) {
            throw new Error(
                'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in environment variables',
            );
        }

        this.client = new Redis({ url, token });
        this.logger.log('[Redis] Upstash Redis client initialized');
    }

    getClient(): Redis {
        return this.client;
    }

    async set(key: string, value: string, expirySeconds?: number): Promise<void> {
        if (expirySeconds) {
            await this.client.setex(key, expirySeconds, value);
        } else {
            await this.client.set(key, value);
        }
    }

    async get(key: string): Promise<string | null> {
        const result = await this.client.get<string>(key);
        return result ?? null;
    }

    async delete(key: string): Promise<void> {
        await this.client.del(key);
    }

    async exists(key: string): Promise<boolean> {
        const result = await this.client.exists(key);
        return result === 1;
    }
}
