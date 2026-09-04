import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { useCartStore } from '../store/cartStore';
import { StoreSwitcherSheet } from '../components/StoreSwitcherSheet';
import { Header } from './SellScreen';
import AppModal from '../components/AppModal';
import { 
    User, 
    Settings, 
    HelpCircle, 
    LogOut, 
    Trash2, 
    ChevronRight,
    Store,
    ShieldCheck,
    Wrench,
    ArrowLeftRight,
    DoorOpen,
    Users,
    Zap,
    FileText,
    Shield,
    Receipt
} from 'lucide-react-native';

import PersonalInfoScreen from './PersonalInfoScreen';
import BusinessSettingsScreen from './BusinessSettingsScreen';
import SecurityScreen from './SecurityScreen';
import SystemSettingsScreen from './SystemSettingsScreen';
import HelpSupportScreen from './HelpSupportScreen';
import DeleteAccountScreen from './DeleteAccountScreen';
import DevToolsScreen from './DevToolsScreen';
import StaffManagementScreen from './StaffManagementScreen';
import RevenueCatUI from 'react-native-purchases-ui';
import { useSubscriptionStore } from '../store/subscriptionStore';

const MenuItem = ({ icon: Icon, color, label, onPress, sublabel, danger }: any) => (
    <TouchableOpacity 
        onPress={onPress}
        className="bg-white px-6 py-5 flex-row items-center border-b border-border/50"
    >
        <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${color}15` }}>
            <Icon size={20} color={color} />
        </View>
        <View className="flex-1 ml-4">
            <Text className={`font-bold text-base ${danger ? 'text-red-500' : 'text-textPrimary'}`}>{label}</Text>
            {sublabel && <Text className="text-textSecondary text-[10px] uppercase font-bold mt-0.5">{sublabel}</Text>}
        </View>
        <ChevronRight size={16} color="#CBD5E1" />
    </TouchableOpacity>
);

export default function MoreScreen() {
    const { logout, stores, activeStoreOwnerId, activeRole, userId, businessName, setShowSubscriptionModal } = useAuthStore();
    const { clearCart } = useCartStore();
    const [activeSubScreen, setActiveSubScreen] = useState<string | null>(null);
    const [showStoreSwitcher, setShowStoreSwitcher] = useState(false);
    const [modal, setModal] = useState<{ visible: boolean; type: 'success' | 'error' | 'warning' | 'info'; title: string; subtitle?: string; primaryLabel?: string; onPrimary?: () => void; secondaryLabel?: string; onSecondary?: () => void; autoDismiss?: boolean } | null>(null);

    const { isGrowthActive, isBusinessActive, currentTier: subscriptionTier } = useSubscriptionStore();
    const isSubscribed = isGrowthActive || isBusinessActive;

    const isCashier = activeRole === 'STAFF';
    const isOwner = activeRole === 'OWNER';
    const hasMultipleStores = stores.length > 1;

    // Stores this user works at as staff (not their own)
    const staffStores = stores.filter(s => s.ownerId !== userId);

    const handleSignOut = () => {
        setModal({
            visible: true,
            type: 'warning',
            title: 'Sign Out',
            subtitle: 'Are you sure you want to sign out?',
            primaryLabel: 'Sign Out',
            onPrimary: async () => {
                clearCart();
                await logout();
            },
            secondaryLabel: 'Cancel',
        });
    };

    const handleLeaveStore = (ownerId: string, shopName: string) => {
        setModal({
            visible: true,
            type: 'warning',
            title: 'Leave Store',
            subtitle: `Are you sure you want to leave "${shopName}"? You will lose access unless the owner adds you again.`,
            primaryLabel: 'Leave Store',
            onPrimary: async () => {
                try {
                    const { token } = useAuthStore.getState();
                    const res = await fetch(`${require('../config').API_URL}/auth/staff/leave/${ownerId}`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (res.ok) {
                        setModal({
                            visible: true,
                            type: 'success',
                            title: 'Done',
                            subtitle: 'You have left this store.',
                            autoDismiss: true,
                        });
                    } else {
                        setModal({
                            visible: true,
                            type: 'error',
                            title: 'Error',
                            subtitle: 'Could not leave the store. Try again.',
                        });
                    }
                } catch {
                    setModal({
                        visible: true,
                        type: 'error',
                        title: 'Error',
                        subtitle: 'Could not leave the store. Try again.',
                    });
                }
            },
            secondaryLabel: 'Cancel',
        });
    };

    const handleManageSubscription = async () => {
        if (Platform.OS === 'android') {
            const isGrowth = subscriptionTier === 'GROWTH';
            setModal({
                visible: true,
                type: 'info',
                title: 'Manage Subscription',
                subtitle: `You are currently on the ${subscriptionTier || 'PRO'} plan. Manage your subscription or cancel anytime on Google Play.${isGrowth ? '\n\nNeed more staff accounts or store branches? Upgrade to Business anytime.' : ''}`,
                primaryLabel: 'Manage on Google Play',
                onPrimary: () => {
                    Linking.openURL('https://play.google.com/store/account/subscriptions?package=com.chobo.app').catch(() => {
                        Linking.openURL('https://play.google.com/store/account/subscriptions');
                    });
                },
                secondaryLabel: isGrowth ? 'Upgrade to Business' : 'Close',
                onSecondary: () => {
                    if (isGrowth) {
                        setShowSubscriptionModal(true);
                    }
                },
            });
            return;
        }

        try {
            await RevenueCatUI.presentCustomerCenter();
        } catch (e) {
            console.warn('[RevenueCat] Customer Center failed:', e);
            Linking.openURL('https://apps.apple.com/account/subscriptions').catch(() => {});
        }
    };

    if (activeSubScreen === 'PersonalInfo') return <PersonalInfoScreen onBack={() => setActiveSubScreen(null)} />;
    if (activeSubScreen === 'BusinessSettings') return <BusinessSettingsScreen onBack={() => setActiveSubScreen(null)} />;
    if (activeSubScreen === 'Security') return <SecurityScreen onBack={() => setActiveSubScreen(null)} />;
    if (activeSubScreen === 'SystemSettings') return <SystemSettingsScreen onBack={() => setActiveSubScreen(null)} />;
    if (activeSubScreen === 'HelpSupport') return <HelpSupportScreen onBack={() => setActiveSubScreen(null)} />;
    if (activeSubScreen === 'DeleteAccount') return <DeleteAccountScreen onBack={() => setActiveSubScreen(null)} onConfirm={logout} />;
    if (activeSubScreen === 'DevTools') return <DevToolsScreen onBack={() => setActiveSubScreen(null)} />;
    if (activeSubScreen === 'StaffManagement') return <StaffManagementScreen onBack={() => setActiveSubScreen(null)} />;

    return (
        <View className="flex-1 bg-lightBackground">
            <Header title="More" subtitle="Account & Settings" />
            
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>

                {/* ACTIVE STORE BANNER — shown when acting as staff */}
                {!isOwner && activeStoreOwnerId && (
                    <View className="mx-6 mt-6 bg-primary/10 border border-primary/30 rounded-2xl p-4 flex-row items-center gap-3">
                        <View className="w-8 h-8 rounded-lg bg-primary/20 items-center justify-center">
                            <Store size={16} color="#7C5CFC" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-primary font-black text-xs uppercase tracking-wider">Working At</Text>
                            <Text className="text-textPrimary font-bold text-sm mt-0.5">
                                {stores.find(s => s.ownerId === activeStoreOwnerId)?.shopName || 'Store'}
                            </Text>
                        </View>
                        <View className="bg-primary/20 px-2.5 py-1 rounded-full">
                            <Text className="text-primary text-[10px] font-black uppercase">{activeRole}</Text>
                        </View>
                    </View>
                )}

                {/* Business Profile — hidden for Cashiers */}
                {!isCashier && (
                    <View className="mt-8 mb-4 px-6">
                        <Text className="text-textSecondary text-[10px] font-black uppercase tracking-widest mb-4">Business Profile</Text>
                        <View className="bg-white rounded-3xl overflow-hidden border border-border shadow-sm">
                            <MenuItem 
                                icon={User} 
                                color="#16A34A" 
                                label="Personal Info" 
                                sublabel="Manage your personal details"
                                onPress={() => setActiveSubScreen('PersonalInfo')} 
                            />
                            <MenuItem 
                                icon={Store} 
                                color="#2563EB" 
                                label="Business Settings" 
                                sublabel="Change store name & address"
                                onPress={() => setActiveSubScreen('BusinessSettings')} 
                            />
                            <MenuItem 
                                icon={ShieldCheck} 
                                color="#8B5CF6" 
                                label="Security" 
                                sublabel="Password & authentication"
                                onPress={() => setActiveSubScreen('Security')} 
                            />
                            <MenuItem 
                                icon={Users} 
                                color="#7C5CFC" 
                                label="Staff Management" 
                                sublabel="Add, view & remove your team"
                                onPress={() => setActiveSubScreen('StaffManagement')} 
                            />
                            <MenuItem 
                                icon={Zap} 
                                color="#EAB308" 
                                label="Subscription & Plan" 
                                sublabel="Upgrade workspace to Pro"
                                onPress={() => setShowSubscriptionModal(true)} 
                            />
                            {isSubscribed && (
                                <MenuItem 
                                    icon={Receipt} 
                                    color="#0EA5E9" 
                                    label="Manage Subscription" 
                                    sublabel="Cancel, change plan, or get help"
                                    onPress={handleManageSubscription} 
                                />
                            )}
                        </View>
                    </View>
                )}

                {/* App Preferences */}
                <View className={`mb-4 px-6 ${isCashier ? 'mt-8' : ''}`}>
                    <Text className="text-textSecondary text-[10px] font-black uppercase tracking-widest mb-4">App Preferences</Text>
                    <View className="bg-white rounded-3xl overflow-hidden border border-border shadow-sm">
                        {!isCashier && (
                            <MenuItem 
                                icon={Settings} 
                                color="#64748B" 
                                label="System Settings" 
                                sublabel="Language, theme & currency"
                                onPress={() => setActiveSubScreen('SystemSettings')} 
                            />
                        )}
                        <MenuItem 
                            icon={HelpCircle} 
                            color="#0EA5E9" 
                            label="Help & Support" 
                            sublabel="FAQs and contact us"
                            onPress={() => setActiveSubScreen('HelpSupport')} 
                        />
                        {__DEV__ && !isCashier && (
                            <MenuItem 
                                icon={Wrench} 
                                color="#EAB308" 
                                label="Developer Tools" 
                                sublabel="Reset DB, clear cache"
                                onPress={() => setActiveSubScreen('DevTools')} 
                            />
                        )}
                        <MenuItem 
                            icon={FileText} 
                            color="#8B5CF6" 
                            label="Terms of Service" 
                            sublabel="Read our terms"
                            onPress={() => Linking.openURL('https://usechobo.com/terms')} 
                        />
                        <MenuItem 
                            icon={Shield} 
                            color="#10B981" 
                            label="Privacy Policy" 
                            sublabel="Read our privacy policy"
                            onPress={() => Linking.openURL('https://usechobo.com/privacy')} 
                        />
                    </View>
                </View>

                {/* My Stores — shown when linked to multiple stores */}
                {hasMultipleStores && (
                    <View className="mb-4 px-6">
                        <Text className="text-textSecondary text-[10px] font-black uppercase tracking-widest mb-4">My Stores</Text>
                        <View className="bg-white rounded-3xl overflow-hidden border border-border shadow-sm">
                            <MenuItem 
                                icon={ArrowLeftRight} 
                                color="#7C5CFC" 
                                label="Switch Store" 
                                sublabel={`${stores.length} stores linked to your account`}
                                onPress={() => setShowStoreSwitcher(true)} 
                            />
                            {/* Leave buttons for staff stores */}
                            {staffStores.map(store => (
                                <MenuItem
                                    key={store.ownerId}
                                    icon={DoorOpen}
                                    color="#EF4444"
                                    label={`Leave "${store.shopName || 'Store'}"`}
                                    sublabel={`Exit as ${store.role}`}
                                    onPress={() => handleLeaveStore(store.ownerId, store.shopName || 'this store')}
                                />
                            ))}
                        </View>
                    </View>
                )}

                {/* Safety Zone */}
                <View className="mb-12 px-6">
                    <Text className="text-textSecondary text-[10px] font-black uppercase tracking-widest mb-4">Safety Zone</Text>
                    <View className="bg-white rounded-3xl overflow-hidden border border-border shadow-sm">
                        <MenuItem 
                            icon={LogOut} 
                            color="#0F172A" 
                            label="Sign Out" 
                            onPress={handleSignOut} 
                        />
                        {isOwner && (
                            <MenuItem 
                                icon={Trash2} 
                                color="#EF4444" 
                                label="Delete Account" 
                                onPress={() => setActiveSubScreen('DeleteAccount')} 
                            />
                        )}
                    </View>
                    <Text className="text-center text-textSecondary text-[10px] mt-8 font-bold">
                        Chobo v1.0.0 {process.env.EXPO_PUBLIC_API_URL?.includes('staging') ? '- Staging (Dev)' : ''}
                    </Text>
                </View>
            </ScrollView>

            {/* Store Switcher Sheet */}
            <StoreSwitcherSheet
                visible={showStoreSwitcher}
                onClose={() => setShowStoreSwitcher(false)}
            />
            <AppModal
                visible={modal?.visible ?? false}
                type={modal?.type ?? 'info'}
                title={modal?.title ?? ''}
                subtitle={modal?.subtitle}
                primaryLabel={modal?.primaryLabel}
                onPrimary={() => { modal?.onPrimary?.(); setModal(null); }}
                secondaryLabel={modal?.secondaryLabel}
                onSecondary={() => { modal?.onSecondary?.(); setModal(null); }}
                onDismiss={() => setModal(null)}
                autoDismiss={modal?.autoDismiss}
            />
        </View>
    );
}
