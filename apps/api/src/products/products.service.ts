import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StaffActivityAction } from '../workspace/workspace.service';

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
                select: { stock: true },
            });

            const result = await this.prisma.userProduct.upsert({
                where: { id: p.id },
                update: {
                    name: p.name,
                    sellingPrice: p.sellingPrice ?? p.price,
                    costPrice: p.costPrice ?? null,
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
                    sellingPrice: p.sellingPrice ?? p.price,
                    costPrice: p.costPrice ?? null,
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

        const updated = await this.prisma.userProduct.update({
            where: { id },
            data: {
                name: data.name,
                sellingPrice: data.sellingPrice ?? data.price,
                costPrice: data.costPrice,
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
