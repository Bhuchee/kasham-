import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logoutUser as rcLogoutUser } from '../services/revenueCatService';

const TOKEN_KEY = 'jwt_token';
const REFRESH_TOKEN_KEY = 'jwt_refresh_token';
const BUSINESS_NAME_KEY = 'businessName';
const USER_ID_KEY = 'userId';
const ACTIVE_STORE_OWNER_KEY = 'activeStoreOwnerId';
const ACTIVE_ROLE_KEY = 'activeRole';
const STORES_KEY = 'userStores';

/** Decode JWT payload without a library (base64url split). */
function decodeJwtPayload(token: string): Record<string, any> | null {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(base64);
        return JSON.parse(json);
    } catch {
        return null;
    }
}

export interface StoreAccess {
    ownerId: string;      // maps from workspaceId returned by the backend
    shopName: string | null;
    role: 'OWNER' | 'MANAGER' | 'STAFF';
    status: string;
    tier?: string;        // FREE | GROWTH | BUSINESS | ENTERPRISE
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    userId: string | null;
    businessName: string | null;
    isReady: boolean;

    // Multi-store state
    stores: StoreAccess[];
    activeStoreOwnerId: string | null; // The workspace ID currently active
    activeRole: 'OWNER' | 'MANAGER' | 'STAFF' | null;

    showSubscriptionModal: boolean;
    setShowSubscriptionModal: (show: boolean) => void;

    login: (
        token: string,
        refreshToken: string,
        userId: string,
        businessName?: string | null,
        stores?: StoreAccess[],
    ) => Promise<void>;
    logout: () => Promise<void>;
    restoreToken: () => Promise<void>;
    setBusinessName: (name: string) => Promise<void>;
    switchStore: (ownerId: string) => Promise<void>;

    // New actions for workspace sync
    setStores: (stores: StoreAccess[]) => void;
    setActiveWorkspace: (workspace: StoreAccess) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    token: null,
    refreshToken: null,
    userId: null,
    businessName: null,
    isReady: false,
    stores: [],
    activeStoreOwnerId: null,
    activeRole: null,
    showSubscriptionModal: false,

    setShowSubscriptionModal: (show) => set({ showSubscriptionModal: show }),

    login: async (token, refreshToken, userId, businessName, stores = []) => {
        try {
            await SecureStore.setItemAsync(TOKEN_KEY, token);
            await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
            await AsyncStorage.setItem(USER_ID_KEY, userId);
            if (businessName) await AsyncStorage.setItem(BUSINESS_NAME_KEY, businessName);

            // Determine the active store:
            // - Default to the OWNER store, or first store in list.
            const defaultStore = stores.find(s => s.role === 'OWNER') || stores[0] || null;
            const activeStoreOwnerId = defaultStore?.ownerId || userId;
            const activeRole = defaultStore?.role || 'OWNER';

            await AsyncStorage.setItem(ACTIVE_STORE_OWNER_KEY, activeStoreOwnerId);
            await AsyncStorage.setItem(ACTIVE_ROLE_KEY, activeRole);

            // Persist stores[] so workspace switcher survives app restarts
            await AsyncStorage.setItem(STORES_KEY, JSON.stringify(stores));

            set({
                token,
                refreshToken,
                userId,
                businessName: businessName ?? null,
                stores,
                activeStoreOwnerId,
                activeRole,
            });
        } catch (e) {
            console.error('Failed to save auth state', e);
        }
    },

    logout: async () => {
        try {
            // Sign out of RevenueCat to reset customer identity
            await rcLogoutUser();

            await SecureStore.deleteItemAsync(TOKEN_KEY);
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
            await AsyncStorage.multiRemove([
                ACTIVE_STORE_OWNER_KEY,
                ACTIVE_ROLE_KEY,
                STORES_KEY,
                BUSINESS_NAME_KEY,
                USER_ID_KEY,
            ]);
            set({
                token: null,
                refreshToken: null,
                userId: null,
                businessName: null,
                stores: [],
                activeStoreOwnerId: null,
                activeRole: null,
            });
        } catch (e) {
            console.error('Failed to clear auth state', e);
        }
    },

