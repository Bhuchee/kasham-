import React, { useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    FlatList,
    Animated,
    Dimensions,
    Platform,
} from 'react-native';
import { useAuthStore, StoreAccess } from '../store/authStore';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.5;

interface Props {
    visible: boolean;
    onClose: () => void;
    onSwitch?: (store: StoreAccess) => void;
}

const ROLE_COLORS: Record<string, string> = {
    OWNER: '#7C5CFC',
    MANAGER: '#10B981',
    STAFF: '#F59E0B',
};

const ROLE_LABELS: Record<string, string> = {
    OWNER: 'Owner',
    MANAGER: 'Manager',
    STAFF: 'Staff',
};

export function StoreSwitcherSheet({ visible, onClose, onSwitch }: Props) {
    const { stores, activeStoreOwnerId, switchStore } = useAuthStore();
    const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // Animate in/out
    React.useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 280,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: SHEET_HEIGHT,
                    duration: 220,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible]);

    const handleSwitch = useCallback(
        async (store: StoreAccess) => {
            if (store.ownerId === activeStoreOwnerId) {
                onClose();
                return;
            }
            await switchStore(store.ownerId);
            onSwitch?.(store);
            onClose();
        },
        [activeStoreOwnerId, switchStore, onSwitch, onClose],
    );

    if (!visible && (slideAnim as any)._value === SHEET_HEIGHT) return null;

    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            {/* Backdrop */}
            <Animated.View
                style={[styles.backdrop, { opacity: fadeAnim }]}
                pointerEvents={visible ? 'auto' : 'none'}
            >
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
            </Animated.View>

            {/* Sheet */}
            <Animated.View
                style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
            >
                {/* Handle */}
                <View style={styles.handleRow}>
                    <View style={styles.handle} />
                </View>

                <Text style={styles.title}>Switch Store</Text>
                <Text style={styles.subtitle}>
                    {stores.length} store{stores.length !== 1 ? 's' : ''} linked to your account
                </Text>

                <FlatList
                    data={stores}
                    keyExtractor={item => item.ownerId}
                    style={styles.list}
                    renderItem={({ item }) => {
                        const isActive = item.ownerId === activeStoreOwnerId;
                        const roleColor = ROLE_COLORS[item.role] || '#888';
                        return (
                            <TouchableOpacity
                                style={[styles.storeCard, isActive && styles.storeCardActive]}
                                onPress={() => handleSwitch(item)}
                                activeOpacity={0.75}
                            >
                                {/* Store avatar */}
                                <View style={[styles.avatar, { backgroundColor: roleColor + '22' }]}>
                                    <Text style={[styles.avatarText, { color: roleColor }]}>
                                        {(item.shopName || 'S').charAt(0).toUpperCase()}
                                    </Text>
                                </View>

                                <View style={styles.storeInfo}>
                                    <Text style={styles.storeName} numberOfLines={1}>
                                        {item.shopName || 'Unnamed Store'}
                                    </Text>
                                    <View style={[styles.rolePill, { backgroundColor: roleColor + '22' }]}>
                                        <Text style={[styles.roleText, { color: roleColor }]}>
                                            {ROLE_LABELS[item.role] || item.role}
                                        </Text>
                                    </View>
                                </View>

                                {isActive && (
                                    <View style={styles.activeDot}>
                                        <Text style={styles.activeDotInner}>✓</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: SHEET_HEIGHT,
        backgroundColor: '#1E293B',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: Platform.OS === 'ios' ? 32 : 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 20,
    },
    handleRow: {
        alignItems: 'center',
        paddingTop: 12,
        paddingBottom: 8,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        paddingHorizontal: 20,
        marginTop: 4,
    },
    subtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.45)',
        paddingHorizontal: 20,
        marginTop: 4,
        marginBottom: 16,
    },
    list: {
        flex: 1,
        paddingHorizontal: 16,
    },
    storeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.05)',
        gap: 12,
    },
    storeCardActive: {
        backgroundColor: 'rgba(124,92,252,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(124,92,252,0.4)',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '700',
    },
    storeInfo: {
        flex: 1,
        gap: 6,
    },
    storeName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    rolePill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    roleText: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    activeDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#7C5CFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    activeDotInner: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    separator: {
        height: 8,
    },
});
