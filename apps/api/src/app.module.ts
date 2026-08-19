import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { DebtsModule } from './debts/debts.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SharedModule } from './shared/shared.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    // Multi-tier global throttle: 10 req/sec AND 100 req/min per IP
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,   // 1 second window
        limit: 10,   // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 60000,  // 1 minute window
        limit: 100,  // 100 requests per minute
      },
    ]),
    // Cron job scheduler (debt reminders, onboarding nudges)
    ScheduleModule.forRoot(),
    // Global RedisService + DebtReminderService
    SharedModule,
    PrismaModule,
    AuthModule,
    WorkspaceModule,
    ProductsModule,
    SalesModule,
    PaymentsModule,
    DebtsModule,
    CatalogueModule,
    NotificationsModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Global throttle — applies to all routes
    },
  ],
})
export class AppModule {}
