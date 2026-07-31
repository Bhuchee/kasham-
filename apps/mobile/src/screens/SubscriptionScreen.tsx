import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
} from 'react-native';
import { Header } from './SellScreen';
import { useAuthStore } from '../store/authStore';
import { CheckCircle, X, ChevronLeft } from 'lucide-react-native';
import AppModal from '../components/AppModal';

// TODO: Replace with RevenueCat purchase flow when integrated

interface Plan {
    name: string;
    tier: 'GROWTH' | 'BUSINESS';
    monthlyPrice: number;
    yearlyPrice: number;
    yearlyTotal: number;
    badge?: string;
    features: string[];
}

const PLANS: Plan[] = [
    {
        name: 'Growth',
        tier: 'GROWTH',
        monthlyPrice: 7500,
        yearlyPrice: 6250,
        yearlyTotal: 75000,
        badge: 'Most popular',
        features: [
            'Unlimited products',
            'Up to 2 staff accounts',
            'Profit & cost tracking',
            'Daily sales trend chart',
            'Shareable debt invoices',
        ],
    },
    {
        name: 'Business',
        tier: 'BUSINESS',
        monthlyPrice: 15000,
        yearlyPrice: 12500,
        yearlyTotal: 150000,
        features: [
            'Everything in Growth',
            'Up to 10 staff accounts',
            'Revenue & profit per staff',
            'Staff activity log',
            'Financial data export (CSV/PDF)',
            'Up to 3 store branches',
        ],
    },
];

function formatNaira(amount: number): string {
    return `₦${amount.toLocaleString('en-NG')}`;
}

