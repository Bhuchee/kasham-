import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toKobo } from '../shared/money';

@Injectable()
export class PaymentsService {
    constructor(private prisma: PrismaService) {}

    async create(data: any) {
        if (data.saleId) {
            const sale = await this.prisma.sale.findFirst({
                where: { id: data.saleId, workspaceId: data.workspaceId },
            });
            if (!sale) {
                throw new BadRequestException('Sale does not belong to this workspace');
            }
        }

        return this.prisma.payment.upsert({
            where: { id: data.id },
            update: {
                amount: data.amount,
                amountKobo: toKobo(data.amount),
                senderName: data.senderName,
                matched: data.matched,
                saleId: data.saleId,
            },
            create: {
                id: data.id,
                amount: data.amount,
                amountKobo: toKobo(data.amount),
                senderName: data.senderName,
                matched: data.matched,
                saleId: data.saleId,
            }
        });
    }
}
