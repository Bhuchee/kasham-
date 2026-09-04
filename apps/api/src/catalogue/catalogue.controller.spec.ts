import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CatalogueController } from './catalogue.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('CatalogueController', () => {
    let controller: CatalogueController;
    let prisma: {
        catalogueProduct: {
            findUnique: jest.Mock;
            create: jest.Mock;
            update: jest.Mock;
        };
    };

    beforeEach(async () => {
        prisma = {
            catalogueProduct: {
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [CatalogueController],
            providers: [
                { provide: PrismaService, useValue: prisma },
                { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
            ],
        }).compile();

        controller = module.get<CatalogueController>(CatalogueController);
    });

    const req = { user: { sub: 'user-1' } };

    describe('contribute validation', () => {
        it('rejects a barcode that is too short', async () => {
            await expect(
                controller.contribute({ barcode: '123', name: 'Test' }, req),
            ).rejects.toThrow(BadRequestException);
            expect(prisma.catalogueProduct.findUnique).not.toHaveBeenCalled();
        });

        it('rejects a missing name', async () => {
            await expect(
                controller.contribute({ barcode: '12345678901', name: '' }, req),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('contribute — new barcode', () => {
        it('creates a new entry tagged with the contributing user', async () => {
            prisma.catalogueProduct.findUnique.mockResolvedValue(null);
            prisma.catalogueProduct.create.mockResolvedValue({
                barcode: '12345678901',
                name: 'New Product',
                brand: null,
                imageUrl: null,
                category: null,
                contributedBy: 'user-1',
            });

            await controller.contribute(
                { barcode: '12345678901', name: 'New Product' },
                req,
            );

            expect(prisma.catalogueProduct.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        contributedBy: 'user-1',
                        lastEditedBy: 'user-1',
                    }),
                }),
            );
        });
    });

    describe('contribute — existing barcode (no clobbering)', () => {
        it('does not overwrite an existing populated field with a new contribution', async () => {
            prisma.catalogueProduct.findUnique.mockResolvedValue({
                barcode: '12345678901',
                name: 'Correct Name',
                brand: 'Correct Brand',
                imageUrl: 'https://res.cloudinary.com/existing.jpg',
                category: 'Beverages',
            });
            prisma.catalogueProduct.update.mockResolvedValue({
                barcode: '12345678901',
                name: 'Correct Name',
                brand: 'Correct Brand',
                imageUrl: 'https://res.cloudinary.com/existing.jpg',
                category: 'Beverages',
            });

            await controller.contribute(
                {
                    barcode: '12345678901',
                    name: 'Wrong Name Someone Typed',
                    brand: 'Wrong Brand',
                    imageUrl: 'https://evil.example.com/wrong.jpg',
                    category: 'Snacks',
                },
                req,
            );

            expect(prisma.catalogueProduct.update).toHaveBeenCalledWith({
                where: { barcode: '12345678901' },
                data: expect.objectContaining({
                    brand: 'Correct Brand',
                    imageUrl: 'https://res.cloudinary.com/existing.jpg',
                    category: 'Beverages',
                }),
            });
        });

        it('fills in a field that was previously missing', async () => {
            prisma.catalogueProduct.findUnique.mockResolvedValue({
                barcode: '12345678901',
                name: 'Correct Name',
                brand: null,
                imageUrl: null,
                category: null,
            });
            prisma.catalogueProduct.update.mockResolvedValue({});

            await controller.contribute(
                { barcode: '12345678901', name: 'Correct Name', brand: 'New Brand Info' },
                req,
            );

            expect(prisma.catalogueProduct.update).toHaveBeenCalledWith({
                where: { barcode: '12345678901' },
                data: expect.objectContaining({ brand: 'New Brand Info' }),
            });
        });
    });
});