export default function SubscriptionScreen({ onBack }: { onBack: () => void }) {
    const { stores, activeStoreOwnerId, activeRole } = useAuthStore();
    const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
    const [selectedPlanTier, setSelectedPlanTier] = useState<'GROWTH' | 'BUSINESS'>('GROWTH');
    const [modal, setModal] = useState<{
        visible: boolean;
        type: 'success' | 'error' | 'warning' | 'info';
        title: string;
        subtitle?: string;
        primaryLabel?: string;
        onPrimary?: () => void;
    } | null>(null);

    // Consistent tier derivation
    const activeStore = stores.find(s => s.ownerId === activeStoreOwnerId);
    const currentTier = activeStore?.tier ?? 'FREE';
    const isOwner = activeRole === 'OWNER';

    const selectedPlan = PLANS.find(p => p.tier === selectedPlanTier)!;
    const selectedPrice = billing === 'yearly' ? selectedPlan.yearlyTotal : selectedPlan.monthlyPrice;
    const priceLabel = billing === 'yearly'
        ? `${formatNaira(selectedPlan.yearlyPrice)}/mo`
        : `${formatNaira(selectedPlan.monthlyPrice)}/mo`;

    const handleUpgrade = () => {
        if (!isOwner) {
            setModal({
                visible: true,
                type: 'error',
                title: 'Permission denied',
                subtitle: 'Only the store owner can upgrade the subscription.',
                primaryLabel: 'OK',
                onPrimary: () => setModal(null),
            });
            return;
        }
        setModal({
            visible: true,
            type: 'info',
            title: 'Coming soon',
            subtitle: 'In-app payments are being set up. Contact us at hello@usechobo.com to upgrade manually.',
            primaryLabel: 'OK',
            onPrimary: () => setModal(null),
        });
        // TODO: Replace with RevenueCat purchase flow when integrated
    };

    const handleRestorePurchases = () => {
        setModal({
            visible: true,
            type: 'info',
            title: 'Coming soon',
            subtitle: 'Purchase restoration will be available once in-app payments are live.',
            primaryLabel: 'OK',
            onPrimary: () => setModal(null),
        });
        // TODO: Replace with RevenueCat restorePurchases() when integrated
    };

    const tierBadgeColor = (tier: string) => {
        if (tier === 'GROWTH') return '#D1FAE5';
        if (tier === 'BUSINESS') return '#DBEAFE';
        return '#F1F5F9';
    };
    const tierTextColor = (tier: string) => {
        if (tier === 'GROWTH') return '#16A34A';
        if (tier === 'BUSINESS') return '#2563EB';
        return '#64748B';
    };

    return (
        <View style={styles.container}>
            <Header title="Upgrade Chobo" subtitle="Choose the plan that fits your business" />

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Current plan badge */}
                <View style={styles.currentPlanRow}>
                    <Text style={styles.currentPlanLabel}>Current plan:</Text>
                    <View style={[styles.tierBadge, { backgroundColor: tierBadgeColor(currentTier) }]}>
                        <Text style={[styles.tierBadgeText, { color: tierTextColor(currentTier) }]}>
                            {currentTier}
                        </Text>
                    </View>
                </View>

                {/* Billing toggle */}
                <View style={styles.toggleContainer}>
                    <TouchableOpacity
                        onPress={() => setBilling('monthly')}
                        style={[styles.toggleButton, billing === 'monthly' && styles.toggleButtonActive]}
                    >
                        <Text style={[styles.toggleText, billing === 'monthly' && styles.toggleTextActive]}>
                            Monthly
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setBilling('yearly')}
                        style={[styles.toggleButton, billing === 'yearly' && styles.toggleButtonActive]}
                    >
                        <Text style={[styles.toggleText, billing === 'yearly' && styles.toggleTextActive]}>
                            Yearly
                        </Text>
                        {billing !== 'yearly' && (
                            <View style={styles.saveBadge}>
                                <Text style={styles.saveBadgeText}>Save 17%</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
                {billing === 'yearly' && (
                    <Text style={styles.yearlyNote}>Billed annually. Save 2 months vs monthly.</Text>
                )}

                {/* Plan cards */}
                {PLANS.map(plan => {
                    const isSelected = selectedPlanTier === plan.tier;
                    const isCurrent = currentTier === plan.tier;
                    const displayPrice = billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

                    return (
                        <TouchableOpacity
                            key={plan.tier}
                            onPress={() => setSelectedPlanTier(plan.tier)}
                            activeOpacity={0.85}
                            style={[
                                styles.planCard,
                                isSelected && styles.planCardSelected,
                                plan.tier === 'GROWTH' && styles.planCardGrowth,
                            ]}
                        >
                            {/* Card header row */}
                            <View style={styles.planCardHeader}>
                                <View style={{ flex: 1 }}>
                                    <View style={styles.planNameRow}>
                                        <Text style={styles.planName}>{plan.name}</Text>
                                        {plan.badge && (
                                            <View style={styles.popularBadge}>
                                                <Text style={styles.popularBadgeText}>{plan.badge}</Text>
                                            </View>
                                        )}
                                        {isCurrent && (
                                            <View style={styles.currentBadge}>
                                                <Text style={styles.currentBadgeText}>Current</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.planPrice}>
                                        {formatNaira(displayPrice)}
                                        <Text style={styles.planPricePer}>/mo</Text>
                                    </Text>
                                    {billing === 'yearly' && (
                                        <Text style={styles.billedYearly}>
                                            Billed as {formatNaira(plan.yearlyTotal)}/year
                                        </Text>
                                    )}
                                </View>
                                <View style={[
                                    styles.selectCircle,
                                    isSelected && styles.selectCircleActive,
                                ]}>
                                    {isSelected && <View style={styles.selectCircleDot} />}
                                </View>
                            </View>

                            {/* Features */}
                            <View style={styles.featuresContainer}>
                                {plan.features.map((feat, idx) => (
                                    <View key={idx} style={styles.featureRow}>
                                        <CheckCircle size={16} color="#16A34A" />
                                        <Text style={styles.featureText}>{feat}</Text>
                                    </View>
                                ))}
                            </View>
                        </TouchableOpacity>
                    );
                })}

                {/* CTA button */}
                <TouchableOpacity
                    style={[styles.upgradeButton, currentTier === selectedPlanTier && styles.upgradeButtonDisabled]}
                    onPress={handleUpgrade}
                    activeOpacity={0.85}
                    disabled={currentTier === selectedPlanTier}
                >
                    <Text style={styles.upgradeButtonText}>
                        {currentTier === selectedPlanTier
                            ? `You're on ${selectedPlan.name}`
                            : `Upgrade to ${selectedPlan.name} — ${billing === 'yearly' ? formatNaira(selectedPlan.yearlyTotal) + '/yr' : formatNaira(selectedPlan.monthlyPrice) + '/mo'}`
                        }
                    </Text>
                </TouchableOpacity>

                {/* Restore purchases */}
                <TouchableOpacity onPress={handleRestorePurchases} style={styles.restoreButton}>
                    <Text style={styles.restoreText}>Restore purchases</Text>
                </TouchableOpacity>

            </ScrollView>

            <AppModal
                visible={modal?.visible ?? false}
                type={modal?.type ?? 'info'}
                title={modal?.title ?? ''}
                subtitle={modal?.subtitle}
                primaryLabel={modal?.primaryLabel ?? 'OK'}
                onPrimary={() => { modal?.onPrimary?.(); setModal(null); }}
                onDismiss={() => setModal(null)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    scroll: { flex: 1 },
    scrollContent: { padding: 24, paddingBottom: 60 },

    currentPlanRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 20,
    },
    currentPlanLabel: { fontSize: 14, fontWeight: '600', color: '#64748B' },
    tierBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
    },
    tierBadgeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 14,
        padding: 4,
        marginBottom: 8,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
    },
    toggleButtonActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
    toggleText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
    toggleTextActive: { color: '#0F172A', fontWeight: '700' },
    saveBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    saveBadgeText: { fontSize: 10, fontWeight: '700', color: '#16A34A' },
    yearlyNote: { fontSize: 12, color: '#64748B', textAlign: 'center', marginBottom: 16 },

    planCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#E2E8F0',
    },
    planCardSelected: {
        borderColor: '#16A34A',
        shadowColor: '#16A34A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 4,
    },
    planCardGrowth: {},

    planCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
    planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
    planName: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
    popularBadge: { backgroundColor: '#16A34A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    popularBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
    currentBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    currentBadgeText: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
    planPrice: { fontSize: 28, fontWeight: '800', color: '#0F172A' },
    planPricePer: { fontSize: 14, fontWeight: '500', color: '#64748B' },
    billedYearly: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

    selectCircle: {
        width: 24, height: 24, borderRadius: 12,
        borderWidth: 2, borderColor: '#CBD5E1',
        alignItems: 'center', justifyContent: 'center',
        marginTop: 4,
    },
    selectCircleActive: { borderColor: '#16A34A' },
    selectCircleDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#16A34A' },

    featuresContainer: { gap: 10 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    featureText: { fontSize: 14, color: '#374151', fontWeight: '500', flex: 1 },

    upgradeButton: {
        backgroundColor: '#16A34A',
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#16A34A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
    },
    upgradeButtonDisabled: { backgroundColor: '#94A3B8', shadowOpacity: 0 },
    upgradeButtonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

    restoreButton: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
    restoreText: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
});
