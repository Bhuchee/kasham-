import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { DebtReminderService } from './debt-reminder.service';
import { EmailService } from './email.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Global()
@Module({
    imports: [NotificationsModule],
    providers: [RedisService, DebtReminderService, EmailService],
    exports: [RedisService, EmailService],
})
export class SharedModule {}
