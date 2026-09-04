import { Test, TestingModule } from '@nestjs/testing';

// notifications.service.ts transitively imports expo-server-sdk, which ships
// an ESM build Jest's default CommonJS transform can't require() (a
// pre-existing gap — no spec had ever imported this chain before). Mocking
// the module avoids needing a project-wide Jest config change just for this
// one test file.
jest.mock('../notifications/notifications.service', () => ({
    NotificationsService: jest.fn(),
}));

import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('SalesService', () => {
    let service: SalesService;
    let prisma: any;
    let notifications: { sendToWorkspace: jest.Mock; createNotification: jest.Mock; sendToUser: jest.Mock };

    beforeEach(async () => {
        prisma = {
            sale: { createMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]) },
            saleItem: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
            userProduct: { findMany: jest.fn().mockResolvedValue([]) },
            workspace: { findUnique: jest.fn().mockResolvedValue(null) },
            user: { findUnique: jest.fn() },
            staffActivity: { create: jest.fn().mockResolvedValue({}) },
        };
        notifications = {
            sendToWorkspace: jest.fn(),
            createNotification: jest.fn(),
            sendToUser: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SalesService,
                { provide: PrismaService, useValue: prisma },
                { provide: NotificationsService, useValue: notifications },
            ],
        }).compile();

        service = module.get<SalesService>(SalesService);
    });

    it('syncs sale items without throwing (regression test for the removed product.findUnique bug)', async () => {
        await expect(
            service.syncData(
                {
                    sales: { created: [] },
                    saleItems: {
                        created: [
                            { id: 'si-1', sale_id: 'sale-1', user_product_id: 'prod-1', product_name: 'Widget', quantity: 2, price: 10 },
                        ],
                    },
                },
                0,
                'ws-1',
                'staff-1',
            ),
        ).resolves.toEqual({ changes: { products: [], sales: [] }, timestamp: expect.any(Number) });

        expect(prisma.saleItem.createMany).toHaveBeenCalled();
    });

    it('does not attempt any product lookup or notification from the sale-items path (that lives in ProductsService now)', async () => {
        await service.syncData(
            {
                sales: { created: [] },
                saleItems: {
                    created: [{ id: 'si-1', sale_id: 'sale-1', user_product_id: 'prod-1', quantity: 1, price: 5 }],
                },
            },
            0,
            'ws-1',
            'staff-1',
        );

        expect(notifications.sendToWorkspace).not.toHaveBeenCalled();
    });

    describe('getSyncChanges — pull-sync (B3)', () => {
        it('returns products and sales changed since the given timestamp, scoped to the workspace', async () => {
            const since = new Date('2026-01-01T00:00:00Z');
            prisma.userProduct.findMany.mockResolvedValue([{ id: 'p1' }]);
            prisma.sale.findMany.mockResolvedValue([{ id: 's1' }]);

            const result = await service.getSyncChanges('ws-1', since);

            expect(prisma.userProduct.findMany).toHaveBeenCalledWith({
                where: { workspaceId: 'ws-1', updatedAt: { gt: since } },
            });
            expect(prisma.sale.findMany).toHaveBeenCalledWith({
                where: { workspaceId: 'ws-1', updatedAt: { gt: since } },
                include: { items: true },
            });
            expect(result.changes).toEqual({ products: [{ id: 'p1' }], sales: [{ id: 's1' }] });
        });

        it('filters by workspaceId, not userId — UserProduct has no userId field', async () => {
            // Regression guard: the given fix snippet filtered products by
            // `userId`, a field that does not exist on UserProduct. Wiring
            // that in as written would have thrown at every sales/sync call.
            await service.getSyncChanges('ws-1', new Date(0));
            const call = prisma.userProduct.findMany.mock.calls[0][0];
            expect(call.where).not.toHaveProperty('userId');
            expect(call.where).toHaveProperty('workspaceId', 'ws-1');
        });
    });
});
