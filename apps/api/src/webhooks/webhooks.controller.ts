import {
  Controller,
  Post,
  Headers,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('revenuecat')
  @HttpCode(HttpStatus.OK)
  async handleRevenueCat(
    @Headers('authorization') authHeader: string,
    @Body() payload: any,
  ) {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

    // RevenueCat sends: "Authorization: Bearer <secret>"
    // Extract the token part after "Bearer "
    const receivedSecret = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : authHeader?.trim();

    if (!secret || receivedSecret !== secret) {
      this.logger.warn(
        `Unauthorized webhook attempt. ` +
        `Expected secret configured: ${!!secret}, ` +
        `Header present: ${!!authHeader}`,
      );
      throw new UnauthorizedException('Invalid webhook secret');
    }

    this.logger.log(`RevenueCat webhook received: ${payload?.event?.type}`);
    await this.webhooksService.handleRevenueCatEvent(payload);
    return { received: true };
  }
}
