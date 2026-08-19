import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleRevenueCatEvent(body: any): Promise<void> {
    const event = body?.event;
    if (!event) {
      this.logger.warn('Received webhook without event payload');
      return;
    }

    const eventType = event.type;
    const userId = event.app_user_id || event.original_app_user_id;

    if (!userId) {
      this.logger.warn(`Event ${eventType} is missing user ID`);
      return;
    }

    this.logger.log(`Handling ${eventType} for user ${userId}`);

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'PRODUCT_CHANGE':
        await this.handleSubscriptionActive(userId, event);
        break;
      case 'EXPIRATION':
        await this.handleSubscriptionExpired(userId);
        break;
      case 'CANCELLATION':
      case 'BILLING_ISSUE':
        await this.notifyUser(userId, `Subscription update: ${eventType}`);
        break;
      default:
        this.logger.log(`Unhandled RevenueCat event type: ${eventType}`);
    }
  }

  private async handleSubscriptionActive(userId: string, event: any): Promise<void> {
    let newTier = 'FREE';
    const productStr = JSON.stringify(event).toLowerCase();
    if (productStr.includes('business')) {
      newTier = 'BUSINESS';
    } else if (productStr.includes('growth')) {
      newTier = 'GROWTH';
    }

    await this.prisma.workspace.updateMany({
      where: { ownerId: userId, status: 'ACTIVE' },
      data: { tier: newTier as any }
    });

    await this.notifyUser(userId, `Your subscription has been updated to ${newTier} tier.`);
  }

  private async handleSubscriptionExpired(userId: string): Promise<void> {
    await this.prisma.workspace.updateMany({
      where: { ownerId: userId, status: 'ACTIVE' },
      data: { tier: 'FREE' as any }
    });

    await this.notifyUser(userId, 'Your subscription has expired. Workspaces have been downgraded to FREE tier.');
  }

  private async notifyUser(userId: string, message: string): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          message,
          type: 'SYSTEM',
        }
      });
    } catch (e) {
      this.logger.error(`Failed to create notification for user ${userId}:`, e);
    }
  }
}
