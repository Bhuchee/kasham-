import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, FlatList, TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Share } from 'react-native';
import { getTransactionHistory, getDailyStats, getOutstandingDebts, markDebtPaid, createPaymentLog, getSaleItems, getProducts, updateProductQuantity, recordDebtPayment, getPaymentLogs } from '../db';
import AppModal from '../components/AppModal';
import { Header } from './SellScreen';
import { formatCurrency, formatDate, formatTime } from '../utils/format';
import { 
    Search, 
    Filter, 
    Plus, 
    X, 
    ChevronDown, 
    ChevronUp,
    CheckCircle, 
    Clock, 
    User,
    Phone,
    Banknote,
    Receipt,
    ArrowLeftRight,
    CreditCard,
    Share2
} from 'lucide-react-native';
import { v4 as uuidv4 } from 'uuid';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useCurrency } from '../hooks/useCurrency';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ReceiptView } from '../components/ReceiptView';

export default function TransactionScreen() {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [debts, setDebts] = useState<any[]>([]);
    const [paymentLogs, setPaymentLogs] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'owing'>('all');
    
    // Custom AppModal State
    const [modalConfig, setModalConfig] = useState<{
        visible: boolean;
        type: 'success' | 'error' | 'warning' | 'info';
        title: string;
        subtitle?: string;
        primaryLabel?: string;
        onPrimary?: () => void;
        secondaryLabel?: string;
        onSecondary?: () => void;
    }>({
        visible: false,
        type: 'info',
        title: '',
    });
    
    // Expand/Collapse state mapping saleId -> items
    const [expandedRows, setExpandedRows] = useState<Record<string, any[]>>({});

    // Log Payment Modal State
    const [logPaymentModal, setLogPaymentModal] = useState(false);
    const [logAmount, setLogAmount] = useState('');
    const [logSenderName, setLogSenderName] = useState('');
    const [logSenderPhone, setLogSenderPhone] = useState('');
    const [logMethod, setLogMethod] = useState('TRANSFER');
    const [logNotes, setLogNotes] = useState('');
    const [logLoading, setLogLoading] = useState(false);

    // Date filter state
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all');
    const [showDateDropdown, setShowDateDropdown] = useState(false);

    // Debt Details Modal Sheet State
    const [selectedDebt, setSelectedDebt] = useState<any | null>(null);
    const [selectedDebtItems, setSelectedDebtItems] = useState<any[]>([]);
    const [debtDetailsModal, setDebtDetailsModal] = useState(false);
    
    // Partial payment fields inside debt details modal
    const [showPartialInput, setShowPartialInput] = useState(false);
    const [partialAmount, setPartialAmount] = useState('');
    const [partialLoading, setPartialLoading] = useState(false);

    // Manual Payment Log Stock Deduction State
    const [dbProducts, setDbProducts] = useState<any[]>([]);
    const [deductStock, setDeductStock] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [productQuantity, setProductQuantity] = useState('1');
    const [showProductSelector, setShowProductSelector] = useState(false);

    const { userId, businessName, activeStoreOwnerId } = useAuthStore();
    const { symbol: currencySymbol, formatAmount } = useCurrency();
    const insets = useSafeAreaInsets();

    const receiptRef = React.useRef<View>(null);
    const [sharingTx, setSharingTx] = useState<any>(null);
    const [sharingItems, setSharingItems] = useState<any[]>([]);
    const [isCapturing, setIsCapturing] = useState(false);

    const loadData = useCallback(async () => {
        if (!userId) return;
        const workspaceId = activeStoreOwnerId || userId;
        setLoading(true);
        try {
            const [tRows, dRows, sData, pRows, payLogs] = await Promise.all([
                getTransactionHistory(workspaceId, userId),
                getOutstandingDebts(workspaceId, userId),
                getDailyStats(workspaceId, userId, 'today'),
                getProducts(workspaceId, userId),
                getPaymentLogs(workspaceId, userId)
            ]);
            setTransactions(tRows);
            setDebts(dRows);
            setStats(sData);
            setDbProducts(pRows || []);
            setPaymentLogs(payLogs || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [userId, activeStoreOwnerId]);

    useEffect(() => { loadData(); }, [loadData]);

    const isWithinDateRange = useCallback((timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        
        switch (dateFilter) {
            case 'today': {
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                return timestamp >= startOfToday;
            }
            case 'yesterday': {
                const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
                const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                return timestamp >= startOfYesterday && timestamp < endOfYesterday;
            }
            case '7days': {
                const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
                return timestamp >= sevenDaysAgo;
            }
            case '30days': {
                const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
                return timestamp >= thirtyDaysAgo;
            }
            case 'all':
            default:
                return true;
        }
    }, [dateFilter]);

    const filteredTransactions = React.useMemo(() => {
        let list = transactions.filter(t => isWithinDateRange(t.timestamp));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(t =>
                (t.customer_name || '').toLowerCase().includes(q) ||
                (t.customer_phone || '').includes(searchQuery)
            );
        }
        return list;
    }, [transactions, searchQuery, isWithinDateRange]);

    const filteredPaymentLogs = React.useMemo(() => {
        let list = paymentLogs.filter(p => isWithinDateRange(p.created_at));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p =>
                (p.sender_name || '').toLowerCase().includes(q) ||
                (p.sender_phone || '').includes(searchQuery)
            );
        }
        return list;
    }, [paymentLogs, searchQuery, isWithinDateRange]);

    const mergedHistory = React.useMemo(() => {
        const salesEntries = filteredTransactions.map(t => ({
            ...t,
            _type: 'sale' as const,
            _timestamp: t.timestamp || t.created_at || 0,
        }));

        const paymentEntries = filteredPaymentLogs.map(p => ({
            ...p,
            _type: 'payment_log' as const,
            _timestamp: p.created_at || 0,
        }));

        return [...salesEntries, ...paymentEntries].sort(
            (a, b) => Number(b._timestamp) - Number(a._timestamp)
        );
    }, [filteredTransactions, filteredPaymentLogs]);

    const filteredDebts = React.useMemo(() => {
        let list = debts;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(d =>
                (d.customer_name || '').toLowerCase().includes(q) ||
                (d.customer_phone || '').includes(searchQuery)
            );
        }
        return list;
    }, [debts, searchQuery]);

    const handleSelectDebt = async (debt: any) => {
        setSelectedDebt(debt);
        setSelectedDebtItems([]);
        setPartialAmount('');
        setShowPartialInput(false);
        setDebtDetailsModal(true);
        if (debt.sale_id) {
            try {
                const items = await getSaleItems(debt.sale_id);
                setSelectedDebtItems(items);
            } catch (e) {
                console.error('Failed to load debt items', e);
            }
        }
    };

    const handleDebtPaidInFull = async (debt: any) => {
        setModalConfig({
            visible: true,
            type: 'info',
            title: 'Mark as Paid',
            subtitle: `Has ${debt.customer_name} paid the remaining balance of ${currencySymbol}${formatAmount(debt.amount_owed).replace(currencySymbol, '')} in full?`,
            primaryLabel: 'Yes, Paid',
            secondaryLabel: 'Cancel',
            onSecondary: () => setModalConfig(prev => ({ ...prev, visible: false })),
            onPrimary: async () => {
                setModalConfig(prev => ({ ...prev, visible: false }));
                try {
                    await markDebtPaid(debt.id);
                    await createPaymentLog(
                        uuidv4(),
                        debt.amount_owed,
                        debt.customer_name,
                        debt.customer_phone || null,
                        'CASH',
                        'Debt Paid in Full',
                        `Debt ID: ${debt.id}`,
                        userId || '',
                        activeStoreOwnerId || userId || ''
                    );
                    setDebtDetailsModal(false);
                    await loadData();
                } catch (e) {
                    setModalConfig({
                        visible: true,
                        type: 'error',
                        title: 'Error',
                        subtitle: 'Failed to mark debt as paid.',
                    });
                }
            }
        });
    };

    const handleDebtPaidPartially = async () => {
        if (!partialAmount) {
            setModalConfig({
                visible: true,
                type: 'warning',
                title: 'Required',
                subtitle: 'Please enter the partial payment amount.',
            });
            return;
        }
        const parsedAmount = parseFloat(partialAmount.replace(/,/g, ''));
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            setModalConfig({
                visible: true,
                type: 'warning',
                title: 'Invalid',
                subtitle: 'Please enter a valid amount.',
            });
            return;
        }
        if (parsedAmount > selectedDebt.amount_owed) {
            setModalConfig({
                visible: true,
                type: 'warning',
                title: 'Invalid',
                subtitle: `Amount cannot exceed the total balance owed (${currencySymbol}${formatAmount(selectedDebt.amount_owed).replace(currencySymbol, '')}).`,
            });
            return;
        }
        setPartialLoading(true);
        try {
            const remaining = selectedDebt.amount_owed - parsedAmount;
            await recordDebtPayment(selectedDebt.id, parsedAmount, remaining, userId || '', uuidv4(), activeStoreOwnerId || userId || '');
            await createPaymentLog(
                uuidv4(),
                parsedAmount,
                selectedDebt.customer_name,
                selectedDebt.customer_phone || null,
                'CASH',
                'Partial Debt Payment',
                `Remaining balance: ${currencySymbol}${formatAmount(remaining).replace(currencySymbol, '')} (Debt ID: ${selectedDebt.id})`,
                userId || '',
                activeStoreOwnerId || userId || ''
            );
            setDebtDetailsModal(false);
            setPartialAmount('');
            setShowPartialInput(false);
            await loadData();
            setModalConfig({
                visible: true,
                type: 'success',
                title: 'Success',
                subtitle: 'Partial payment recorded successfully!',
            });
        } catch (e) {
            setModalConfig({
                visible: true,
                type: 'error',
                title: 'Error',
                subtitle: 'Failed to record partial payment.',
            });
        } finally {
            setPartialLoading(false);
        }
    };

    const handleSendReminder = async (debt: any) => {
        const dateStr = formatDate(debt.created_at);
        const message = `Friendly reminder from ${businessName || 'Chobo'}:\n\nHello ${debt.customer_name}, you have an outstanding balance of ${currencySymbol}${formatAmount(debt.amount_owed).replace(currencySymbol, '')} from your purchase on ${dateStr}.\n\nPlease kindly make payments. Thank you!`;
        try {
            await Share.share({ message });
        } catch (error) {
            console.error('Error sharing reminder', error);
            setModalConfig({
                visible: true,
                type: 'error',
                title: 'Error',
                subtitle: 'Could not open share sheet.',
            });
        }
    };

    const handleLogPayment = async () => {
        if (!logAmount) {
            setModalConfig({
                visible: true,
                type: 'warning',
                title: 'Required',
                subtitle: 'Please enter an amount.',
            });
            return;
        }
        const parsedAmount = parseFloat(logAmount.replace(/,/g, ''));
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            setModalConfig({
                visible: true,
                type: 'warning',
                title: 'Invalid',
                subtitle: 'Please enter a valid amount.',
            });
            return;
        }
        setLogLoading(true);
        try {
            if (deductStock && selectedProduct) {
                const qty = parseInt(productQuantity, 10);
                if (isNaN(qty) || qty <= 0) {
                    setModalConfig({
                        visible: true,
                        type: 'warning',
                        title: 'Invalid',
                        subtitle: 'Please enter a valid quantity to deduct.',
                    });
                    setLogLoading(false);
                    return;
                }
                const newStock = selectedProduct.stock - qty;
                await updateProductQuantity(selectedProduct.id, newStock);
            }

            let finalNotes = logNotes;
            if (deductStock && selectedProduct) {
                const qty = parseInt(productQuantity, 10);
                const deductionInfo = `[Stock Deducted: ${selectedProduct.name} x${qty}]`;
                finalNotes = logNotes ? `${logNotes}\n${deductionInfo}` : deductionInfo;
            }

            await createPaymentLog(
                uuidv4(),
                parsedAmount,
                logSenderName || null,
                logSenderPhone || null,
                logMethod,
                deductStock && selectedProduct ? `Sale: ${selectedProduct.name}` : 'Manual Payment Log',
                finalNotes || null,
                userId || '',
                activeStoreOwnerId || userId || ''
            );

            setLogPaymentModal(false);
            setLogAmount('');
            setLogSenderName('');
            setLogSenderPhone('');
            setLogNotes('');
            setDeductStock(false);
            setSelectedProduct(null);
            setProductQuantity('1');
            await loadData();
        } catch (e) {
            setModalConfig({
                visible: true,
                type: 'error',
                title: 'Error',
                subtitle: 'Failed to log payment.',
            });
        } finally {
            setLogLoading(false);
        }
    };

    const toggleRow = async (saleId: string) => {
        if (expandedRows[saleId]) {
            const next = { ...expandedRows };
            delete next[saleId];
            setExpandedRows(next);
        } else {
            const items = await getSaleItems(saleId);
            setExpandedRows({ ...expandedRows, [saleId]: items });
        }
    };

    const getDaysOverdue = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        return days;
    };

    const handleShareReceipt = async (transaction: any) => {
        setIsCapturing(true);
        const items = await getSaleItems(transaction.id);
        setSharingTx(transaction);
        setSharingItems(items);
        
        setTimeout(async () => {
            try {
                if (receiptRef.current) {
                    const uri = await captureRef(receiptRef, {
                        format: 'jpg',
                        quality: 0.8,
                    });
                    
                    const isAvailable = await Sharing.isAvailableAsync();
                    if (isAvailable) {
                        await Sharing.shareAsync(uri, { UTI: 'public.jpeg', mimeType: 'image/jpeg' });
                    } else {
                        setModalConfig({
                            visible: true,
                            type: 'error',
                            title: 'Error',
                            subtitle: 'Sharing is not available on this device',
                        });
                    }
                }
            } catch (error) {
                console.error("View shot error:", error);
                const lines = items.map(i => `${i.product_name} x${i.quantity} — ${currencySymbol}${formatCurrency(i.price * i.quantity, currencySymbol).replace(currencySymbol, '')}`);
                const message = `Receipt from ${businessName || 'Chobo'}\n\n${lines.join('\n')}\n\nTotal: ${currencySymbol}${formatCurrency(transaction.total, currencySymbol).replace(currencySymbol, '')}`;
                Share.share({ message });
            } finally {
                setIsCapturing(false);
                setSharingTx(null);
                setSharingItems([]);
            }
        }, 100);
    };

    return (
        <View className="flex-1 bg-lightBackground">
            <Header title="Ledger" subtitle="Manage your daily transactions" showBell={true} />
            
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* 1. MINI DASHBOARD */}
                <View className="px-6 py-6 flex-row gap-4">
                    <View className="flex-1 bg-primaryLight p-4 rounded-3xl border border-primary/20 shadow-sm">
                        <Text className="text-textSecondary text-[10px] font-bold uppercase tracking-tight mb-2">Total Revenue</Text>
                        <Text className="text-primaryDark font-black text-xl">{formatAmount(stats?.revenue || 0)}</Text>
                    </View>
                    <View className="flex-1 bg-dangerLight p-4 rounded-3xl border border-danger/20 shadow-sm">
                        <Text className="text-danger text-[10px] font-bold uppercase tracking-tight mb-2">Debt Owed</Text>
                        <Text className="text-danger font-black text-xl">{formatAmount(stats?.debt || 0)}</Text>
                    </View>
                </View>

                {/* MIX BREAKDOWN */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-6 mb-8 gap-3" contentContainerStyle={{ paddingRight: 48 }}>
                    {Object.entries(stats?.methods || {}).map(([key, val]) => (
                        <View key={key} className="bg-white px-4 py-3 rounded-2xl border border-border shadow-sm flex-row items-center">
                            <View className="w-2 h-2 rounded-full bg-primary mr-2" />
                            <Text className="text-textSecondary font-bold text-[10px] uppercase mr-3">{key}</Text>
                            <Text className="text-textPrimary font-black text-sm">{formatAmount(val as number)}</Text>
                        </View>
                    ))}
                </ScrollView>

                {/* TABS */}
                <View className="flex-row px-6 gap-3 mb-6">
                    <TouchableOpacity
                        onPress={() => setFilterType('all')}
                        className={`flex-1 py-3 rounded-xl border ${filterType === 'all' ? 'bg-primary border-primary' : 'bg-white border-border'}`}
                    >
                        <Text className={`text-center font-black text-xs uppercase ${filterType === 'all' ? 'text-white' : 'text-textPrimary'}`}>All Payments</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setFilterType('owing')}
                        className={`flex-1 py-3 rounded-xl border flex-row items-center justify-center gap-2 ${filterType === 'owing' ? 'bg-danger border-danger' : 'bg-white border-border'}`}
                    >
                        <Text className={`font-black text-xs uppercase ${filterType === 'owing' ? 'text-white' : 'text-textPrimary'}`}>Owing</Text>
                        {debts.length > 0 && (
                            <View className="bg-white/20 px-1.5 py-0.5 rounded-full">
                                <Text className={`text-[10px] font-bold ${filterType === 'owing' ? 'text-white' : 'text-danger'}`}>{debts.length}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* SEARCH AND DATE FILTERS */}
                <View className="px-6 mb-6 flex-row gap-3">
                    <View className="flex-1 flex-row items-center bg-white border border-border rounded-xl px-4 py-1 h-12 shadow-sm">
                        <Search size={18} color="#64748B" />
                        <TextInput placeholderTextColor="#94A3B8" 
                            className="flex-1 ml-3 text-sm font-bold text-textPrimary" 
                            placeholder="Search customer..." 
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <X size={16} color="#64748B" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity 
                        onPress={() => setShowDateDropdown(true)}
                        className="bg-white border border-border rounded-xl px-4 h-12 justify-center items-center flex-row gap-1 shadow-sm"
                    >
                        <Text className="text-textPrimary font-bold text-xs">
                            {dateFilter === 'all' && 'All Time'}
                            {dateFilter === 'today' && 'Today'}
                            {dateFilter === 'yesterday' && 'Yesterday'}
                            {dateFilter === '7days' && '7 Days'}
                            {dateFilter === '30days' && '30 Days'}
                        </Text>
                        <ChevronDown size={14} color="#64748B" />
                    </TouchableOpacity>
                </View>

                {/* LIST CONTENT */}
                {loading ? (
                    <View className="py-16 items-center"><ActivityIndicator color="#16A34A" /></View>
                ) : filterType === 'all' ? (
                    <View className="px-6 mb-12">
                        {mergedHistory.length === 0 && (
                            <View className="py-16 items-center opacity-30">
                                <Receipt size={48} color="#64748B" />
                                <Text className="font-bold mt-4 text-center text-base">No transactions found.</Text>
                            </View>
                        )}
                        {mergedHistory.map(t => {
                            if (t._type === 'payment_log') {
                                return (
                                    <View key={t.id} className="bg-white rounded-2xl mb-4 border border-border shadow-sm overflow-hidden p-4 flex-row items-center">
                                        <View className="w-12 h-12 rounded-xl items-center justify-center mr-4 bg-blue-50">
                                            <Banknote size={24} color="#2563EB" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-sm text-textPrimary">{t.sender_name || 'Anonymous Sender'}</Text>
                                            <Text className="text-textSecondary text-[10px] font-bold uppercase mt-1">
                                                {t.payment_method || 'TRANSFER'} · {formatTime(t._timestamp)}
                                            </Text>
                                            {t.description && (
                                                <Text className="text-slate-400 text-[11px] mt-1 font-medium">{t.description}</Text>
                                            )}
                                        </View>
                                        <View className="items-end mr-3">
                                            <Text className="text-blue-600 font-black text-sm">+{formatAmount(t.amount)}</Text>
                                            <View className="bg-blue-100 px-2 py-0.5 rounded-full mt-1">
                                                <Text className="text-[10px] font-black uppercase text-blue-600">
                                                    Manual log
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            }
                            
                            const isExpanded = !!expandedRows[t.id];
                            return (
                                <View key={t.id} className="bg-white rounded-2xl mb-4 border border-border shadow-sm overflow-hidden">
                                    <TouchableOpacity 
                                        onPress={() => toggleRow(t.id)}
                                        className="p-4 flex-row items-center"
                                    >
                                        <View className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${t.payment_type === 'PAY_LATER' ? 'bg-dangerLight' : 'bg-primaryLight'}`}>
                                            <Receipt size={24} color={t.payment_type === 'PAY_LATER' ? '#EF4444' : '#16A34A'} />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-sm text-textPrimary">{t.customer_name || 'Walk-in customer'}</Text>
                                            <Text className="text-textSecondary text-[10px] font-bold uppercase mt-1">
                                                {(() => {
                                                    switch (t.payment_type) {
                                                        case 'PAY_LATER': return 'Pay Later';
                                                        case 'CASH': return 'Cash';
                                                        case 'TRANSFER': return 'Transfer';
                                                        case 'POS': return 'POS';
                                                        default: return t.payment_type;
                                                    }
                                                })()} · {formatTime(t._timestamp)}
                                            </Text>
                                        </View>
                                        <View className="items-end mr-3">
                                            <Text className="text-primary font-black text-sm">{formatAmount(t.total)}</Text>
                                            <Text className={`text-[10px] font-black uppercase mt-1 ${t.payment_type === 'PAY_LATER' ? 'text-danger' : 'text-primary'}`}>
                                                {t.payment_type === 'PAY_LATER' ? 'OWING' : 'PAID'}
                                            </Text>
                                        </View>
                                        {isExpanded ? <ChevronUp size={20} color="#64748B" /> : <ChevronDown size={20} color="#64748B" />}
                                    </TouchableOpacity>
                                    
                                    {isExpanded && (
                                        <View className="bg-lightBackground px-6 py-4 border-t border-border/50">
                                            <Text className="text-textSecondary text-[10px] font-black uppercase tracking-widest mb-3">Items Breakdown</Text>
                                            {expandedRows[t.id]?.map((item, idx) => (
                                                <View key={idx} className="flex-row justify-between py-1.5 border-b border-border/10">
                                                    <Text className="font-bold text-xs text-textPrimary flex-1" numberOfLines={1}>{item.product_name}</Text>
                                                    <Text className="text-textSecondary font-bold text-xs mx-3">{item.quantity} × {formatAmount(item.price / item.quantity)}</Text>
                                                    <Text className="font-black text-xs text-primary w-20 text-right">{formatAmount(item.price)}</Text>
                                                </View>
                                            ))}
                                            {/* Subtotal line */}
                                            <View className="mt-3 pt-3 border-t border-border flex-row justify-between items-center">
                                                <Text className="text-textSecondary font-bold text-xs">Cart Total</Text>
                                                <Text className="font-black text-sm text-textPrimary">{formatAmount(t.total)}</Text>
                                            </View>
                                            {t.discount_amount > 0 && (
                                                <View className="flex-row justify-between items-center mt-1">
                                                    <Text className="text-textSecondary font-bold text-xs">Price Override</Text>
                                                    <Text className="font-black text-xs text-danger">−{formatAmount(t.discount_amount)}</Text>
                                                </View>
                                            )}
                                            <View className="mt-4 flex-row items-center justify-between">
                                                {t.customer_phone ? (
                                                    <View className="flex-row items-center">
                                                        <Phone size={14} color="#64748B" />
                                                        <Text className="text-textSecondary text-xs font-bold ml-2">{t.customer_phone}</Text>
                                                    </View>
                                                ) : <View />}
                                                <TouchableOpacity 
                                                    onPress={() => handleShareReceipt(t)}
                                                    disabled={isCapturing}
                                                    className="flex-row items-center bg-primary/10 px-3 py-1.5 rounded-lg"
                                                >
                                                    {isCapturing && sharingTx?.id === t.id ? (
                                                        <ActivityIndicator size="small" color="#16A34A" />
                                                    ) : (
                                                        <>
                                                            <Share2 size={14} color="#16A34A" />
                                                            <Text className="text-primary font-bold text-xs ml-1.5">Receipt</Text>
                                                        </>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <View className="px-6 mb-12">
                        {filteredDebts.length === 0 && (
                            <View className="py-16 items-center opacity-30">
                                <CheckCircle size={48} color="#16A34A" />
                                <Text className="font-bold mt-4 text-center text-base">Awesome, no one owes you money!</Text>
                            </View>
                        )}
                        {filteredDebts.map(d => {
                            const daysOverdue = getDaysOverdue(d.created_at);
                            return (
                                <TouchableOpacity 
                                    key={d.id} 
                                    onPress={() => handleSelectDebt(d)}
                                    className="bg-white border border-border rounded-2xl p-4 mb-4 shadow-sm flex-row justify-between items-center"
                                >
                                    <View className="flex-1">
                                        <Text className="font-bold text-base text-textPrimary">{d.customer_name}</Text>
                                        <Text className="text-textSecondary text-xs font-bold mt-1">
                                            {d.customer_phone ? `${d.customer_phone} · ` : ''}
                                            {daysOverdue === 0 ? 'Today' : `${daysOverdue} days overdue`}
                                        </Text>
                                    </View>
                                    <View className="items-end flex-row items-center gap-3">
                                        <View className="items-end">
                                            <Text className="font-black text-base text-danger">{formatAmount(d.amount_owed)}</Text>
                                            <View className="bg-dangerLight px-2 py-0.5 rounded-full mt-1">
                                                <Text className="text-danger text-[9px] font-black uppercase">PAY LATER</Text>
                                            </View>
                                        </View>
                                        <ChevronDown size={18} color="#CBD5E1" style={{ transform: [{ rotate: '-90deg' }] }} />
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </ScrollView>

            {/* LOG PAYMENT FAB */}
            <TouchableOpacity 
                onPress={() => setLogPaymentModal(true)}
                className="absolute bottom-6 right-6 bg-textPrimary w-14 h-14 rounded-full items-center justify-center shadow-lg shadow-black/30 z-50"
            >
                <Plus size={28} color="white" />
            </TouchableOpacity>

            {/* DATE FILTER SELECTION MODAL */}
            <Modal visible={showDateDropdown} transparent animationType="slide">
                <View className="flex-1 bg-black/40 justify-end">
                    <View className="bg-white rounded-t-[40px] p-6 pb-12">
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-black">Select Date Range</Text>
                            <TouchableOpacity onPress={() => setShowDateDropdown(false)} className="bg-lightBackground p-2 rounded-xl">
                                <X size={24} color="black" />
                            </TouchableOpacity>
                        </View>
                        <View className="gap-2">
                            {[
                                { key: 'all', label: 'All Time' },
                                { key: 'today', label: 'Today' },
                                { key: 'yesterday', label: 'Yesterday' },
                                { key: '7days', label: 'Last 7 Days' },
                                { key: '30days', label: 'Last 30 Days' }
                            ].map(item => (
                                <TouchableOpacity 
                                    key={item.key} 
                                    onPress={() => { setDateFilter(item.key as any); setShowDateDropdown(false); }}
                                    className={`p-4 rounded-xl border flex-row justify-between items-center ${dateFilter === item.key ? 'bg-primaryLight border-primary' : 'bg-lightBackground border-border'}`}
                                >
                                    <Text className={`font-black text-sm ${dateFilter === item.key ? 'text-primaryDark' : 'text-textPrimary'}`}>{item.label}</Text>
                                    {dateFilter === item.key && <CheckCircle size={18} color="#16A34A" />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* DEBT DETAILS MODAL SHEET */}
            <Modal visible={debtDetailsModal} transparent animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/40 justify-end">
                    <View className="bg-white rounded-t-[40px] pt-4" style={{ paddingBottom: Math.max(insets.bottom, 24), maxHeight: '85%' }}>
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        
                        <View className="flex-row justify-between items-center px-6 mb-6">
                            <Text className="text-2xl font-black text-textPrimary">Debt Details</Text>
                            <TouchableOpacity onPress={() => { setDebtDetailsModal(false); setShowPartialInput(false); }} className="bg-lightBackground p-2 rounded-full">
                                <X size={24} color="#0F172A" />
                            </TouchableOpacity>
                        </View>
                        
                        {selectedDebt && (
                            <ScrollView showsVerticalScrollIndicator={false} className="px-6">
                                {/* Customer Summary Card */}
                                <View className="bg-dangerLight/20 border border-danger/20 p-5 rounded-3xl mb-6">
                                    <Text className="font-black text-xl text-dangerDark">{selectedDebt.customer_name}</Text>
                                    {selectedDebt.customer_phone && (
                                        <Text className="text-textSecondary text-xs font-bold mt-1">{selectedDebt.customer_phone}</Text>
                                    )}
                                    <View className="flex-row justify-between items-end mt-4 pt-4 border-t border-danger/10">
                                        <View>
                                            <Text className="text-[10px] text-danger font-black uppercase tracking-wider">Amount Owed</Text>
                                            <Text className="text-2xl font-black text-danger mt-1">{formatAmount(selectedDebt.amount_owed)}</Text>
                                        </View>
                                        <View className="bg-danger/10 px-3 py-1 rounded-full">
                                            <Text className="text-danger font-bold text-xs uppercase">
                                                {getDaysOverdue(selectedDebt.created_at) === 0 ? 'Added Today' : `${getDaysOverdue(selectedDebt.created_at)} Days Overdue`}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Items Breakdown */}
                                {selectedDebtItems.length > 0 && (
                                    <View className="mb-6">
                                        <Text className="text-textSecondary text-[10px] font-black uppercase tracking-widest mb-3">Items Purchased</Text>
                                        <View className="bg-lightBackground p-4 rounded-2xl border border-border/50">
                                            {selectedDebtItems.map((item, idx) => (
                                                <View key={idx} className="flex-row justify-between py-2 border-b border-border/20 last:border-0">
                                                    <Text className="font-bold text-xs text-textPrimary flex-1">{item.product_name}</Text>
                                                    <Text className="text-textSecondary font-bold text-xs mx-4">x{item.quantity}</Text>
                                                    <Text className="font-black text-xs text-textPrimary">{formatAmount(item.price * item.quantity)}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {/* Action Buttons */}
                                <View className="gap-3 mb-6">
                                    {!showPartialInput ? (
                                        <>
                                            <View className="flex-row gap-3">
                                                <TouchableOpacity 
                                                    onPress={() => handleDebtPaidInFull(selectedDebt)}
                                                    className="flex-1 bg-primary py-4 rounded-2xl items-center justify-center flex-row gap-2"
                                                >
                                                    <CheckCircle size={18} color="white" />
                                                    <Text className="text-white font-black text-sm">Paid In Full</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity 
                                                    onPress={() => setShowPartialInput(true)}
                                                    className="flex-1 bg-accent py-4 rounded-2xl items-center justify-center flex-row gap-2"
                                                >
                                                    <Banknote size={18} color="white" />
                                                    <Text className="text-white font-black text-sm">Paid Partially</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <TouchableOpacity 
                                                onPress={() => handleSendReminder(selectedDebt)}
                                                className="bg-white border border-border py-4 rounded-2xl items-center justify-center flex-row gap-2 shadow-sm"
                                            >
                                                <Share2 size={18} color="#16A34A" />
                                                <Text className="text-primary font-black text-sm">Send Payment Reminder</Text>
                                            </TouchableOpacity>
                                        </>
                                    ) : (
                                        <View className="bg-lightBackground p-4 rounded-2xl border border-border">
                                            <Text className="text-textPrimary font-black text-sm mb-3">Record Partial Payment</Text>
                                            <TextInput 
                                                placeholderTextColor="#94A3B8"
                                                className="bg-white border border-border p-3 rounded-xl font-black text-lg mb-3 text-textPrimary"
                                                placeholder="Enter Amount Paid"
                                                keyboardType="numeric"
                                                value={partialAmount}
                                                onChangeText={(t) => {
                                                    setPartialAmount(t);
                                                }}
                                            />
                                            <View className="flex-row gap-3">
                                                <TouchableOpacity 
                                                    onPress={() => setShowPartialInput(false)}
                                                    className="flex-1 bg-white border border-border py-3 rounded-xl items-center"
                                                >
                                                    <Text className="text-textSecondary font-bold text-xs">Cancel</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity 
                                                    onPress={handleDebtPaidPartially}
                                                    disabled={partialLoading}
                                                    className="flex-1 bg-primary py-3 rounded-xl items-center justify-center"
                                                >
                                                    {partialLoading ? (
                                                        <ActivityIndicator size="small" color="white" />
                                                    ) : (
                                                        <Text className="text-white font-black text-xs">Save Payment</Text>
                                                    )}
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    )}
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* LOG PAYMENT MODAL */}
            <Modal visible={logPaymentModal} transparent animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/40 justify-end">
                    <View className="bg-white rounded-t-[40px] pt-4" style={{ paddingBottom: Math.max(insets.bottom, 24), maxHeight: '90%' }}>
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <View className="flex-row justify-between items-center px-6 mb-6">
                            <Text className="text-2xl font-black text-textPrimary">Log Payment</Text>
                            <TouchableOpacity onPress={() => setLogPaymentModal(false)} className="bg-lightBackground p-2 rounded-full">
                                <X size={24} color="#0F172A" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView showsVerticalScrollIndicator={false} className="px-6">
                            <TextInput placeholderTextColor="#94A3B8" 
                                className="bg-lightBackground border border-border p-4 rounded-xl font-black text-xl mb-4 text-primary" 
                                placeholder={`Amount (${currencySymbol})`}
                                keyboardType="numeric" 
                                value={logAmount} 
                                onChangeText={setLogAmount} 
                            />
                            
                            <View className="mb-4">
                                <TextInput placeholderTextColor="#94A3B8" 
                                    className="bg-lightBackground border border-border p-4 rounded-xl font-bold mb-3 text-textPrimary" 
                                    placeholder="Sender Name (Optional)" 
                                    value={logSenderName} 
                                    onChangeText={setLogSenderName} 
                                />
                                <TextInput placeholderTextColor="#94A3B8" 
                                    className="bg-lightBackground border border-border p-4 rounded-xl font-bold text-textPrimary" 
                                    placeholder="Phone Number (Optional)" 
                                    keyboardType="phone-pad" 
                                    value={logSenderPhone} 
                                    onChangeText={setLogSenderPhone} 
                                />
                            </View>

                            <Text className="text-textSecondary text-[10px] font-black uppercase mb-3 mt-2">Payment Method</Text>
                            <View className="flex-row gap-2 mb-6">
                                {[
                                    { key: 'CASH', icon: Banknote, label: 'Cash' },
                                    { key: 'TRANSFER', icon: ArrowLeftRight, label: 'Transfer' },
                                    { key: 'POS', icon: CreditCard, label: 'POS' }
                                ].map(m => (
                                    <TouchableOpacity 
                                        key={m.key} 
                                        onPress={() => setLogMethod(m.key)}
                                        className={`flex-1 p-3 rounded-xl border items-center justify-center ${logMethod === m.key ? 'bg-primaryLight border-primary' : 'bg-white border-border'}`}
                                    >
                                        <m.icon size={20} color={logMethod === m.key ? '#16A34A' : '#64748B'} />
                                        <Text className={`font-black text-[10px] mt-2 ${logMethod === m.key ? 'text-primaryDark' : 'text-textSecondary'}`}>{m.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Stock Deduction Toggle */}
                            <TouchableOpacity 
                                onPress={() => setDeductStock(!deductStock)}
                                className="flex-row items-center gap-3 py-3 border-b border-border/30 mb-4"
                            >
                                <View className={`w-5 h-5 rounded-md border items-center justify-center ${deductStock ? 'bg-primary border-primary' : 'border-border'}`}>
                                    {deductStock && <CheckCircle size={14} color="white" />}
                                </View>
                                <Text className="font-bold text-xs text-textPrimary">Bought a product? (Deduct Stock)</Text>
                            </TouchableOpacity>

                            {deductStock && (
                                <>
                                    {!selectedProduct ? (
                                        <TouchableOpacity 
                                            onPress={() => setShowProductSelector(true)}
                                            className="bg-lightBackground border border-border p-4 rounded-xl items-center justify-center mb-4"
                                        >
                                            <Text className="font-black text-xs text-primary">SELECT PRODUCT TO DEDUCT</Text>
                                        </TouchableOpacity>
                                    ) : (
                                        <View className="bg-lightBackground border border-border p-4 rounded-xl mb-4 relative">
                                            <TouchableOpacity 
                                                onPress={() => setSelectedProduct(null)}
                                                className="absolute top-2 right-2 bg-black/20 rounded-full p-1 z-10"
                                            >
                                                <X size={14} color="#0F172A" />
                                            </TouchableOpacity>
                                            <Text className="font-black text-sm text-textPrimary">{selectedProduct.name}</Text>
                                            <Text className="text-textSecondary text-[10px] font-bold mt-1">Stock remaining: {selectedProduct.stock}</Text>
                                            
                                            <View className="flex-row items-center gap-3 mt-3">
                                                <Text className="font-bold text-xs text-textSecondary">Quantity sold:</Text>
                                                <TextInput 
                                                    keyboardType="numeric"
                                                    className="bg-white border border-border px-3 py-1.5 rounded-lg font-bold text-textPrimary text-center w-16"
                                                    value={productQuantity}
                                                    onChangeText={setProductQuantity}
                                                />
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}

                            <TextInput placeholderTextColor="#94A3B8" 
                                className="bg-lightBackground border border-border p-4 rounded-xl font-bold mb-8 text-textPrimary min-h-[100px]" 
                                placeholder="Notes (Optional)" 
                                multiline
                                textAlignVertical="top"
                                value={logNotes} 
                                onChangeText={setLogNotes} 
                            />

                            <TouchableOpacity 
                                onPress={handleLogPayment} 
                                disabled={logLoading}
                                className="bg-primary py-4 rounded-2xl items-center shadow-sm"
                            >
                                {logLoading ? <ActivityIndicator color="white" /> : <Text className="text-white font-black text-lg">Save Payment Log</Text>}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* PRODUCT SELECTOR MODAL */}
            <Modal visible={showProductSelector} transparent animationType="slide">
                <View className="flex-1 bg-black/40 justify-end">
                    <View className="bg-white rounded-t-[40px] p-6" style={{ height: '70%', paddingBottom: Math.max(insets.bottom, 24) }}>
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-black text-textPrimary">Select Product</Text>
                            <TouchableOpacity onPress={() => setShowProductSelector(false)} className="bg-lightBackground p-2 rounded-full">
                                <X size={24} color="#0F172A" />
                            </TouchableOpacity>
                        </View>
                        
                        <FlatList 
                            data={dbProducts}
                            keyExtractor={(p: any) => p.id}
                            showsVerticalScrollIndicator={false}
                            renderItem={({ item }: { item: any }) => (
                                <TouchableOpacity 
                                    onPress={() => {
                                        setSelectedProduct(item);
                                        setShowProductSelector(false);
                                    }}
                                    className="p-4 border-b border-border/50 flex-row justify-between items-center"
                                >
                                    <View>
                                        <Text className="font-bold text-sm text-textPrimary">{item.name}</Text>
                                        <Text className="text-[10px] text-textSecondary mt-1">Stock: {item.stock} · Price: {currencySymbol}{formatAmount(item.price).replace(currencySymbol, '')}</Text>
                                    </View>
                                    <ChevronDown size={16} color="#CBD5E1" style={{ transform: [{ rotate: '-90deg' }] }} />
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <View className="py-12 items-center">
                                    <Text className="text-textSecondary font-bold">No products found in stock</Text>
                                </View>
                            }
                        />
                    </View>
                </View>
            </Modal>

            <ReceiptView 
                ref={receiptRef} 
                businessName={businessName || 'Chobo'} 
                transaction={sharingTx} 
                items={sharingItems} 
                currencySymbol={currencySymbol} 
            />
        </View>
    );
}
