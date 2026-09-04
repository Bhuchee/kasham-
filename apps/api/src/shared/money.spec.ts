import { toKobo, fromKobo } from './money';

describe('money conversion helpers (B5)', () => {
    describe('toKobo', () => {
        it('converts naira to kobo', () => {
            expect(toKobo(100)).toBe(10000);
            expect(toKobo(1)).toBe(100);
            expect(toKobo(0)).toBe(0);
        });

        it('rounds to the nearest kobo rather than truncating or leaving float noise', () => {
            expect(toKobo(19.99)).toBe(1999);
            expect(toKobo(0.1 + 0.2)).toBe(30); // classic float noise (0.30000000000000004) must not leak through
        });

        it('passes through null/undefined rather than coercing to 0', () => {
            expect(toKobo(null)).toBeNull();
            expect(toKobo(undefined)).toBeNull();
        });
    });

    describe('fromKobo', () => {
        it('converts kobo back to naira', () => {
            expect(fromKobo(10000)).toBe(100);
            expect(fromKobo(1999)).toBe(19.99);
        });

        it('passes through null/undefined', () => {
            expect(fromKobo(null)).toBeNull();
            expect(fromKobo(undefined)).toBeNull();
        });
    });

    it('round-trips without drift for typical Naira amounts', () => {
        for (const amount of [0, 1, 19.99, 100, 5000, 8333.33, 100000]) {
            expect(fromKobo(toKobo(amount))).toBeCloseTo(amount, 2);
        }
    });
});
