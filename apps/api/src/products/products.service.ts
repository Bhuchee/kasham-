import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffActivityAction } from '../shared/enums';
import { toKobo } from '../shared/money';

@Injectable()
export class ProductsService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) {}

    async findAll(workspaceId: string) {
        return this.prisma.userProduct.findMany({
            where: { workspaceId },
            orderBy: { name: 'asc' },
        });
    }

    async restoreUserProducts(workspaceId: string) {
        return this.prisma.userProduct.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'asc' },
        });
    }

    async syncUserProducts(workspaceId: string, products: any[], staffId?: string) {
        const results = [];
        for (const p of products) {
            const oldProduct = await this.prisma.userProduct.findUnique({
                where: { id: p.id },
                select: { stock: true, updatedAt: true },
            });

            // Version guard: if this device's copy is older than what's
            // already on the server, keep the server's data rather than
            // clobbering a fresher edit from another device. Only applies
            // when the incoming payload actually carries an updatedAt —
            // callers that omit it fall back to the previous overwrite
            // behavior rather than being silently rejected.
            if (oldProduct && p.updatedAt) {
                const incoming = new Date(p.updatedAt);
                if (incoming.getTime() < oldProduct.updatedAt.getTime()) {
                    const current = await this.prisma.userProduct.findUnique({ where: { id: p.id } });
                    results.push(current);
                    continue;
                }
            }

            const sellingPrice = p.sellingPrice ?? p.price;
            const result = await this.prisma.userProduct.upsert({
                where: { id: p.id },
                update: {
                    name: p.name,
                    sellingPrice,
                    sellingPriceKobo: toKobo(sellingPrice),
                    costPrice: p.costPrice ?? null,
                    costPriceKobo: toKobo(p.costPrice),
                    stock: p.stock,
                    imageUrl: p.imageUrl ?? null,
                    barcode: p.barcode ?? null,
                    category: p.category ?? null,
                    updatedAt: new Date(),
                },
                create: {
                    id: p.id,
                    workspaceId,
                    name: p.name,
                    sellingPrice,
                    sellingPriceKobo: toKobo(sellingPrice),
                    costPrice: p.costPrice ?? null,
                    costPriceKobo: toKobo(p.costPrice),
                    stock: p.stock ?? 0,
                    imageUrl: p.imageUrl ?? null,
                    barcode: p.barcode ?? null,
                    category: p.category ?? null,
                },
            });

            // Trigger low stock notifications if stock is <= 5 and was either higher or newly created as low
            if (result.stock <= 5 && (!oldProduct || oldProduct.stock > 5)) {
                const message = `Product "${result.name}" is low on stock (${result.stock} remaining).`;
                const members = await this.prisma.workspaceMember.findMany({
                    where: { workspaceId, role: { in: ['OWNER', 'MANAGER'] }, status: 'ACTIVE' },
                });
                for (const m of members) {
                    if (m.userId) {
                        await this.notificationsService.createNotification(m.userId, 'LOW_STOCK', message, workspaceId);
                    }
                }
                await this.notificationsService.sendToWorkspace(workspaceId, 'Low Stock Alert ⚠️', message, undefined, ['OWNER', 'MANAGER']);
            }

            // Log PRODUCT_ADDED activity if this is a new product (create path)
            if (!oldProduct) {
                this.prisma.staffActivity.create({
                    data: {
                        workspaceId,
                        userId: staffId || workspaceId,
                        action: StaffActivityAction.PRODUCT_ADDED,
                        details: {
                            productName: result.name,
                            sellingPrice: result.sellingPrice,
                        },
                    },
                }).catch(() => {/* non-blocking */});
            }

            // Log STOCK_UPDATED if stock changed on an existing product
            if (oldProduct && oldProduct.stock !== result.stock) {
                this.prisma.staffActivity.create({
                    data: {
                        workspaceId,
                        userId: staffId || workspaceId,
                        action: StaffActivityAction.STOCK_UPDATED,
                        details: {
                            productName: result.name,
                            from: oldProduct.stock,
                            to: result.stock,
                        },
                    },
                }).catch(() => {/* non-blocking */});
            }

            results.push(result);

        }
        return results;
    }

    async update(id: string, workspaceId: string, data: any) {
        const oldProduct = await this.prisma.userProduct.findFirst({
            where: { id, workspaceId },
        });
        if (!oldProduct) throw new ForbiddenException('Product not found in this workspace');

        // This is a partial PATCH — a field that's `undefined` here means
        // "leave it alone" (Prisma skips undefined in update()). The kobo
        // mirror must follow the exact same skip-vs-set rule per field, or a
        // patch that only changes `stock` would wipe sellingPriceKobo/
        // costPriceKobo to null even though sellingPrice/costPrice are
        // correctly left untouched.
        const updateSellingPrice = data.sellingPrice ?? data.price;
        const updated = await this.prisma.userProduct.update({
            where: { id },
            data: {
                name: data.name,
                sellingPrice: updateSellingPrice,
                sellingPriceKobo: updateSellingPrice !== undefined ? toKobo(updateSellingPrice) : undefined,
                costPrice: data.costPrice,
                costPriceKobo: data.costPrice !== undefined ? toKobo(data.costPrice) : undefined,
                stock: data.stock,
                imageUrl: data.imageUrl,
                barcode: data.barcode,
                category: data.category,
            },
        });

        // Trigger low stock notifications
        if (updated.stock <= 5 && (!oldProduct || oldProduct.stock > 5)) {
            const message = `Product "${updated.name}" is low on stock (${updated.stock} remaining).`;
            const members = await this.prisma.workspaceMember.findMany({
                where: { workspaceId, role: { in: ['OWNER', 'MANAGER'] }, status: 'ACTIVE' },
            });
            for (const m of members) {
                if (m.userId) {
                    await this.notificationsService.createNotification(m.userId, 'LOW_STOCK', message, workspaceId);
                }
            }
            await this.notificationsService.sendToWorkspace(workspaceId, 'Low Stock Alert ⚠️', message, undefined, ['OWNER', 'MANAGER']);
        }

        return updated;
    }

    async remove(id: string, workspaceId: string) {
        const product = await this.prisma.userProduct.findFirst({
            where: { id, workspaceId },
        });
        if (!product) throw new ForbiddenException('Product not found in this workspace');

        return this.prisma.userProduct.delete({ where: { id } });
    }
}
