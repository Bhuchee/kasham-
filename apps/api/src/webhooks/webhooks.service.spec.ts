import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WebhooksService', () => {
    let service: WebhooksService;
    let prisma: {
        workspace: { updateMany: jest.Mock };
        notification: { create: jest.Mock };
    };

    beforeEach(async () => {
        prisma = {
            workspace: { updateMany: jest.fn() },
            notification: { create: jest.fn() },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [WebhooksService, { provide: PrismaService, useValue: prisma }],
        }).compile();

        service = module.get<WebhooksService>(WebhooksService);
    });

    const tierOf = () => prisma.workspace.updateMany.mock.calls[0][0].data.tier;

    it('sets GROWTH when entitlement_ids includes growth', async () => {
        await service.handleRevenueCatEvent({
            event: { type: 'INITIAL_PURCHASE', app_user_id: 'u1', entitlement_ids: ['growth'] },
        });
        expect(tierOf()).toBe('GROWTH');
    });

    it('sets BUSINESS when entitlement_ids includes business', async () => {
        await service.handleRevenueCatEvent({
            event: { type: 'RENEWAL', app_user_id: 'u1', entitlement_ids: ['business'] },
        });
        expect(tierOf()).toBe('BUSINESS');
    });

    it('prefers BUSINESS if both entitlements are somehow present', async () => {
        await service.handleRevenueCatEvent({
            event: { type: 'PRODUCT_CHANGE', app_user_id: 'u1', entitlement_ids: ['growth', 'business'] },
        });
        expect(tierOf()).toBe('BUSINESS');
    });

    it('does NOT silently default a real paying customer to FREE for an unrecognized entitlement', async () => {
        const warnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
        await service.handleRevenueCatEvent({
            event: { type: 'INITIAL_PURCHASE', app_user_id: 'u1', entitlement_ids: ['some_new_sku'] },
        });
        // Tier still resolves to FREE (no match), but it must be LOGGED so it's
        // visible/actionable rather than a silent downgrade — this is the
        // regression this fix targets.
        expect(tierOf()).toBe('FREE');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('some_new_sku'));
    });

    it('sets FREE with no warning when there are genuinely no entitlements (expiration path)', async () => {
        await service.handleRevenueCatEvent({
            event: { type: 'EXPIRATION', app_user_id: 'u1' },
        });
        expect(tierOf()).toBe('FREE');
    });
});
