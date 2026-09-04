import { Test, TestingModule } from '@nestjs/testing';
import { DebtsController } from './debts.controller';

import { DebtsService } from './debts.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

describe('DebtsController', () => {
  let controller: DebtsController;
  let debtsService: { create: jest.Mock; syncDebtPayments: jest.Mock; findAllForWorkspace: jest.Mock };

  beforeEach(async () => {
    debtsService = { create: jest.fn(), syncDebtPayments: jest.fn(), findAllForWorkspace: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DebtsController],
      providers: [
        {
          provide: DebtsService,
          useValue: debtsService,
        },
        {
          provide: JwtService,
          useValue: { verifyAsync: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<DebtsController>(DebtsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create (POST /debts) — staff-debt-sync fix', () => {
    it('passes staffId (from the authenticated JWT, not client input) through to the service', () => {
      const req = { user: { sub: 'cashier-user-id', workspaceId: 'ws-1' } };
      const body = { customerId: 'c1', amountOwed: 100, status: 'PENDING' };

      controller.create(req, body);

      expect(debtsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-1', staffId: 'cashier-user-id' }),
      );
    });
  });

  describe('findAll (GET /debts)', () => {
    it('lists debts for the caller\'s active workspace — this is what makes a staff-created debt visible to the owner on another device', () => {
      const req = { user: { sub: 'owner-id', workspaceId: 'ws-1' } };

      controller.findAll(req);

      expect(debtsService.findAllForWorkspace).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('syncPayments (POST /debts/payments/sync)', () => {
    it('forwards payments, workspaceId, and staff id to the service', () => {
      const req = { user: { sub: 'staff-a', workspaceId: 'ws-1' } };
      const body = { payments: [{ id: 'pay-1', debtId: 'debt-1', amount: 30 }] };

      controller.syncPayments(req, body);

      expect(debtsService.syncDebtPayments).toHaveBeenCalledWith(body.payments, 'ws-1', 'staff-a');
    });

    it('tolerates a missing payments array rather than crashing', () => {
      const req = { user: { sub: 'staff-a', workspaceId: 'ws-1' } };

      controller.syncPayments(req, {} as any);

      expect(debtsService.syncDebtPayments).toHaveBeenCalledWith([], 'ws-1', 'staff-a');
    });
  });
});
