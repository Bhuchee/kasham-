import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrencyByCountry, DEFAULT_CURRENCY } from '../config/currencies';
import { formatCurrency } from '../utils/format';

const COUNTRY_CODE_KEY = 'countryCode';

interface CurrencyState {
    currency: ReturnType<typeof getCurrencyByCountry>;
    countryCode: string;
    setCountryCode: (code: string) => Promise<void>;
    initCurrency: () => Promise<void>;
}

export const useCurrencyStore = create<CurrencyState>((set) => ({
    currency: DEFAULT_CURRENCY,
    countryCode: 'NG',
    setCountryCode: async (code: string) => {
        await AsyncStorage.setItem(COUNTRY_CODE_KEY, code);
        set({ currency: getCurrencyByCountry(code), countryCode: code });
    },
    initCurrency: async () => {
        const code = await AsyncStorage.getItem(COUNTRY_CODE_KEY);
        if (code) {
            set({ currency: getCurrencyByCountry(code), countryCode: code });
        }
    }
}));

/**
 * useCurrency — returns currency config + a formatAmount helper.
 * formatAmount(1500) → 'T1,500' or '₦1,500' etc. based on saved country code.
 */
export function useCurrency() {
    const { currency, countryCode } = useCurrencyStore();

    const formatAmount = (amount: number): string =>
        formatCurrency(amount, currency.symbol);

    return {
        currency,
        symbol: currency.symbol,
        countryCode,
        formatAmount,
    };
}

export async function saveCountryCode(countryCode: string): Promise<void> {
    await useCurrencyStore.getState().setCountryCode(countryCode);
}
