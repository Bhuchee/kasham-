import './global.css';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Keyboard, Modal, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { initDatabase, getProducts, createProduct } from './src/db';
import SellScreen from './src/screens/SellScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import TransactionScreen from './src/screens/TransactionScreen';
import OverviewScreen from './src/screens/OverviewScreen';
import MoreScreen from './src/screens/MoreScreen';
import LoginScreen from './src/screens/LoginScreen';
import SubscriptionScreen from './src/screens/SubscriptionScreen';
import { useAuthStore, StoreAccess } from './src/store/authStore';
import { useSyncStore } from './src/store/syncStore';
import { useCurrencyStore } from './src/hooks/useCurrency';
import { pushSalesToBackend, buildHeaders } from './src/services/syncService';
import { API_URL } from './src/config';
import { ShoppingCart, Package, Wallet, BarChart2, Menu } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import HandleInviteScreen from './src/screens/HandleInviteScreen';
import AppModal from './src/components/AppModal';

// Keep splash screen visible until database and auth are initialized
SplashScreen.preventAutoHideAsync().catch(() => {});

const TABS = [
  { key: 'sell',        label: 'Sell',        Icon: ShoppingCart, roles: ['OWNER', 'MANAGER', 'CASHIER'] },
  { key: 'inventory',   label: 'Stock',       Icon: Package,      roles: ['OWNER', 'MANAGER', 'STAFF'] },
  { key: 'transaction', label: 'Transaction', Icon: Wallet,       roles: ['OWNER', 'MANAGER'] },
  { key: 'overview',    label: 'Overview',    Icon: BarChart2,    roles: ['OWNER', 'MANAGER'] },
  { key: 'more',        label: 'More',        Icon: Menu,         roles: ['OWNER', 'MANAGER', 'CASHIER', 'STAFF'] },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState('sell');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const [initialBarcode, setInitialBarcode] = useState<string | null>(null);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    subtitle?: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
  });

  const { token, userId, activeStoreOwnerId, isReady: authReady, restoreToken, showSubscriptionModal, setShowSubscriptionModal, activeRole } = useAuthStore();
  const { setIsOnline, isOnline } = useSyncStore();
  const insets = useSafeAreaInsets();

  const visibleTabs = TABS.filter(tab => tab.roles.includes(activeRole ?? 'OWNER'));

  useEffect(() => {
    const isActiveTabVisible = visibleTabs.some(t => t.key === activeTab);
    if (!isActiveTabVisible && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [activeRole]);

  // ── Push Notifications setup ───────────────────────────────────────────────
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'debt_reminder') {
        setActiveTab('transaction');
      } else if (data?.type === 'out_of_stock' || data?.type === 'low_stock') {
        setActiveTab('inventory');
      } else if (data?.type === 'onboarding_nudge') {
        setActiveTab('sell');
      }
    });

    return () => {
      responseListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!token || !userId) return;

    const registerPushToken = async () => {
      try {
        if (!Device.isDevice) return;

        const existingStatus = await Notifications.getPermissionsAsync();
        let isGranted = (existingStatus as any).status === 'granted' || (existingStatus as any).granted;

        if (!isGranted) {
          const reqStatus = await Notifications.requestPermissionsAsync();
          isGranted = (reqStatus as any).status === 'granted' || (reqStatus as any).granted;
        }

        if (!isGranted) {
          console.log('[Push] Permission not granted — skipping token registration');
          return;
        }

        const pushToken = await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        });
        const expo_push_token = pushToken.data;

        await fetch(`${API_URL}/auth/push-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ expo_push_token }),
        });
        console.log('[Push] Token registered:', expo_push_token);
      } catch (e) {
        console.warn('[Push] Token registration failed:', e);
      }
    };

    registerPushToken();
  }, [token, userId]);

  // Background workspace refresh — runs after token restore, non-blocking
  const refreshWorkspaces = async () => {
    const { token, userId, activeStoreOwnerId, setStores, setActiveWorkspace } = useAuthStore.getState();
    if (!token || !userId) return;
    try {
      const response = await fetch(`${API_URL}/workspaces/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();

      const mapped: StoreAccess[] = (data || []).map((w: any) => ({
        ownerId: w.workspaceId,
        shopName: w.name,
        role: w.role,
        status: w.status,
        tier: w.tier,
      }));

      setStores(mapped);

      const stillActive = mapped.find(w => w.ownerId === activeStoreOwnerId);
      if (!stillActive && mapped.length > 0) {
        await setActiveWorkspace(mapped[0]);
      }
    } catch {
      // Non-blocking — use cached data
    }
  };

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    const minWait = new Promise(resolve => setTimeout(resolve, 2000));
    const initTask = initDatabase()
      .then(() => useCurrencyStore.getState().initCurrency())
      .then(() => restoreToken());

    Promise.all([initTask, minWait])
      .then(async () => {
        setReady(true);
        refreshWorkspaces();
      })
      .catch(async (e) => {
        console.error(e);
      });
  }, []);

  // ── Deep Link Handler ────────────────────────────────────────────────────────
  const handleDeepLink = (url: string | null) => {
    if (!url) return;
    try {
      const cleanUrl = url.replace('chobo:///', 'chobo://');
      const parsed = new URL(cleanUrl);
      
      if (parsed.hostname === 'invite') {
        const token = parsed.searchParams.get('token');
        if (token) setInviteToken(token);
      } else if (parsed.hostname === 'verify') {
        const token = parsed.searchParams.get('token');
        if (token) setVerifyToken(token);
      } else if (parsed.hostname === 'reset-password') {
        const token = parsed.searchParams.get('token');
        if (token) setResetToken(token);
      }
    } catch (err) {
      if (url.includes('verify?token=')) {
        const token = url.split('token=')[1];
        if (token) setVerifyToken(token);
      } else if (url.includes('reset-password?token=')) {
        const token = url.split('token=')[1];
        if (token) setResetToken(token);
      } else if (url.includes('invite?token=')) {
        const token = url.split('token=')[1];
        if (token) setInviteToken(token);
      }
    }
  };

  useEffect(() => {
    Linking.getInitialURL().then(handleDeepLink).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => subscription.remove();
  }, []);

  // Trigger email verification from deep link
  useEffect(() => {
    if (!verifyToken) return;
    const verify = async () => {
      try {
        const res = await fetch(`${API_URL}/auth/verify-email?token=${verifyToken}`);
        const data = await res.json();
        if (res.ok) {
          setModalConfig({
            visible: true,
            type: 'success',
            title: 'Email Verified',
            subtitle: data.message || 'Your email has been verified successfully. You can now log in.',
          });
        } else {
          setModalConfig({
            visible: true,
            type: 'error',
            title: 'Verification Failed',
            subtitle: data.message || 'The verification link is invalid or expired.',
          });
        }
      } catch (e) {
        setModalConfig({
          visible: true,
          type: 'error',
          title: 'Connection Error',
          subtitle: 'Could not connect to verification server.',
        });
      } finally {
        setVerifyToken(null);
      }
    };
    verify();
  }, [verifyToken]);

  useEffect(() => {
    if (token) {
      setActiveTab('sell');
    }
  }, [token]);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    return () => unsubscribe();
  }, [setIsOnline]);

  useEffect(() => {
    if (isOnline && token && userId) {
      const restoreIfNeeded = async () => {
        try {
          const localProducts = await getProducts(userId);
          if (localProducts.length === 0) {
            console.log('[Restore] Local DB empty, attempting restore...');
            const response = await fetch(`${API_URL}/user-products/restore`, {
              headers: buildHeaders(token, activeStoreOwnerId),
            });

            if (response.ok) {
              const backendProducts = await response.json();
              if (backendProducts.length > 0) {
                for (const p of backendProducts) {
                  await createProduct(
                    p.id,
                    p.name,
                    p.sellingPrice,
                    p.stock,
                    p.barcode ?? null,
                    p.imageUrl ?? null,
                    userId,
                    p.costPrice ?? null
                  );
                }
                console.log(`[Restore] Restored ${backendProducts.length} products`);
              }
            }
          }
        } catch (e) {
          console.warn('[Restore] Product restore failed:', e);
        }
      };

      restoreIfNeeded();
      pushSalesToBackend();
      const syncInterval = setInterval(pushSalesToBackend, 60000);
      return () => clearInterval(syncInterval);
    }
  }, [isOnline, token, userId]);

  const navigateToStock = (barcode: string) => {
    setInitialBarcode(barcode);
    setActiveTab('inventory');
  };
  const clearInitialBarcode = () => setInitialBarcode(null);

  if (!ready || !authReady) {
    return null;
  }

  if (!token) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" />
        <LoginScreen resetToken={resetToken} onClearResetToken={() => setResetToken(null)} />
        <AppModal
          visible={modalConfig.visible}
          type={modalConfig.type}
          title={modalConfig.title}
          subtitle={modalConfig.subtitle}
          onDismiss={() => setModalConfig(prev => ({ ...prev, visible: false }))}
        />
      </View>
    );
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'sell':        return <SellScreen onNavigateToStock={navigateToStock} onNavigateToOverview={() => setActiveTab('overview')} />;
      case 'inventory':   return <InventoryScreen initialBarcode={initialBarcode} onClearBarcode={clearInitialBarcode} />;
      case 'transaction': return <TransactionScreen />;
      case 'overview':    return <OverviewScreen onNavigateToSell={() => setActiveTab('sell')} />;
      case 'more':        return <MoreScreen />;
      default:            return <SellScreen onNavigateToStock={navigateToStock} />;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {renderScreen()}

      {/* Bottom Tab Bar */}
      {!isKeyboardVisible && (
        <View style={[styles.tabBar, { paddingBottom: insets.bottom + 8 }]}>
          {visibleTabs.map(tab => {
            const active = activeTab === tab.key;
            const IconComponent = tab.Icon;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.tab}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <IconComponent
                  size={24}
                  color={active ? '#16A34A' : '#64748B'}
                  fill={active && tab.key === 'sell' ? '#16A34A' : 'none'}
                  style={{ marginBottom: 4 }}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <Modal
        visible={showSubscriptionModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSubscriptionModal(false)}
      >
        <SubscriptionScreen onBack={() => setShowSubscriptionModal(false)} />
      </Modal>

      {/* ── Invite Deep Link Modal ── */}
      <Modal
        visible={!!inviteToken}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInviteToken(null)}
      >
        {inviteToken ? (
          <HandleInviteScreen
            inviteToken={inviteToken}
            onClose={() => setInviteToken(null)}
            onLoginRequired={() => {
              setInviteToken(null);
            }}
            onRegisterRequired={() => {
              setInviteToken(null);
            }}
          />
        ) : null}
      </Modal>

      <AppModal
        visible={modalConfig.visible}
        type={modalConfig.type}
        title={modalConfig.title}
        subtitle={modalConfig.subtitle}
        onDismiss={() => setModalConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  tab:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  tabLabel:      { fontSize: 10, color: '#64748B', fontWeight: '400' },
  tabLabelActive:{ color: '#16A34A', fontWeight: '600' },
});
