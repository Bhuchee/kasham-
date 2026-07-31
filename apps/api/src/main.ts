import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
    // ── Section 3D: JWT_SECRET strength validation ──────────────────────────────
    const jwtSecret = process.env.JWT_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!jwtSecret || jwtSecret.length < 32) {
        throw new Error(
            'JWT_SECRET must be at least 32 characters. Generate with:\n  node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"',
        );
    }
    if (!refreshSecret || refreshSecret.length < 32) {
        throw new Error('JWT_REFRESH_SECRET must be at least 32 characters.');
    }
    if (
        jwtSecret === 'kasham-super-secret-jwt-key-2024' ||
        jwtSecret === 'dev-jwt-secret-only'
    ) {
        throw new Error(
            'JWT_SECRET is set to an insecure default value. Update it immediately.',
        );
    }

    const app = await NestFactory.create(AppModule);

    // ── Section 3A: Hardened Helmet headers ────────────────────────────────────
    app.use(
        helmet({
            contentSecurityPolicy: false,       // API-only — no HTML served
            crossOriginEmbedderPolicy: false,   // Allow embedding for mobile clients
        }),
    );

    // ── Section 3B: CORS origin whitelist ──────────────────────────────────────
    const allowedOrigins = [
        'https://usechobo.com',
        'https://admin.usechobo.com',
        'https://api.usechobo.com',
        'https://api-staging.usechobo.com',
    ];
    if (process.env.NODE_ENV !== 'production') {
        allowedOrigins.push('http://localhost:3000', 'http://localhost:8081');
    }

    app.enableCors({
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true,
    });

    // ── Section 3C: Global input validation pipe ────────────────────────────────
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,              // Strip properties not in DTO
            forbidNonWhitelisted: true,   // Throw 400 if unknown properties sent
            transform: true,              // Auto-transform types (string -> number etc)
            transformOptions: {
                enableImplicitConversion: true,
            },
        }),
    );

    app.setGlobalPrefix('api/v1');

    // ── Database connectivity check ─────────────────────────────────────────────
    const prismaService = app.get(PrismaService);
    try {
        await prismaService.$connect();
        console.log('[Startup] Database connected successfully');
    } catch (e: any) {
        console.error('[Startup] Database connection FAILED:', e.message);
    }

    await app.listen(process.env.PORT ?? 3000);
    console.log(`Chobo API running on: http://localhost:${process.env.PORT ?? 3000}/api/v1`);
}
bootstrap();
