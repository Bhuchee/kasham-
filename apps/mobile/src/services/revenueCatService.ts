import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';

export const ENTITLEMENTS = {
  GROWTH: 'growth',
  BUSINESS: 'business',
} as const;

export const PRODUCT_IDS = {
  GROWTH_MONTHLY: 'chobo_growth_monthly',
  GROWTH_YEARLY: 'chobo_growth_yearly',
  BUSINESS_MONTHLY: 'chobo_business_monthly',
  BUSINESS_YEARLY: 'chobo_business_yearly',
} as const;

export const initializeRevenueCat = (): void => {
  try {
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    let apiKey = '';
    if (Platform.OS === 'android') {
      apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '';
    } else if (Platform.OS === 'ios') {
      // TODO: Add iOS RevenueCat key before iOS release.
      // Set EXPO_PUBLIC_REVENUECAT_IOS_KEY (starts with appl_) in all .env files
      // and in the eas.json env blocks for preview/production profiles.
      apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '';
    }

    if (!apiKey) {
      console.warn(
        `[RevenueCat] API key not configured for platform: ${Platform.OS}. ` +
        `IAP features will be disabled.`,
      );
      return;
    }

    Purchases.configure({ apiKey });
    console.log('[RevenueCat] Initialized successfully');
  } catch (error) {
    console.error('[RevenueCat] Initialization failed', error);
  }
};

export const loginUser = async (userId: string): Promise<CustomerInfo | null> => {
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    console.log(`[RevenueCat] Logged in user ${userId}`);
    return customerInfo;
  } catch (error) {
    console.error(`[RevenueCat] Login failed for user ${userId}`, error);
    return null;
  }
};

export const logoutUser = async (): Promise<void> => {
  try {
    await Purchases.logOut();
    console.log('[RevenueCat] Logged out successfully');
  } catch (error) {
    console.error('[RevenueCat] Logout failed', error);
  }
};

export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to get customer info', error);
    return null;
  }
};

export const checkEntitlement = (
  customerInfo: CustomerInfo,
  entitlementId: string
): boolean => {
  return typeof customerInfo.entitlements.active[entitlementId] !== 'undefined';
};

export const deriveTierFromEntitlements = (
  customerInfo: CustomerInfo
): 'FREE' | 'GROWTH' | 'BUSINESS' => {
  if (checkEntitlement(customerInfo, ENTITLEMENTS.BUSINESS)) {
    return 'BUSINESS';
  }
  if (checkEntitlement(customerInfo, ENTITLEMENTS.GROWTH)) {
    return 'GROWTH';
  }
  return 'FREE';
};

export const getOfferings = async (): Promise<PurchasesOfferings | null> => {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (error) {
    console.error('[RevenueCat] Failed to get offerings', error);
    return null;
  }
};

export const purchasePackage = async (
  pkg: PurchasesPackage
): Promise<CustomerInfo | null> => {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    console.log(`[RevenueCat] Successfully purchased package ${pkg.identifier}`);
    return customerInfo;
  } catch (error: any) {
    if (error.userCancelled) {
      console.log('[RevenueCat] User cancelled purchase');
      return null;
    }
    console.error('[RevenueCat] Purchase failed', error);
    throw error;
  }
};

export const restorePurchases = async (): Promise<CustomerInfo | null> => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    console.log('[RevenueCat] Purchases restored');
    return customerInfo;
  } catch (error) {
    console.error('[RevenueCat] Failed to restore purchases', error);
    return null;
  }
};

export const addCustomerInfoListener = (
  callback: (info: CustomerInfo) => void
) => {
  Purchases.addCustomerInfoUpdateListener(callback);
  return {
    remove: () => {
      Purchases.removeCustomerInfoUpdateListener(callback);
    },
  };
};