    restoreToken: async () => {
        try {
            const [token, refreshToken, userId, businessName, activeStoreOwnerId, activeRole, storedStores] =
                await Promise.all([
                    SecureStore.getItemAsync(TOKEN_KEY),
                    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
                    AsyncStorage.getItem(USER_ID_KEY),
                    AsyncStorage.getItem(BUSINESS_NAME_KEY),
                    AsyncStorage.getItem(ACTIVE_STORE_OWNER_KEY),
                    AsyncStorage.getItem(ACTIVE_ROLE_KEY),
                    AsyncStorage.getItem(STORES_KEY),  // ← now restored
                ]);

            // Fallback: if userId wasn't persisted separately, decode from token
            let resolvedUserId = userId;
            if (!resolvedUserId && token) {
                const payload = decodeJwtPayload(token);
                resolvedUserId = payload?.sub ?? null;
            }

            // Parse stored stores[]
            let restoredStores: StoreAccess[] = [];
            if (storedStores) {
                try {
                    restoredStores = JSON.parse(storedStores);
                } catch {
                    restoredStores = [];
                }
            }

            set({
                token,
                refreshToken,
                userId: resolvedUserId,
                businessName,
                isReady: true,
                stores: restoredStores,  // ← restored from AsyncStorage
                activeStoreOwnerId: activeStoreOwnerId || resolvedUserId,
                activeRole: (activeRole as 'OWNER' | 'MANAGER' | 'STAFF') || 'OWNER',
            });
        } catch (e) {
            console.error('Failed to restore auth state', e);
            set({
                isReady: true,
                token: null,
                refreshToken: null,
                userId: null,
                businessName: null,
                stores: [],
                activeStoreOwnerId: null,
                activeRole: null,
            });
        }
    },

    setBusinessName: async (name: string) => {
        await AsyncStorage.setItem(BUSINESS_NAME_KEY, name);
        set({ businessName: name });
    },

    /**
     * Switch the active store context.
     * Updates the activeStoreOwnerId and activeRole in memory + AsyncStorage.
     */
    switchStore: async (ownerId: string) => {
        const { stores } = get();
        const target = stores.find(s => s.ownerId === ownerId);
        if (!target) {
            console.warn('Attempted to switch to a store not in the stores list');
            return;
        }
        await AsyncStorage.setItem(ACTIVE_STORE_OWNER_KEY, ownerId);
        await AsyncStorage.setItem(ACTIVE_ROLE_KEY, target.role);
        if (target.shopName) await AsyncStorage.setItem(BUSINESS_NAME_KEY, target.shopName);
        set({
            activeStoreOwnerId: ownerId,
            activeRole: target.role,
            businessName: target.shopName,
        });
    },

    /**
     * Update the stores[] list in memory + AsyncStorage.
     * Called after background workspace refresh from the backend.
     */
    setStores: (stores: StoreAccess[]) => {
        set({ stores });
        AsyncStorage.setItem(STORES_KEY, JSON.stringify(stores)).catch(console.error);
    },

    /**
     * Switch the active workspace using a full StoreAccess object.
     * Updates businessName, tier, role, and activeStoreOwnerId atomically.
     */
    setActiveWorkspace: async (workspace: StoreAccess) => {
        await Promise.all([
            AsyncStorage.setItem(ACTIVE_STORE_OWNER_KEY, workspace.ownerId),
            AsyncStorage.setItem(ACTIVE_ROLE_KEY, workspace.role),
            workspace.shopName
                ? AsyncStorage.setItem(BUSINESS_NAME_KEY, workspace.shopName)
                : Promise.resolve(),
        ]);
        set({
            activeStoreOwnerId: workspace.ownerId,
            activeRole: workspace.role,
            businessName: workspace.shopName,
        });
    },
}));
