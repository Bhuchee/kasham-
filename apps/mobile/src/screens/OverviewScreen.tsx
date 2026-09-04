import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Image } from 'react-native';
import { getDailyStats, getTopSoldProducts, getProfitStats, getTopSoldProductsWithProfit } from '../db';
import { Header } from './SellScreen';
import { getInitials } from '../utils/format';
import { useAuthStore } from '../store/authStore';
import { useCurrency } from '../hooks/useCurrency';
import { 
    TrendingUp, 
    TrendingDown, 
    Wallet, 
    Receipt, 
    ArrowUpRight, 
    Package,
    Sparkles,
    Lock,
} from 'lucide-react-native';


type TimeFilter = 'today' | 'week' | 'month';

export default function OverviewScreen({ onNavigateToSell }: { onNavigateToSell?: () => void }) {
    const [filter, setFilter] = useState<TimeFilter>('today');
    const [stats, setStats] = useState<any>(null);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [profitStats, setProfitStats] = useState({ revenue: 0, profit: 0, profitMargin: 0 });
    const [topProductsWithProfit, setTopProductsWithProfit] = useState<any[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const { userId, activeRole, stores, activeStoreOwnerId, setShowSubscriptionModal } = useAuthStore();
    const { formatAmount } = useCurrency();
    const isCashier = activeRole === 'STAFF';

    // Consistent tier derivation pattern
    const activeStore = stores.find(s => s.ownerId === activeStoreOwnerId);
    const tier = activeStore?.tier ?? 'FREE';
    const isGrowthPlus = tier === 'GROWTH' || tier === 'BUSINESS' || tier === 'ENTERPRISE';
    // Section 3C — top products limit: Business+ shows all (up to 10), Growth shows 5
    const topProductsLimit = (tier === 'BUSINESS' || tier === 'ENTERPRISE') ? 10 : 5;

    const loadData = useCallback(async () => {
        if (!userId) return;
        const workspaceId = activeStoreOwnerId || userId;
        setRefreshing(true);
        try {
            const [sData, topP] = await Promise.all([
                getDailyStats(workspaceId, userId, filter),
                getTopSoldProducts(workspaceId, userId, 5)
            ]);
            setStats(sData);
            setTopProducts(topP);

            // Section 3A — fetch profit stats for Growth+ users
            if (isGrowthPlus) { // TODO: Remove before launch
                const [pStats, topWithProfit] = await Promise.all([
                    getProfitStats(workspaceId, userId, filter),
                    getTopSoldProductsWithProfit(workspaceId, userId, topProductsLimit, filter),
                ]);
                setProfitStats(pStats);
                setTopProductsWithProfit(topWithProfit);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setRefreshing(false);
        }
    }, [filter, userId, activeStoreOwnerId, isGrowthPlus, topProductsLimit]);

    useEffect(() => { loadData(); }, [loadData]);

    const getRevenueMix = () => {
        const total = stats?.revenue || 1; // avoid /0
        const cash = stats?.methods?.cash || 0;
        const transfer = stats?.methods?.transfer || 0;
        const pos = stats?.methods?.pos || 0;
        const payLater = stats?.methods?.payLater || 0;
        
        return [
            { label: 'Cash', value: cash, color: '#16A34A', flex: Math.max((cash/total)*100, 2) },
            { label: 'Transfer', value: transfer, color: '#2563EB', flex: Math.max((transfer/total)*100, 2) },
            { label: 'POS', value: pos, color: '#8B5CF6', flex: Math.max((pos/total)*100, 2) },
            { label: 'Credit', value: payLater, color: '#EF4444', flex: Math.max((payLater/total)*100, 2) },
        ].filter(i => i.value > 0);
    };

    // Section 3C — use the profit-enriched list for Growth+, fall back to basic list
    const displayedProducts = isGrowthPlus ? topProductsWithProfit : topProducts;

    return (
        <View className="flex-1 bg-lightBackground">
            <Header title="Business Overview" subtitle="Track your growth" showBell={true} />

            {/* TIME FILTER TABS */}
            <View className="px-6 py-4 bg-white border-b border-border z-10 flex-row gap-2">
                {[
                    { key: 'today', label: 'Today' },
                    { key: 'week', label: '7 Days' },
                    { key: 'month', label: '30 Days' }
                ].map(f => (
                    <TouchableOpacity
                        key={f.key}
                        onPress={() => setFilter(f.key as TimeFilter)}
                        className={`flex-1 py-2.5 rounded-xl border ${filter === f.key ? 'bg-primary border-primary' : 'bg-lightBackground border-border'}`}
                    >
                        <Text className={`text-center font-black text-[10px] uppercase tracking-wider ${filter === f.key ? 'text-white' : 'text-textSecondary'}`}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView 
                className="flex-1" 
                contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} />}
                showsVerticalScrollIndicator={false}
            >
                {(!stats || stats.revenue === 0) ? (
                    <View className="bg-white rounded-[32px] p-6 border border-border shadow-sm items-center my-6">
                        <View className="bg-primaryLight w-16 h-16 rounded-full items-center justify-center mb-6">
                            <Sparkles size={32} color="#16A34A" />
                        </View>
                        <Text className="text-textPrimary font-black text-2xl text-center mb-2">Finally know exactly where your money goes</Text>
                        <Text className="text-textSecondary font-bold text-sm text-center mb-8 leading-6">
                            Record your first sale to see today's earnings, profit margins, and payment breakdown here.
                        </Text>
                        {onNavigateToSell && (
                            <TouchableOpacity 
                                onPress={onNavigateToSell}
                                className="bg-primary w-full py-4 rounded-xl items-center justify-center flex-row shadow-sm active:bg-[#15803D]"
                            >
                                <Text className="text-white font-black text-base mr-2">Record a Sale</Text>
                                <ArrowUpRight size={18} color="white" />
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <>
                        {/* HERO CARD — hidden from Cashiers */}
                        {!isCashier ? (
                        <View className="bg-textPrimary p-6 rounded-[32px] mb-6 shadow-xl relative overflow-hidden">
                            <View className="absolute -top-12 -right-12 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
                            <View className="absolute -bottom-8 -left-8 w-32 h-32 bg-accent/20 rounded-full blur-2xl" />
                            
                            <Text className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-1">Total Revenue</Text>
                            <Text className="text-white font-black text-4xl mb-4">{formatAmount(stats?.revenue || 0)}</Text>
                            
                            <View className="flex-row items-center">
                                <View className="flex-row items-center bg-primary/20 px-2.5 py-1 rounded-full mr-2 border border-primary/30">
                                    <TrendingUp size={12} color="#4ADE80" />
                                    <Text className="text-[#4ADE80] font-black text-[10px] ml-1">+12.5%</Text>
                                </View>
                                <Text className="text-white/60 font-bold text-xs">vs last {filter === 'today' ? 'period' : filter}</Text>
                            </View>
                        </View>
                        ) : (
                        <View className="bg-textPrimary p-6 rounded-[32px] mb-6 shadow-xl">
                            <Text className="text-white/60 text-[10px] font-black uppercase tracking-widest mb-1">Your Sales Today</Text>
                            <Text className="text-white font-black text-4xl mb-2">{stats?.count || 0}</Text>
                            <Text className="text-white/40 text-xs font-semibold">Transactions recorded this period</Text>
                        </View>
                        )}

                        {/* 2x2 METRIC GRID */}
                        <View className="flex-row flex-wrap gap-4 mb-8">
                            <View className="w-[47%] bg-white p-4 rounded-3xl border border-border shadow-sm">
                                <View className="w-8 h-8 rounded-full bg-primaryLight items-center justify-center mb-3">
                                    <Receipt size={16} color="#16A34A" />
                                </View>
                                <Text className="text-textSecondary text-[10px] font-bold uppercase mb-1">Sales Count</Text>
                                <Text className="text-textPrimary font-black text-2xl">{stats?.count || 0}</Text>
                            </View>
                            {/* Debt card hidden from Cashiers */}
                            {!isCashier && (
                            <View className="w-[47%] bg-white p-4 rounded-3xl border border-border shadow-sm">
                                <View className="w-8 h-8 rounded-full bg-dangerLight items-center justify-center mb-3">
                                    <TrendingDown size={16} color="#EF4444" />
                                </View>
                                <Text className="text-textSecondary text-[10px] font-bold uppercase mb-1">Debt Issued</Text>
                                <Text className="text-textPrimary font-black text-2xl">{formatAmount(stats?.debt || 0)}</Text>
                            </View>
                            )}

                            {/* Section 3B — Profit card (Growth+ real, FREE locked teaser) */}
                            {!isCashier && (
                                isGrowthPlus ? ( // TODO: Remove before launch
                                    <View className="w-[47%] bg-white p-4 rounded-3xl border border-border shadow-sm">
                                        <View className="w-8 h-8 rounded-full bg-primaryLight items-center justify-center mb-3">
                                            <TrendingUp size={16} color="#16A34A" />
                                        </View>
                                        <Text className="text-textSecondary text-[10px] font-bold uppercase mb-1">Profit</Text>
                                        <Text className="text-textPrimary font-black text-2xl">{formatAmount(profitStats.profit)}</Text>
                                        <Text className="text-textSecondary text-[10px] font-bold mt-1">{profitStats.profitMargin}% margin</Text>
                                        {profitStats.profit === 0 && (
                                            <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>
                                                Add cost prices to see profit
                                            </Text>
                                        )}
                                    </View>
                                ) : (
                                    /* Locked teaser for FREE users */
                                    <TouchableOpacity
                                        onPress={() => setShowSubscriptionModal(true)}
                                        className="w-[47%] bg-slate-50 p-4 rounded-3xl border border-dashed border-slate-200"
                                    >
                                        <View className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center mb-3">
                                            <Lock size={16} color="#64748B" />
                                        </View>
                                        <Text className="text-slate-500 text-[10px] font-bold uppercase mb-1">Profit</Text>
                                        <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 16, marginTop: 2 }}>
                                            See how much you keep after costs.
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '700', marginTop: 6 }}>
                                            Growth plan
                                        </Text>
                                    </TouchableOpacity>
                                )
                            )}
                        </View>

                        {/* PAYMENT BREAKDOWN */}
                        <View className="mb-8">
                            <Text className="text-textPrimary font-black text-lg mb-4">Payment Mix</Text>
                            
                            {stats?.revenue > 0 ? (
                                <>
                                    <View className="h-4 flex-row rounded-full overflow-hidden mb-4">
                                        {getRevenueMix().map((m, idx) => (
                                            <View key={idx} style={{ flex: m.flex, backgroundColor: m.color, borderRightWidth: idx < getRevenueMix().length-1 ? 2 : 0, borderColor: 'white' }} />
                                        ))}
                                    </View>
                                    <View className="flex-row flex-wrap gap-y-3">
                                        {getRevenueMix().map((m, idx) => (
                                            <View key={idx} className="w-[50%] flex-row items-center">
                                                <View className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: m.color }} />
                                                <Text className="text-textSecondary font-bold text-xs uppercase w-16">{m.label}</Text>
                                                <Text className="text-textPrimary font-black text-xs">{formatAmount(m.value)}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </>
                            ) : (
                                <View className="bg-lightBackground p-4 rounded-2xl items-center border border-border">
                                    <Text className="text-textSecondary font-bold text-xs">No payment data yet.</Text>
                                </View>
                            )}
                        </View>

                        {/* TOP SELLERS */}
                        <View className="mb-8">
                            <Text className="text-textPrimary font-black text-lg mb-4">Top Sellers</Text>
                            {displayedProducts.length === 0 && (
                                <View className="bg-lightBackground p-6 rounded-2xl items-center border border-border">
                                    <Package size={24} color="#64748B" />
                                    <Text className="text-textSecondary font-bold mt-2">No products sold yet.</Text>
                                </View>
                            )}
                            {displayedProducts.map((p, idx) => (
                                <View key={idx} className="bg-white p-4 rounded-2xl mb-2 flex-row items-center border border-border shadow-sm">
                                    <View className="w-10 h-10 rounded-xl bg-primaryLight items-center justify-center overflow-hidden mr-4">
                                        {p.image_uri ? (
                                            <Image source={{ uri: p.image_uri }} className="w-full h-full" />
                                        ) : (
                                            <Text className="text-primaryDark font-black">{getInitials(p.name)}</Text>
                                        )}
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-bold text-sm text-textPrimary" numberOfLines={1}>{p.name}</Text>
                                        <Text className="text-textSecondary text-[10px] font-black uppercase mt-0.5">{p.total_qty} Units Sold</Text>
                                        {/* Section 3C — per-product profit for Growth+ */}
                                        {isGrowthPlus && p.profit != null && ( // TODO: Remove before launch
                                            <Text style={{ fontSize: 11, color: '#16A34A', fontWeight: '700', marginTop: 2 }}>
                                                {formatAmount(p.profit)} profit
                                            </Text>
                                        )}
                                    </View>
                                    <Text className="text-primary font-black text-sm">{formatAmount(p.price * p.total_qty)}</Text>
                                </View>
                            ))}
                        </View>

                    </>
                )}

            </ScrollView>
        </View>
    );
}
