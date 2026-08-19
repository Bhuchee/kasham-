import { create } from 'zustand';
import { CustomerInfo } from 'react-native-purchases';
import {
  getCustomerInfo,
  deriveTierFromEntitlements,
  ENTITLEMENTS,
  checkEntitlement
} from '../services/revenueCatService';

interface SubscriptionState {
  // State
  isGrowthActive: boolean;
  isBusinessActive: boolean;
  currentTier: 'FREE' | 'GROWTH' | 'BUSINESS';
  customerInfo: CustomerInfo | null;
  isLoading: boolean;

  // Actions
  refreshSubscriptionStatus: () => Promise<void>;
  setCustomerInfo: (info: CustomerInfo) => void;
  reset: () => void;
}

const initialState = {
  isGrowthActive: false,
  isBusinessActive: false,
  currentTier: 'FREE' as const,
  customerInfo: null,
  isLoading: false,
};

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  ...initialState,

  refreshSubscriptionStatus: async () => {
    set({ isLoading: true });
    try {
      const info = await getCustomerInfo();
      if (info) {
        const isGrowthActive = checkEntitlement(info, ENTITLEMENTS.GROWTH);
        const isBusinessActive = checkEntitlement(info, ENTITLEMENTS.BUSINESS);
        const currentTier = deriveTierFromEntitlements(info);

        set({
          isGrowthActive,
          isBusinessActive,
          currentTier,
          customerInfo: info,
        });
      }
    } catch (error) {
      console.error('Error refreshing subscription status:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  setCustomerInfo: (info: CustomerInfo) => {
    const isGrowthActive = checkEntitlement(info, ENTITLEMENTS.GROWTH);
    const isBusinessActive = checkEntitlement(info, ENTITLEMENTS.BUSINESS);
    const currentTier = deriveTierFromEntitlements(info);

    set({
      isGrowthActive,
      isBusinessActive,
      currentTier,
      customerInfo: info,
    });
  },

  reset: () => {
    set({ ...initialState });
  }
}));
