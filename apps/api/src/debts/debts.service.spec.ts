import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DebtsService } from './debts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DebtsService', () => {
  let service: DebtsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      customer: { findFirst: jest.fn(), create: jest.fn() },
      sale: { findFirst: jest.fn() },
      debt: { upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      debtPayment: { create: jest.fn(), aggregate: jest.fn() },
      staffActivity: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DebtsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DebtsService>(DebtsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordPayment — the race condition this section fixes', () => {
    it('rejects a debtId that does not belong to the caller workspace', async () => {
      prisma.debt.findFirst.mockResolvedValue(null);

      await expect(
        service.recordPayment('debt-1', 'ws-other', 30, 'pay-1', 'user-a'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.debtPayment.create).not.toHaveBeenCalled();
    });

    it('two payments from two different devices both apply — remaining reflects BOTH, not just the last one', async () => {
      // Simulates the exact scenario from the audit: a $100 debt, staff A
      // pays $30 from device 1, staff B pays $40 from device 2 — before this
      // fix, whichever sync ran last would silently overwrite the other.
      const debt = { id: 'debt-1', originalAmount: 100, amountOwed: 100, status: 'PENDING' };
      prisma.debt.findFirst.mockResolvedValue(debt);
      prisma.debtPayment.create.mockResolvedValue({});

      // First payment: $30 paid, $70 remaining
      prisma.debtPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 30 } });
      prisma.debt.update.mockResolvedValueOnce({ ...debt, amountOwed: 70, status: 'PARTIAL' });
      const afterFirst = await service.recordPayment('debt-1', 'ws-1', 30, 'pay-1', 'staff-a', 'device-1');
      expect(afterFirst.amountOwed).toBe(70);
      expect(afterFirst.status).toBe('PARTIAL');

      // Second payment from a different device: $40 more, aggregate now
      // correctly reflects BOTH payments summed ($70 total paid, $30 left)
      prisma.debtPayment.aggregate.mockResolvedValueOnce({ _sum: { amount: 70 } });
      prisma.debt.update.mockResolvedValueOnce({ ...debt, amountOwed: 30, status: 'PARTIAL' });
      const afterSecond = await service.recordPayment('debt-1', 'ws-1', 40, 'pay-2', 'staff-b', 'device-2');
      expect(afterSecond.amountOwed).toBe(30);

      expect(prisma.debt.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'debt-1' },
        data: { originalAmount: 100, originalAmountKobo: 10000, amountOwed: 30, amountOwedKobo: 3000, status: 'PARTIAL' },
      });
    });

    it('is idempotent — replaying the same paymentId does not double-apply', async () => {
      const debt = { id: 'debt-1', originalAmount: 100, amountOwed: 100, status: 'PENDING' };
      prisma.debt.findFirst.mockResolvedValue(debt);
      const conflict: any = new Error('unique constraint');
      conflict.code = 'P2002';
      prisma.debtPayment.create.mockRejectedValue(conflict);

      const result = await service.recordPayment('debt-1', 'ws-1', 30, 'pay-1', 'staff-a');

      expect(result).toBe(debt);
      expect(prisma.debt.update).not.toHaveBeenCalled();
    });

    it('sets status to PAID once payments cover the full original amount', async () => {
      const debt = { id: 'debt-1', originalAmount: 100, amountOwed: 20, status: 'PARTIAL' };
      prisma.debt.findFirst.mockResolvedValue(debt);
      prisma.debtPayment.create.mockResolvedValue({});
      prisma.debtPayment.aggregate.mockResolvedValue({ _sum: { amount: 100 } });
      prisma.debt.update.mockResolvedValue({ ...debt, amountOwed: 0, status: 'PAID' });

      await service.recordPayment('debt-1', 'ws-1', 20, 'pay-3', 'staff-a');

      expect(prisma.debt.update).toHaveBeenCalledWith({
        where: { id: 'debt-1' },
        data: { originalAmount: 100, originalAmountKobo: 10000, amountOwed: 0, amountOwedKobo: 0, status: 'PAID' },
      });
    });

    it('backfills originalAmount from amountOwed for a legacy debt that predates this fix', async () => {
      const legacyDebt = { id: 'debt-old', originalAmount: null, amountOwed: 50, status: 'PENDING' };
      prisma.debt.findFirst.mockResolvedValue(legacyDebt);
      prisma.debtPayment.create.mockResolvedValue({});
      prisma.debtPayment.aggregate.mockResolvedValue({ _sum: { amount: 20 } });
      prisma.debt.update.mockResolvedValue({});

      await service.recordPayment('debt-old', 'ws-1', 20, 'pay-1', 'staff-a');

      expect(prisma.debt.update).toHaveBeenCalledWith({
        where: { id: 'debt-old' },
        data: { originalAmount: 50, originalAmountKobo: 5000, amountOwed: 30, amountOwedKobo: 3000, status: 'PARTIAL' },
      });
    });
  });

  describe('create — sets originalAmount for new debts', () => {
    it('stamps originalAmount equal to the initial amountOwed on creation', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c1', name: 'Test Customer', workspaceId: 'ws-1' });
      prisma.debt.upsert.mockResolvedValue({});

      await service.create({
        id: 'debt-1',
        customerId: 'c1',
        amountOwed: 100,
        workspaceId: 'ws-1',
        status: 'PENDING',
      });

      expect(prisma.debt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ amountOwed: 100, originalAmount: 100 }),
        }),
      );
    });
  });

  describe('create — workspace scoping and staff attribution (staff-debt-sync fix)', () => {
    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c1', name: 'Test Customer', workspaceId: 'ws-1' });
    });

    it('stamps workspaceId and createdBy on a new debt, regardless of which role created it', async () => {
      prisma.debt.upsert.mockResolvedValue({});

      // Simulates a CASHIER/STAFF-created debt — this is exactly the case
      // that previously never made it into the server at all, because the
      // mobile sync query scoped by a mismatched local field before this
      // even reached the API. This test verifies the server side: once a
      // debt does arrive, it must be correctly workspace-scoped and
      // attributed, independent of who created it.
      await service.create({
        id: 'debt-1',
        customerId: 'c1',
        amountOwed: 100,
        workspaceId: 'ws-1',
        staffId: 'cashier-user-id',
        status: 'PENDING',
      });

      expect(prisma.debt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ workspaceId: 'ws-1', createdBy: 'cashier-user-id' }),
        }),
      );
    });

    it('backfills workspaceId on the update path for a legacy debt (workspaceId was null)', async () => {
      prisma.debt.upsert.mockResolvedValue({});

      await service.create({
        id: 'debt-old',
        customerId: 'c1',
        amountOwed: 50,
        workspaceId: 'ws-1',
        status: 'PARTIAL',
      });

      expect(prisma.debt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ workspaceId: 'ws-1' }),
        }),
      );
    });

    it('logs the DEBT_CREATED staff activity when staffId is known', async () => {
      prisma.debt.upsert.mockResolvedValue({});

      await service.create({
        id: 'debt-1',
        customerId: 'c1',
        amountOwed: 100,
        workspaceId: 'ws-1',
        staffId: 'cashier-user-id',
        status: 'PENDING',
      });

      expect(prisma.staffActivity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'cashier-user-id', workspaceId: 'ws-1' }),
        }),
      );
    });

    it('does NOT attempt the staff activity log when staffId is missing — regression guard for the FK-violation bug', async () => {
      // Before this fix, a missing staffId fell back to using workspaceId as
      // the activity log's userId — StaffActivity.userId is a required FK to
      // User, so workspaceId (not a User id) always violated it, silently
      // swallowed by .catch(). This asserts the call is skipped entirely
      // instead of made-and-silently-failing.
      prisma.debt.upsert.mockResolvedValue({});

      await service.create({
        id: 'debt-1',
        customerId: 'c1',
        amountOwed: 100,
        workspaceId: 'ws-1',
        status: 'PENDING',
      });

      expect(prisma.staffActivity.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllForWorkspace', () => {
    it('lists debts scoped to the workspace, most recent first', async () => {
      prisma.debt = { ...prisma.debt, findMany: jest.fn().mockResolvedValue([{ id: 'debt-1' }]) };

      const result = await service.findAllForWorkspace('ws-1');

      expect(prisma.debt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual([{ id: 'debt-1' }]);
    });
  });

  describe('create — auto-creates a missing customer (Phase 7)', () => {
    it('creates the customer from customerName/customerPhone when it does not exist yet on the backend', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({ id: 'c-new', name: 'New Customer', phone: '08012345678', workspaceId: 'ws-1' });
      prisma.debt.upsert.mockResolvedValue({});

      await service.create({
        id: 'debt-1',
        customerId: 'c-new',
        customerName: 'New Customer',
        customerPhone: '08012345678',
        amountOwed: 100,
        workspaceId: 'ws-1',
        status: 'PENDING',
      });

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: { id: 'c-new', workspaceId: 'ws-1', name: 'New Customer', phone: '08012345678' },
      });
      expect(prisma.debt.upsert).toHaveBeenCalled();
    });

    it('still rejects when the customer is missing AND no customerName was supplied', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ id: 'debt-1', customerId: 'c-missing', amountOwed: 100, workspaceId: 'ws-1', status: 'PENDING' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.customer.create).not.toHaveBeenCalled();
      expect(prisma.debt.upsert).not.toHaveBeenCalled();
    });

    it('does NOT attempt to auto-create when the customer already exists', async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: 'c1', name: 'Existing Customer', workspaceId: 'ws-1' });
      prisma.debt.upsert.mockResolvedValue({});

      await service.create({
        id: 'debt-1',
        customerId: 'c1',
        customerName: 'Some Different Name', // should be ignored — customer already exists
        amountOwed: 100,
        workspaceId: 'ws-1',
        status: 'PENDING',
      });

      expect(prisma.customer.create).not.toHaveBeenCalled();
    });
  });
});
