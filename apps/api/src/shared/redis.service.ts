import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';

@Injectable()
export class RedisService implements OnModuleInit {
    private readonly logger = new Logger(RedisService.name);
    private client: Redis | null = null;
    private available = false;

    onModuleInit() {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;

        if (!url || !token) {
            this.logger.error(
                'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set — ' +
                'Redis-backed features (rate limiting, refresh token revocation) are disabled.',
            );
            this.available = false;
            return;
        }

        this.client = new Redis({ url, token });
        this.available = true;
        this.logger.log('[Redis] Upstash Redis client initialized');
    }

    isAvailable(): boolean {
        return this.available;
    }

    getClient(): Redis {
        if (!this.client) {
            throw new Error('RedisService.getClient() called while Redis is unavailable — check isAvailable() first');
        }
        return this.client;
    }

    async set(key: string, value: string, expirySeconds?: number): Promise<void> {
        if (!this.available || !this.client) return;
        try {
            if (expirySeconds) {
                await this.client.setex(key, expirySeconds, value);
            } else {
                await this.client.set(key, value);
            }
        } catch (e) {
            this.logger.error(`Redis SET failed for key "${key}":`, e as any);
        }
    }

    async get(key: string): Promise<string | null> {
        if (!this.available || !this.client) return null;
        try {
            const result = await this.client.get<string>(key);
            return result ?? null;
        } catch (e) {
            this.logger.error(`Redis GET failed for key "${key}":`, e as any);
            return null;
        }
    }

    async delete(key: string): Promise<void> {
        if (!this.available || !this.client) return;
        try {
            await this.client.del(key);
        } catch (e) {
            this.logger.error(`Redis DELETE failed for key "${key}":`, e as any);
        }
    }

    async exists(key: string): Promise<boolean> {
        if (!this.available || !this.client) return false;
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (e) {
            this.logger.error(`Redis EXISTS failed for key "${key}":`, e as any);
            return false;
        }
    }
}
