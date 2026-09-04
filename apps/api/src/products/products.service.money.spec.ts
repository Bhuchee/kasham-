jest.mock('../notifications/notifications.service', () => ({
    NotificationsService: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ProductsService — kobo mirror (B5)', () => {
    let service: ProductsService;
    let prisma: any;

    beforeEach(async () => {
        prisma = {
            userProduct: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn(),
                upsert: jest.fn().mockResolvedValue({ stock: 5 }),
                update: jest.fn().mockResolvedValue({ stock: 5 }),
            },
            workspaceMember: { findMany: jest.fn().mockResolvedValue([]) },
            staffActivity: { create: jest.fn().mockResolvedValue({}) },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductsService,
                { provide: PrismaService, useValue: prisma },
                { provide: NotificationsService, useValue: { createNotification: jest.fn(), sendToWorkspace: jest.fn() } },
            ],
        }).compile();

        service = module.get<ProductsService>(ProductsService);
    });

    it('syncUserProducts stamps sellingPriceKobo/costPriceKobo on create', async () => {
        await service.syncUserProducts('ws-1', [
            { id: 'p1', name: 'Widget', sellingPrice: 250, costPrice: 100, stock: 5 },
        ]);

        expect(prisma.userProduct.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({ sellingPriceKobo: 25000, costPriceKobo: 10000 }),
            }),
        );
    });

    it('update (PATCH) does not wipe sellingPriceKobo/costPriceKobo when those fields are not part of the patch', async () => {
        prisma.userProduct.findFirst.mockResolvedValue({ id: 'p1', workspaceId: 'ws-1', stock: 5 });

        // A patch that only changes stock — sellingPrice/costPrice untouched
        await service.update('p1', 'ws-1', { stock: 3 });

        const call = prisma.userProduct.update.mock.calls[0][0];
        expect(call.data.sellingPrice).toBeUndefined();
        expect(call.data.sellingPriceKobo).toBeUndefined(); // must be undefined (skip), NOT null (wipe)
        expect(call.data.costPrice).toBeUndefined();
        expect(call.data.costPriceKobo).toBeUndefined();
        expect(call.data.stock).toBe(3);
    });

    it('update (PATCH) sets the kobo mirror when the price actually changes', async () => {
        prisma.userProduct.findFirst.mockResolvedValue({ id: 'p1', workspaceId: 'ws-1', stock: 5 });

        await service.update('p1', 'ws-1', { sellingPrice: 500 });

        const call = prisma.userProduct.update.mock.calls[0][0];
        expect(call.data.sellingPriceKobo).toBe(50000);
    });
});
