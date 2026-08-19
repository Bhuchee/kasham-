import React from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    TouchableWithoutFeedback,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { Lock, CheckCircle } from 'lucide-react-native';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { useSubscriptionStore } from '../store/subscriptionStore';

const { width } = Dimensions.get('window');

export type RequiredTier = 'GROWTH' | 'BUSINESS';

interface PaywallModalProps {
    visible: boolean;
    onClose: () => void;
    featureName: string;
    featureDescription: string;
    requiredTier: RequiredTier;
    onUpgrade: () => void;
}

const TIER_CONFIG: Record<RequiredTier, { label: string; color: string; bg: string }> = {
    GROWTH: { label: 'Growth plan', color: '#16A34A', bg: '#D1FAE5' },
    BUSINESS: { label: 'Business plan', color: '#2563EB', bg: '#DBEAFE' },
};

export default function PaywallModal({
    visible,
    onClose,
    featureName,
    featureDescription,
    requiredTier,
    onUpgrade,
}: PaywallModalProps) {
    const config = TIER_CONFIG[requiredTier];

    const handleUpgradePress = async () => {
        onClose(); // Close the paywall modal first
        
        try {
            const result = await RevenueCatUI.presentPaywall();
            if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
                useSubscriptionStore.getState().refreshSubscriptionStatus();
            }
        } catch (e) {
            // Fallback to parent handler if paywall fails
            onUpgrade();
        }
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.card}>
                            {/* Lock icon circle */}
                            <View style={styles.iconCircle}>
                                <Lock size={28} color="#16A34A" />
                            </View>

                            {/* Feature name */}
                            <Text style={styles.featureName}>{featureName}</Text>

                            {/* Feature description */}
                            <Text style={styles.featureDescription}>{featureDescription}</Text>

                            {/* Required tier badge */}
                            <View style={[styles.tierBadge, { backgroundColor: config.bg }]}>
                                <CheckCircle size={14} color={config.color} />
                                <Text style={[styles.tierBadgeText, { color: config.color }]}>
                                    {config.label}
                                </Text>
                            </View>

                            {/* Upgrade button */}
                            <TouchableOpacity
                                style={styles.upgradeButton}
                                onPress={handleUpgradePress}
                                activeOpacity={0.85}
                            >
                                <Text style={styles.upgradeButtonText}>
                                    Upgrade to {requiredTier === 'GROWTH' ? 'Growth' : 'Business'}
                                </Text>
                            </TouchableOpacity>

                            {/* Not now ghost button */}
                            <TouchableOpacity
                                style={styles.notNowButton}
                                onPress={onClose}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.notNowText}>Not now</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: Math.min(width - 48, 360),
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 28,
        alignItems: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 8,
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#F0FDF4',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    featureName: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 8,
    },
    featureDescription: {
        fontSize: 14,
        fontWeight: '500',
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 16,
    },
    tierBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginBottom: 24,
    },
    tierBadgeText: {
        fontSize: 13,
        fontWeight: '700',
    },
    upgradeButton: {
        width: '100%',
        backgroundColor: '#16A34A',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 10,
        shadowColor: '#16A34A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 3,
    },
    upgradeButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    notNowButton: {
        width: '100%',
        paddingVertical: 14,
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    notNowText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#64748B',
    },
});
