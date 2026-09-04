// notifications.service.ts transitively imports expo-server-sdk (ESM-only) —
// see sales/sales.service.spec.ts for the full explanation of this mock.
jest.mock('../notifications/notifications.service', () => ({
    NotificationsService: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('ProductsService', () => {
    let service: ProductsService;
    let prisma: any;

    beforeEach(async () => {
        prisma = {
            userProduct: { findUnique: jest.fn(), upsert: jest.fn() },
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

    describe('syncUserProducts — version guard (B3)', () => {
        it('rejects a stale write — a device syncing an older snapshot does not clobber a fresher edit', async () => {
            const serverUpdatedAt = new Date('2026-01-02T00:00:00Z');
            prisma.userProduct.findUnique
                .mockResolvedValueOnce({ stock: 10, updatedAt: serverUpdatedAt }) // staleness check lookup
                .mockResolvedValueOnce({ id: 'p1', name: 'Fresh Name', stock: 10, updatedAt: serverUpdatedAt }); // "current" refetch

            const results = await service.syncUserProducts('ws-1', [
                { id: 'p1', name: 'Stale Name', sellingPrice: 100, stock: 5, updatedAt: '2026-01-01T00:00:00Z' },
            ]);

            expect(prisma.userProduct.upsert).not.toHaveBeenCalled();
            expect(results[0]!.name).toBe('Fresh Name');
        });

        it('applies a genuinely newer write', async () => {
            const serverUpdatedAt = new Date('2026-01-01T00:00:00Z');
            prisma.userProduct.findUnique.mockResolvedValueOnce({ stock: 10, updatedAt: serverUpdatedAt });
            prisma.userProduct.upsert.mockResolvedValue({ id: 'p1', name: 'New Name', stock: 8 });

            const results = await service.syncUserProducts('ws-1', [
                { id: 'p1', name: 'New Name', sellingPrice: 100, stock: 8, updatedAt: '2026-01-02T00:00:00Z' },
            ]);

            expect(prisma.userProduct.upsert).toHaveBeenCalled();
            expect(results[0]!.name).toBe('New Name');
        });

        it('applies normally when the caller sends no updatedAt at all (backward compatible, not silently rejected)', async () => {
            prisma.userProduct.findUnique.mockResolvedValueOnce({ stock: 10, updatedAt: new Date() });
            prisma.userProduct.upsert.mockResolvedValue({ id: 'p1', name: 'No Timestamp', stock: 3 });

            const results = await service.syncUserProducts('ws-1', [
                { id: 'p1', name: 'No Timestamp', sellingPrice: 100, stock: 3 },
            ]);

            expect(prisma.userProduct.upsert).toHaveBeenCalled();
            expect(results[0]!.name).toBe('No Timestamp');
        });

        it('always applies for a brand new product (no staleness check on create)', async () => {
            prisma.userProduct.findUnique.mockResolvedValueOnce(null);
            prisma.userProduct.upsert.mockResolvedValue({ id: 'p-new', name: 'Brand New', stock: 1 });

            await service.syncUserProducts('ws-1', [
                { id: 'p-new', name: 'Brand New', sellingPrice: 100, stock: 1, updatedAt: '2020-01-01T00:00:00Z' },
            ]);

            expect(prisma.userProduct.upsert).toHaveBeenCalled();
        });
    });
});
