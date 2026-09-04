// Integer minor-unit (kobo) helpers — see B5. Every *Kobo column is kept in
// sync with its existing Float sibling by application code; this is the
// single conversion point so rounding is consistent everywhere.
export function toKobo(naira: number | null | undefined): number | null {
    if (naira === null || naira === undefined || Number.isNaN(naira)) return null;
    return Math.round(naira * 100);
}

export function fromKobo(kobo: number | null | undefined): number | null {
    if (kobo === null || kobo === undefined) return null;
    return kobo / 100;
}
