import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList } from 'react-native';
import { AlertTriangle, XCircle, Clock, TrendingUp, BellOff, X } from 'lucide-react-native';
import { getNotifications, markAllNotificationsRead, markNotificationRead, getUnpaidDebtsOlderThan, createNotification, notificationExistsForRelated, getDailyStats } from '../db';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { formatCurrency } from '../utils/format';
import { useCurrency } from '../hooks/useCurrency';

interface NotificationsSheetProps {
    visible: boolean;
    onClose: () => void;
}

export default function NotificationsSheet({ visible, onClose }: NotificationsSheetProps) {
    const [notifications, setNotifications] = useState<any[]>([]);
    const { userId, activeStoreOwnerId } = useAuthStore();
    const { symbol: currencySymbol, formatAmount } = useCurrency();
    const insets = useSafeAreaInsets();

    const generateDynamicNotifications = async () => {
        if (!userId) return;
        const workspaceId = activeStoreOwnerId || userId;

        // 1. Debt Reminders (older than 3 days)
        const oldDebts = await getUnpaidDebtsOlderThan(workspaceId, userId, 3);
        for (const debt of oldDebts) {
            const exists = await notificationExistsForRelated(debt.id, 'debt_reminder');
            if (!exists) {
                await createNotification({
                    id: uuidv4(),
                    type: 'debt_reminder',
                    title: `Payment Reminder: ${debt.customer_name}`,
                    description: `${debt.customer_name} has an unpaid balance of ${formatAmount(debt.amount_owed)} from over 3 days ago.`,
                    relatedId: debt.id,
                    userId,
                    workspaceId,
                    targetRoles: ['OWNER', 'MANAGER'], // Section 6C — debt reminders for owners/managers only
                });
            }
        }

        // 2. Daily Summary
        const todayDateStr = new Date().toDateString();
        const exists = await notificationExistsForRelated(todayDateStr, 'daily_summary');
        if (!exists) {
            const stats = await getDailyStats(workspaceId, userId, 'today');
            if (stats.count > 0) {
                await createNotification({
                    id: uuidv4(),
                    type: 'daily_summary',
                    title: `Daily Summary`,
                    description: `You made ${stats.count} sales today totaling ${formatAmount(stats.revenue)}.`,
                    relatedId: todayDateStr,
                    userId,
                    workspaceId,
                    // Section 6C — daily summary visible to all roles
                });
            }
        }
    };

    const loadNotifications = useCallback(async () => {
        if (!visible || !userId) return;
        await generateDynamicNotifications();
        const data = await getNotifications(activeStoreOwnerId || userId, userId);
        setNotifications(data);
    }, [visible, userId, activeStoreOwnerId]);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    const handleMarkAllRead = async () => {
        if (!userId) return;
        await markAllNotificationsRead(activeStoreOwnerId || userId, userId);
        await loadNotifications();
    };

    const handleNotificationPress = async (id: string) => {
        await markNotificationRead(id);
        await loadNotifications();
    };

    const getIconInfo = (type: string) => {
        switch (type) {
            case 'low_stock': return { Icon: AlertTriangle, color: '#FACC15' };
            case 'out_of_stock': return { Icon: XCircle, color: '#EF4444' };
            case 'debt_reminder': return { Icon: Clock, color: '#2563EB' };
            case 'daily_summary': return { Icon: TrendingUp, color: '#16A34A' };
            default: return { Icon: BellOff, color: '#64748B' };
        }
    };

    const formatTimeAgo = (ts: number) => {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days === 1) return 'Yesterday';
        return `${days}d ago`;
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View className="flex-1 justify-end bg-black/40">
                <View 
                    className="bg-white rounded-t-3xl h-[80%]" 
                    style={{ paddingBottom: insets.bottom || 24 }}
                >
                    {/* Header */}
                    <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
                        <Text className="text-xl font-bold text-textPrimary">Notifications</Text>
                        <View className="flex-row items-center gap-4">
                            {notifications.some(n => n.is_read === 0) && (
                                <TouchableOpacity onPress={handleMarkAllRead}>
                                    <Text className="text-primary font-bold text-sm">Mark all read</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={onClose} className="p-2 -mr-2 bg-lightBackground rounded-full">
                                <X size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* List */}
                    <FlatList
                        data={notifications}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ flexGrow: 1 }}
                        ListEmptyComponent={
                            <View className="flex-1 items-center justify-center p-6 opacity-50">
                                <BellOff size={40} color="#64748B" />
                                <Text className="text-textSecondary mt-4 font-bold">No notifications yet</Text>
                            </View>
                        }
                        renderItem={({ item }) => {
                            const { Icon, color } = getIconInfo(item.type);
                            const unread = item.is_read === 0;

                            return (
                                <TouchableOpacity 
                                    onPress={() => handleNotificationPress(item.id)}
                                    className={`px-6 py-4 flex-row items-start border-b border-border/50 ${unread ? 'bg-lightBackground' : 'bg-white'}`}
                                >
                                    <View className="w-10 h-10 rounded-full items-center justify-center mt-1" style={{ backgroundColor: `${color}15` }}>
                                        <Icon size={20} color={color} />
                                    </View>
                                    <View className="flex-1 ml-4">
                                        <View className="flex-row justify-between items-start mb-1">
                                            <Text className={`font-bold text-sm flex-1 mr-2 ${unread ? 'text-textPrimary' : 'text-textSecondary'}`}>
                                                {item.title}
                                            </Text>
                                            <Text className="text-[10px] text-textSecondary font-bold mt-0.5">
                                                {formatTimeAgo(item.created_at)}
                                            </Text>
                                        </View>
                                        {item.description && (
                                            <Text className="text-xs text-textSecondary leading-4">
                                                {item.description}
                                            </Text>
                                        )}
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </View>
        </Modal>
    );
}
