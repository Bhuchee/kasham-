import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, TouchableOpacity, Modal, Image, TextInput, ScrollView,
    Platform, UIManager, Dimensions, ActivityIndicator, Share, KeyboardAvoidingView, Vibration
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import {
    getProducts, 
    createSale, 
    createSaleItem, 
    decrementStock, 
    createCustomer, 
    createDebt, 
    getFrequentlySoldProducts,
    getNotifications,
    createNotification,
    notificationExistsForRelated,
    createProduct
} from '../db';
import AppModal from '../components/AppModal';
import { useAuthStore } from '../store/authStore';
import { useCurrency } from '../hooks/useCurrency';
import { useCartStore, PaymentType } from '../store/cartStore';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { 
    Search, 
    ScanLine, 
    Bell, 
    X, 
    Minus, 
    Plus, 
    CheckCircle, 
    ChevronRight,
    CircleDot,
    Filter,
    ShoppingCart,
    Wallet,
    Landmark,
    CreditCard,
    History,
    Banknote,
    ArrowLeftRight,
    Clock,
    Pencil,
    PackageSearch,
    Package,
    Sparkles
} from 'lucide-react-native';
import { useSyncStore } from '../store/syncStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCurrency, getInitials } from '../utils/format';
import NotificationsSheet from '../components/NotificationsSheet';
import AddProductSheet from '../components/AddProductSheet';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 48 - 16) / 2; // 2 columns, 24px padding sides, 16px gap

// FIX 1 — Clean tier badge helper (no more inline ternary chains)
const getPlanBadge = (tier: string) => {
    switch (tier) {
        case 'GROWTH':   return { label: 'Growth',     bg: '#DCFCE7', text: '#15803D' };
        case 'BUSINESS': return { label: 'Business',   bg: '#DBEAFE', text: '#1E40AF' };
        case 'ENTERPRISE': return { label: 'Enterprise', bg: '#FEF9C3', text: '#92400E' };
        default:         return { label: 'Free',       bg: '#F1F5F9', text: '#64748B' };
    }
};

// --- HEADER COMPONENT ---
export const Header = ({ title, subtitle, showBell = true }: { title: string, subtitle?: string, showBell?: boolean }) => {
    const insets = useSafeAreaInsets();
    const { isOnline } = useSyncStore();
    const { userId, activeStoreOwnerId, stores, activeRole, setShowSubscriptionModal } = useAuthStore();
    const [unreadCount, setUnreadCount] = useState(0);
    const [sheetVisible, setSheetVisible] = useState(false);

    const currentStore = stores.find(s => s.ownerId === activeStoreOwnerId);
    const tier = currentStore?.tier || 'FREE';
    const badge = getPlanBadge(tier);

    useEffect(() => {
        if (!showBell || !userId) return;
        // FIX 7 — pass activeRole so role-based filtering applies to unread count
        getNotifications(activeStoreOwnerId || userId, userId, activeRole ?? undefined).then(data => {
            setUnreadCount(data.filter((n: any) => n.is_read === 0).length);
        });
    }, [showBell, sheetVisible, userId, activeStoreOwnerId, activeRole]);

    return (
        <View style={{ paddingTop: insets.top + 4 }} className="bg-white px-6 pb-2 border-b border-border flex-row items-center justify-between z-50">
            <View style={{ flex: 1, marginRight: 16 }}>
                <View className="flex-row items-center gap-2">
                    <Text className="text-textPrimary font-black text-xl" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1 }}>{title}</Text>
                    {title === (currentStore?.shopName || 'Chobo') && (
                        <TouchableOpacity
                            onPress={() => setShowSubscriptionModal(true)}
                            style={{ backgroundColor: badge.bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexDirection: 'row', alignItems: 'center' }}
                        >
                            <Text style={{ fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, color: badge.text }}>
                                {badge.label}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                {subtitle && subtitle !== 'Offline ready' ? (
                     <Text className="text-textSecondary text-[10px] font-bold uppercase tracking-tight" numberOfLines={1} ellipsizeMode="tail">{subtitle}</Text>
                ) : null}
            </View>
            <View className="flex-row items-center gap-4">
                <View className="flex-row items-center gap-1.5 bg-lightBackground px-2 py-1 rounded-full">
                    <View className={`w-2 h-2 rounded-full ${isOnline ? 'bg-primary' : 'bg-textSecondary'}`} />
                    <Text className={`text-[10px] font-bold ${isOnline ? 'text-primary' : 'text-textSecondary'}`}>
                        {isOnline ? 'Online' : 'Offline'}
                    </Text>
                </View>
                {showBell && (
                    <TouchableOpacity onPress={() => setSheetVisible(true)} className="p-2 -mr-2 relative">
                        <Bell size={20} color="#0F172A" />
                        {unreadCount > 0 && (
                            <View className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white bg-danger items-center justify-center" />
                        )}
                    </TouchableOpacity>
                )}
            </View>
            {showBell && <NotificationsSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />}
        </View>
    );
};

// --- MAIN SCREEN ---
export default function SellScreen({ onNavigateToStock, onNavigateToOverview }: { onNavigateToStock?: (barcode: string) => void; onNavigateToOverview?: () => void }) {
    const { userId, businessName, activeStoreOwnerId } = useAuthStore();
    const { symbol: currencySymbol, formatAmount } = useCurrency();
    const [products, setProducts] = useState<any[]>([]);
    const [frequentProducts, setFrequentProducts] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
    
    // Onboarding States
    const [hasFirstSaleCompleted, setHasFirstSaleCompleted] = useState<boolean>(true);
    const [celebrationVisible, setCelebrationVisible] = useState(false);
    
    // Scanner State
    const [scannerVisible, setScannerVisible] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [addProductVisible, setAddProductVisible] = useState(false);
    const [notFoundBarcode, setNotFoundBarcode] = useState('');
    const [showNotFoundSheet, setShowNotFoundSheet] = useState(false);
    const [showMiniAddSheet, setShowMiniAddSheet] = useState(false);
    const [miniProductName, setMiniProductName] = useState('');
    const [miniProductPrice, setMiniProductPrice] = useState('');
    
    // Custom AppModal State
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
    
    // Checkout State
    const [checkoutVisible, setCheckoutVisible] = useState(false);
    const [successVisible, setSuccessVisible] = useState(false);
    const [frequentExpanded, setFrequentExpanded] = useState(false);
    
    // Per-product override state
    const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
    const [tempPrice, setTempPrice] = useState('');

    // Total override and Customer Info
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerNameError, setCustomerNameError] = useState('');
    const [finalPaidAmount, setFinalPaidAmount] = useState('');
    const [totalEditMode, setTotalEditMode] = useState(false);
    const [saleLoading, setSaleLoading] = useState(false);

    const soundRef = useRef<Audio.Sound | null>(null);

    const [permission, requestPermission] = useCameraPermissions();
    const { items, total, addItem, updateQuantity, clearCart } = useCartStore();
    const insets = useSafeAreaInsets();
    const { isOnline } = useSyncStore();
    
    const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType | null>(null);

    const loadData = useCallback(async () => {
        if (!userId) return;
        const workspaceId = activeStoreOwnerId || userId;
        const [pRows, fRows] = await Promise.all([
            getProducts(workspaceId, userId),
            getFrequentlySoldProducts(workspaceId, userId, 9)
        ]);
        setProducts(pRows);
        setFrequentProducts(fRows);
    }, [userId, activeStoreOwnerId]);

    useEffect(() => { loadData(); }, [loadData]);

    useEffect(() => {
        const checkFirstSale = async () => {
            const val = await AsyncStorage.getItem('hasFirstSaleCompleted');
            setHasFirstSaleCompleted(val === 'true');
        };
        checkFirstSale();
    }, []);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredProducts(products);
        } else {
            const q = searchQuery.toLowerCase();
            setFilteredProducts(products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(searchQuery))));
        }
    }, [searchQuery, products]);

    // Handle initial calculation of total override
    useEffect(() => {
        setFinalPaidAmount(total.toString());
    }, [total]);

    const handleProductPress = (product: any) => {
        const cartItem = items.find(i => i.productId === product.id);
        const inCartQty = cartItem ? cartItem.quantity : 0;
        const remainingStock = product.stock - inCartQty;

        if (remainingStock <= 0) {
            setModalConfig({
                visible: true,
                type: 'warning',
                title: 'Out of Stock',
                subtitle: `Product "${product.name}" is currently out of stock. Please restock it.`,
            });
            return;
        }

        // Haptic vibration feedback on product tap
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        addItem(product);
    };

    const handleUpdateQuantity = (productId: string, delta: number) => {
        const item = items.find(i => i.productId === productId);
        if (!item) return;
        
        const product = products.find(p => p.id === productId);
        if (product && delta > 0 && item.quantity >= product.stock) {
            setModalConfig({
                visible: true,
                type: 'warning',
                title: 'Stock Limit Reached',
                subtitle: `Cannot add more "${product.name}". Only ${product.stock} items are in stock.`,
            });
            return;
        }

        const newQty = item.quantity + delta;
        updateQuantity(productId, newQty);
    };

    const handleOpenScanner = () => {
        if (!permission?.granted) {
            requestPermission();
            return; // Don't open if not granted
        }
        setScanned(false);
        setScannerVisible(true);
    };

    const handleScan = ({ data }: any) => {
        if (scanned) return;
        setScanned(true);

        const match = products.find(p => p.barcode && p.barcode.trim() === data.trim());
        if (match) {
            const cartItem = items.find(i => i.productId === match.id);
            const inCartQty = cartItem ? cartItem.quantity : 0;
            const remainingStock = match.stock - inCartQty;

            if (remainingStock <= 0) {
                setScannerVisible(false);
                setModalConfig({
                    visible: true,
                    type: 'warning',
                    title: 'Out of Stock',
                    subtitle: `Scanned product "${match.name}" is out of stock.`,
                });
                return;
            }
            handleProductPress(match);
            // Play ping sound on successful scan
            (async () => {
                try {
                    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
                    const { sound } = await Audio.Sound.createAsync(
                        { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg' },
                        { shouldPlay: true, volume: 0.7 }
                    );
                    soundRef.current = sound;
                    sound.setOnPlaybackStatusUpdate((status: any) => {
                        if (status.didJustFinish) sound.unloadAsync();
                    });
                } catch (e) {
                    // Sound not critical — fail silently
                }
            })();
            // Auto-reset scan after 1.5s for continuous scanning
            setTimeout(() => setScanned(false), 1500);
        } else {
            setNotFoundBarcode(data);
            setShowNotFoundSheet(true);
        }
    };

    const handleMiniProductSave = async () => {
        if (!miniProductName || !miniProductPrice || !userId) return;

        try {
            const id = uuidv4();
            const priceVal = parseFloat(miniProductPrice);
            
            // 1. Save product to local SQLite with quantity = 0
            await createProduct(id, miniProductName, priceVal, 0, notFoundBarcode, null, userId, null, 'others', activeStoreOwnerId || userId);
            
            const newProduct = {
                id,
                name: miniProductName,
                price: priceVal,
                stock: 0,
                barcode: notFoundBarcode,
                image_uri: null,
                user_id: userId
            };

            // 2. Create quantity_pending notification
            await createNotification({
                id: uuidv4(),
                type: 'quantity_pending',
                title: 'Stock quantity missing',
                description: `${miniProductName} was added during a sale but has no quantity set. Tap to update.`,
                relatedId: id,
                userId,
                workspaceId: activeStoreOwnerId || userId,
                targetRoles: ['OWNER', 'MANAGER'], // Section 6C — only owners/managers see stock alerts
            });

            // 3. Add product to cart
            addItem(newProduct);

            // 4. Close sheets
            setShowMiniAddSheet(false);
            setShowNotFoundSheet(false);
            setScanned(false);

            // 5. Reset mini form
            setMiniProductName('');
            setMiniProductPrice('');
            setNotFoundBarcode('');
            
            // Refresh local products
            loadData();
        } catch (e) {
            console.warn('Mini save failed', e);
            setModalConfig({
                visible: true,
                type: 'error',
                title: 'Error',
                subtitle: 'Could not quick-add product',
            });
        }
    };

    const executeSale = async (method: PaymentType) => {
        if (method === 'PAY_LATER' && !customerName.trim()) {
            setCustomerNameError('Customer name is required for Pay Later sales');
            return;
        }
        if (!userId) {
            setModalConfig({
                visible: true,
                type: 'error',
                title: 'Error',
                subtitle: 'Not logged in',
            });
            return;
        }

        try {
            setSaleLoading(true);
            const saleId = uuidv4();
            const customerId = (customerName || customerPhone) ? uuidv4() : null;
            const finalTotal = parseFloat(finalPaidAmount) || total;
            const discount = total - finalTotal;

            const workspaceId = activeStoreOwnerId || userId;
            if (customerId) await createCustomer(customerId, customerPhone, customerName || 'Unknown', userId, workspaceId);
            await createSale(saleId, finalTotal, method, discount, customerId, userId, workspaceId);

            for (const item of items) {
                const itemTotal = item.quantity * item.price;
                await createSaleItem(uuidv4(), saleId, item.productId, item.name, item.quantity, itemTotal);
                await decrementStock(item.productId, item.quantity);
            }

            if (method === 'PAY_LATER' && customerId) {
                await createDebt(uuidv4(), customerId, finalTotal, saleId, userId, workspaceId);
            }

            // --- Notification triggers ---
            const threshold = 5;
            for (const item of items) {
                const prod = products.find((p: any) => p.id === item.productId);
                if (!prod) continue;
                const newStock = Math.max(0, prod.stock - item.quantity);
                if (newStock === 0) {
                    const exists = await notificationExistsForRelated(item.productId, 'out_of_stock');
                    if (!exists) await createNotification({ id: uuidv4(), type: 'out_of_stock', title: `${item.name} is out of stock`, description: `You just sold the last unit.`, relatedId: item.productId, userId, workspaceId, targetRoles: ['OWNER', 'MANAGER'] }); // Section 6C
                } else if (newStock <= threshold) {
                    const exists = await notificationExistsForRelated(item.productId, 'low_stock');
                    if (!exists) await createNotification({ id: uuidv4(), type: 'low_stock', title: `Low stock: ${item.name}`, description: `Only ${newStock} unit${newStock === 1 ? '' : 's'} remaining.`, relatedId: item.productId, userId, workspaceId, targetRoles: ['OWNER', 'MANAGER'] }); // Section 6C
                }
            }

            setSuccessVisible(true);
            clearCart();
            setCheckoutVisible(false);
            setCustomerName('');
            setCustomerPhone('');
            setCustomerNameError('');
            setSelectedPaymentType(null);
            loadData();
            setTimeout(() => setSuccessVisible(false), 2000);

            if (!hasFirstSaleCompleted) {
                await AsyncStorage.setItem('hasFirstSaleCompleted', 'true');
                setHasFirstSaleCompleted(true);
                setTimeout(() => {
                    setCelebrationVisible(true);
                }, 2200);
            }
        } catch (e) {
            console.error('Sale error', e);
            setModalConfig({
                visible: true,
                type: 'error',
                title: 'Error',
                subtitle: 'Could not record sale',
            });
        } finally {
            setSaleLoading(false);
        }
    };

    const renderProductCard = ({ item }: { item: any }) => {
        const cartItem = items.find(i => i.productId === item.id);
        const inCartQty = cartItem ? cartItem.quantity : 0;
        const remainingStock = item.stock - inCartQty;
        const isOutOfStock = remainingStock <= 0;

        let dotColor = '#16A34A';
        let stockTextColor = '#15803D';
        if (isOutOfStock) {
            dotColor = '#94A3B8';
            stockTextColor = '#64748B';
        } else if (remainingStock <= 3) {
            dotColor = '#EF4444';
            stockTextColor = '#EF4444';
        } else if (remainingStock <= 10) {
            dotColor = '#FACC15';
            stockTextColor = '#92400E';
        }

        const isSelected = inCartQty > 0;

        return (
            <TouchableOpacity 
                onPress={() => handleProductPress(item)}
                style={{ width: ITEM_WIDTH }}
                className={`rounded-2xl p-4 mb-4 ${
                    isOutOfStock 
                        ? 'bg-slate-100 border border-slate-200 opacity-60' 
                        : isSelected 
                            ? 'bg-primaryLight/30 border-2 border-primary' 
                            : 'bg-white border border-border'
                }`}
                activeOpacity={isOutOfStock ? 1 : 0.7}
            >
                {isSelected && (
                    <View className="absolute -top-2 -right-2 bg-primary min-w-[24px] h-[24px] rounded-full items-center justify-center z-10 border-2 border-white px-1">
                        <Text className="text-white text-[11px] font-bold">{inCartQty}</Text>
                    </View>
                )}

                <View className="w-full aspect-square rounded-2xl overflow-hidden mb-3 bg-lightBackground">
                    {item.image_uri ? (
                        <Image source={{ uri: item.image_uri }} className={`w-full h-full ${isOutOfStock ? 'grayscale' : ''}`} resizeMode="cover" />
                    ) : (
                        <View className={`w-full h-full items-center justify-center ${isOutOfStock ? 'bg-slate-200' : 'bg-primaryLight'}`}>
                            <Text className={`${isOutOfStock ? 'text-slate-400' : 'text-primaryDark'} font-bold text-xl`}>{getInitials(item.name)}</Text>
                        </View>
                    )}
                </View>
                <Text className={`font-bold text-sm text-center mb-1 ${isOutOfStock ? 'text-slate-400' : 'text-textPrimary'}`} numberOfLines={2}>{item.name}</Text>
                <Text className={`font-black text-base text-center mb-2 ${isOutOfStock ? 'text-slate-400' : 'text-primary'}`}>{formatAmount(item.price)}</Text>
                
                <View className="flex-row items-center justify-center gap-1.5 mt-auto">
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                    <Text style={{ color: stockTextColor }} className="text-xs font-bold">
                        {isOutOfStock ? 'Out of stock' : `${remainingStock} left`}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View className="flex-1 bg-lightBackground">
            <Header title={businessName || 'Chobo'} subtitle="Offline ready" />

            {/* SEARCH & FILTERS */}
            <View className="px-6 py-4 bg-white border-b border-border z-10">
                <View className="flex-row gap-3">
                    <View className="flex-1 flex-row items-center bg-lightBackground rounded-2xl px-4 h-12">
                        <Search size={18} color="#64748B" />
                        <TextInput placeholderTextColor="#94A3B8" 
                            className="flex-1 ml-3 text-textPrimary font-bold text-sm" 
                            placeholder="Search by name or barcode"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <X size={16} color="#64748B" />
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity onPress={handleOpenScanner} className="bg-primaryLight w-12 h-12 rounded-2xl items-center justify-center border border-primary/20">
                        <ScanLine size={20} color="#15803D" />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, paddingBottom: 150 }}>
                {/* Step 2 Onboarding Banner */}
                {products.length > 0 && !hasFirstSaleCompleted && (
                    <View className="bg-primary p-4 rounded-2xl flex-row items-center justify-between mb-6 shadow-sm border border-primary/20">
                        <View className="flex-1 mr-4">
                            <Text className="text-white font-black text-sm">Step 2: Let's make your first sale!</Text>
                            <Text className="text-white/80 font-bold text-xs mt-1">Tap your product card below to add it to the cart, then tap Checkout.</Text>
                        </View>
                        <Sparkles size={20} color="white" />
                    </View>
                )}

                {/* FREQUENTLY SOLD */}
                {frequentProducts.length > 0 && !searchQuery && (
                    <View style={{ backgroundColor: '#16A34A' }} className="rounded-2xl p-4 mb-6">
                        <Text className="text-white font-black text-sm mb-3">Frequently sold</Text>
                        <View className="flex-row flex-wrap justify-between">
                            {frequentProducts.slice(0, frequentExpanded ? 9 : 3).map((fp: any) => (
                                <TouchableOpacity 
                                    key={`freq-${fp.id}`}
                                    onPress={() => handleProductPress(fp)}
                                    className="bg-white rounded-xl p-2 mb-2 overflow-hidden"
                                    style={{ width: '31%' }}
                                >
                                    {fp.image_uri ? (
                                        <Image source={{ uri: fp.image_uri }} className="w-8 h-8 rounded-lg mb-1" />
                                    ) : (
                                        <View className="w-8 h-8 rounded-lg bg-primaryLight items-center justify-center mb-1">
                                            <Text style={{ color: '#15803D', fontSize: 10, fontWeight: '800' }}>{getInitials(fp.name)}</Text>
                                        </View>
                                    )}
                                    <Text style={{ color: '#0F172A', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{fp.name}</Text>
                                    <Text style={{ color: '#16A34A', fontSize: 12, fontWeight: '900' }} className="mt-0.5">{formatCurrency(fp.price, currencySymbol)}</Text>
                                    <View className="w-1.5 h-1.5 rounded-full mt-1" style={{ backgroundColor: (fp.stock - (items.find((i: any)=>i.productId===fp.id)?.quantity||0)) > 0 ? '#16A34A' : '#EF4444' }} />
                                </TouchableOpacity>
                            ))}
                        </View>
                        {frequentProducts.length > 3 && (
                            <TouchableOpacity onPress={() => setFrequentExpanded(!frequentExpanded)} className="items-center pt-2 mt-1">
                                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.4)' }} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* PRODUCT GRID */}
                <View className="flex-row flex-wrap justify-between">
                    {filteredProducts.map(item => <React.Fragment key={item.id}>{renderProductCard({item})}</React.Fragment>)}
                </View>
                
                {/* Onboarding Step 1 Empty State */}
                {products.length === 0 ? (
                    <View className="bg-white rounded-[32px] p-6 border border-border shadow-sm my-6">
                        <View className="bg-[#DCFCE7] w-12 h-12 rounded-2xl items-center justify-center mb-4">
                            <Package size={24} color="#16A34A" />
                        </View>
                        <Text className="text-textPrimary font-black text-2xl mb-2">Step 1: Add your first product</Text>
                        <Text className="text-textSecondary font-bold text-sm mb-6 leading-5">
                            Every business starts with inventory. Let's add your very first product to Chobo so you can sell it.
                        </Text>
                        <View className="flex-row gap-4">
                            <TouchableOpacity 
                                onPress={() => onNavigateToStock?.('')}
                                className="flex-1 bg-primary py-3.5 rounded-xl items-center flex-row justify-center shadow-sm active:bg-[#15803D]"
                            >
                                <ScanLine size={16} color="white" style={{ marginRight: 8 }} />
                                <Text className="text-white font-black text-xs">Scan Barcode</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={() => setAddProductVisible(true)}
                                className="flex-1 bg-lightBackground border border-border py-3.5 rounded-xl items-center flex-row justify-center active:bg-border/20"
                            >
                                <Plus size={16} color="#0F172A" style={{ marginRight: 8 }} />
                                <Text className="text-textPrimary font-black text-xs">Add Manually</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : null}

                {products.length > 0 && filteredProducts.length === 0 && (
                    <View className="items-center justify-center py-12">
                        <Search size={40} color="#CBD5E1" />
                        <Text className="text-textSecondary font-bold mt-4">No products found</Text>
                    </View>
                )}
            </ScrollView>

            {/* FLOATING CART SUMMARY */}
            {items.length > 0 && (
                <View className="absolute bottom-6 left-6 right-6 bg-primary rounded-3xl p-1 shadow-lg shadow-primary/30 flex-row">
                    <View className="flex-1 px-4 py-3 justify-center">
                        <Text className="text-white/80 font-bold text-xs">{items.reduce((acc, i) => acc + i.quantity, 0)} items</Text>
                        <Text className="text-white font-black text-lg">{formatAmount(total)}</Text>
                    </View>
                    <TouchableOpacity 
                        onPress={() => setCheckoutVisible(true)}
                        className="bg-white px-6 rounded-2xl items-center justify-center flex-row shadow-sm"
                    >
                        <Text className="text-primary font-black mr-2">Checkout</Text>
                        <ChevronRight size={16} color="#16A34A" />
                    </TouchableOpacity>
                </View>
            )}

            {/* SCANNER MODAL */}
            <Modal visible={scannerVisible} transparent animationType="slide">
                <View className="flex-1 bg-black/60 justify-end">
                    <View className="bg-white rounded-t-[40px] p-6" style={{ height: '85%', paddingBottom: Math.max(insets.bottom, 24) }}>
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-black text-textPrimary">Scan to Sell</Text>
                            <TouchableOpacity onPress={() => setScannerVisible(false)} className="p-2 bg-lightBackground rounded-full">
                                <X size={20} color="#64748B" />
                            </TouchableOpacity>
                        </View>

                        <View className="h-64 rounded-3xl overflow-hidden mb-6 bg-black border-4 border-primary">
                            <CameraView 
                                style={{ flex: 1 }}
                                facing="back"
                                onBarcodeScanned={scanned ? undefined : handleScan}
                                barcodeScannerSettings={{
                                    barcodeTypes: ['ean13', 'ean8', 'code128', 'upc_a', 'upc_e', 'qr']
                                }}
                            />
                            {scanned && (
                                <View className="absolute inset-0 bg-primary/20 items-center justify-center">
                                    <View className="bg-white p-4 rounded-full shadow-lg">
                                        <CheckCircle size={40} color="#16A34A" />
                                    </View>
                                </View>
                            )}
                        </View>

                        <View className="flex-1">
                            <Text className="text-xs font-bold text-textSecondary uppercase tracking-widest mb-3">Items in Cart</Text>
                            <ScrollView showsVerticalScrollIndicator={false} className="flex-1">
                                {items.length > 0 ? (
                                    items.map((item) => (
                                        <View key={item.productId} className="flex-row items-center justify-between py-3 border-b border-border">
                                            <View className="flex-1">
                                                <Text className="font-bold text-textPrimary" numberOfLines={1}>{item.name}</Text>
                                                <Text className="text-xs text-textSecondary">{formatAmount(item.price)} each</Text>
                                            </View>
                                            <View className="flex-row items-center gap-4">
                                                <TouchableOpacity onPress={() => handleUpdateQuantity(item.productId, -1)} className="p-1 bg-lightBackground rounded-full">
                                                    <Minus size={16} color="#64748B" />
                                                </TouchableOpacity>
                                                <Text className="font-black text-primary text-base">x{item.quantity}</Text>
                                                <TouchableOpacity onPress={() => handleUpdateQuantity(item.productId, 1)} className="p-1 bg-primaryLight rounded-full">
                                                    <Plus size={16} color="#16A34A" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))
                                ) : (
                                    <View className="flex-1 items-center justify-center py-10 opacity-30">
                                        <ShoppingCart size={40} color="#64748B" />
                                        <Text className="font-bold mt-2">Scanner active. Scan barcodes to add.</Text>
                                    </View>
                                )}
                            </ScrollView>

                            <View className="pt-4 border-t border-border mt-2">
                                <View className="flex-row justify-between items-center mb-4">
                                    <Text className="text-textSecondary font-bold">Total Amount</Text>
                                    <Text className="text-2xl font-black text-primary">{formatAmount(total)}</Text>
                                </View>
                                <TouchableOpacity 
                                    onPress={() => {
                                        setScannerVisible(false);
                                        setCheckoutVisible(true);
                                    }}
                                    disabled={items.length === 0}
                                    className={`w-full py-4 rounded-2xl items-center flex-row justify-center ${items.length === 0 ? 'bg-primary/50' : 'bg-primary'}`}
                                >
                                    <Text className="text-white font-black text-lg">Checkout Now</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* NOT FOUND CHOICE SHEET */}
            <Modal visible={showNotFoundSheet} transparent animationType="slide">
                <View className="flex-1 bg-black/60 justify-end">
                    <View className="bg-white rounded-t-[40px] p-6 pb-12">
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <View className="items-center mb-6">
                            <View className="w-20 h-20 bg-lightBackground rounded-full items-center justify-center mb-4">
                                <PackageSearch size={40} color="#64748B" />
                            </View>
                            <Text className="text-2xl font-black text-textPrimary text-center">Product not in your stock</Text>
                            <Text className="text-textSecondary text-center mt-2 px-6">
                                The barcode <Text className="font-black text-textPrimary">{notFoundBarcode}</Text> was not found in your inventory.
                            </Text>
                        </View>

                        <TouchableOpacity 
                            onPress={() => {
                                setShowNotFoundSheet(false);
                                setShowMiniAddSheet(true);
                            }}
                            className="w-full bg-primary py-4 rounded-2xl items-center mb-3"
                        >
                            <Text className="text-white font-black text-lg">Add to stock</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            onPress={() => {
                                setShowNotFoundSheet(false);
                                setScanned(false);
                            }}
                            className="w-full bg-lightBackground py-4 rounded-2xl items-center"
                        >
                            <Text className="text-textPrimary font-black text-lg">Skip this item</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* MINI ADD SHEET */}
            <Modal visible={showMiniAddSheet} transparent animationType="slide">
                <View className="flex-1 bg-black/60 justify-end">
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        className="bg-white rounded-t-[40px] p-6 pb-12"
                    >
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <Text className="text-xl font-black text-textPrimary mb-6">Quick Add Product</Text>
                        
                        <View className="bg-lightBackground border border-border rounded-2xl px-4 py-3 mb-3">
                            <Text className="text-[10px] font-bold text-textSecondary uppercase tracking-widest mb-1">Barcode</Text>
                            <Text className="font-black text-textPrimary text-lg">{notFoundBarcode}</Text>
                        </View>

                        <TextInput placeholderTextColor="#94A3B8"
                            className="bg-lightBackground border border-border p-4 rounded-2xl font-bold mb-3 text-textPrimary text-lg"
                            placeholder="Product Name"
                            value={miniProductName}
                            onChangeText={setMiniProductName}
                            autoFocus
                        />

                        <View className="flex-row items-center bg-lightBackground border border-border rounded-2xl px-4 mb-6">
                            <Text className="text-xl font-black text-primary mr-2">{currencySymbol}</Text>
                            <TextInput placeholderTextColor="#94A3B8"
                                className="flex-1 py-4 font-black text-textPrimary text-xl"
                                placeholder="Selling Price"
                                keyboardType="numeric"
                                value={miniProductPrice}
                                onChangeText={setMiniProductPrice}
                            />
                        </View>

                        <TouchableOpacity 
                            onPress={handleMiniProductSave}
                            disabled={!miniProductName || !miniProductPrice}
                            className={`w-full py-4 rounded-2xl items-center ${(!miniProductName || !miniProductPrice) ? 'bg-primary/50' : 'bg-primary'}`}
                        >
                            <Text className="text-white font-black text-lg">Add to stock & checkout</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            onPress={() => {
                                setShowMiniAddSheet(false);
                                setScanned(false);
                            }}
                            className="w-full py-4 rounded-2xl items-center mt-2"
                        >
                            <Text className="text-textSecondary font-bold">Cancel</Text>
                        </TouchableOpacity>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            <AppModal
                visible={modalConfig.visible}
                type={modalConfig.type}
                title={modalConfig.title}
                subtitle={modalConfig.subtitle}
                onDismiss={() => setModalConfig(prev => ({ ...prev, visible: false }))}
            />

            {/* ADD PRODUCT SHEET (Overlay) */}
            <AddProductSheet 
                visible={addProductVisible}
                onClose={() => setAddProductVisible(false)}
                initialBarcode={notFoundBarcode}
                onSuccess={() => { loadData(); }}
            />

            {/* CHECKOUT MODAL */}
            <Modal visible={checkoutVisible} animationType="slide" transparent>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-black/40 justify-end">
                    <View className="bg-white rounded-t-[40px] pt-2" style={{ paddingBottom: Math.max(insets.bottom, 24), height: '85%' }}>
                        <View className="w-12 h-1 bg-border rounded-full self-center mb-4" />
                        <View className="flex-row items-center justify-between px-6 pb-4 border-b border-border">
                            <Text className="text-2xl font-black text-textPrimary">Checkout</Text>
                            <TouchableOpacity onPress={() => setCheckoutVisible(false)} className="bg-lightBackground p-2 rounded-full">
                                <X size={24} color="#0F172A" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
                            {/* ITEM LIST WITH PRICE OVERRIDE */}
                            {items.map(item => {
                                const product = products.find((p: any) => p.id === item.productId);
                                return (
                                    <View key={item.productId} className="flex-row items-center justify-between mb-4 bg-white border border-border p-4 rounded-3xl shadow-sm">
                                        <View className="flex-row items-center flex-1 pr-4">
                                            <View className="w-10 h-10 rounded-full bg-lightBackground items-center justify-center mr-3 border border-border/50 overflow-hidden">
                                                {product?.image_uri ? (
                                                    <Image source={{ uri: product.image_uri }} className="w-full h-full" resizeMode="cover" />
                                                ) : (
                                                    <Text className="text-textPrimary font-black text-xs">{getInitials(item.name)}</Text>
                                                )}
                                            </View>
                                            <View className="flex-1">
                                                <Text className="font-bold text-sm text-textPrimary mb-1" numberOfLines={2}>{item.name}</Text>
                                                {/* Price Edit Logic */}
                                                {editingPriceId === item.productId ? (
                                                    <TextInput placeholderTextColor="#94A3B8" 
                                                        autoFocus
                                                        className="text-primary font-black text-sm border-b border-primary p-0 m-0 w-20"
                                                        keyboardType="numeric"
                                                        value={tempPrice}
                                                        onChangeText={setTempPrice}
                                                        onBlur={() => {
                                                            const p = parseFloat(tempPrice);
                                                            updateQuantity(item.productId, item.quantity, isNaN(p) ? item.price : p);
                                                            setEditingPriceId(null);
                                                        }}
                                                    />
                                                ) : (
                                                    <TouchableOpacity className="flex-row items-center gap-1.5" onPress={() => { setEditingPriceId(item.productId); setTempPrice(item.price.toString()); }}>
                                                        {item.price !== (product?.price ?? item.price) && (
                                                            <Text className="text-textSecondary text-xs line-through">
                                                                {formatAmount(product?.price ?? 0)}
                                                            </Text>
                                                        )}
                                                        <Text className="text-primary font-black text-sm">{formatAmount(item.price)}</Text>
                                                        <View className="bg-lightBackground p-1 rounded-full">
                                                            <Pencil size={10} color="#64748B" />
                                                        </View>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                        
                                        <View className="flex-row items-center bg-lightBackground rounded-full border border-border p-1">
                                            <TouchableOpacity onPress={() => handleUpdateQuantity(item.productId, -1)} className="w-8 h-8 rounded-full bg-danger items-center justify-center shadow-sm">
                                                <Minus size={16} color="white" />
                                            </TouchableOpacity>
                                            <Text className="font-black text-sm w-8 text-center text-textPrimary">{item.quantity}</Text>
                                            <TouchableOpacity onPress={() => handleUpdateQuantity(item.productId, 1)} className="w-8 h-8 rounded-full bg-primary items-center justify-center shadow-sm">
                                                <Plus size={16} color="white" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })}

                            <View className="mt-4 bg-cardSurface p-5 rounded-3xl border border-primary/20">
                                <Text className="text-textSecondary text-xs font-black uppercase mb-2">Total</Text>
                                <View className="flex-row items-center justify-between">
                                    <View>
                                        <Text className="text-primary font-black text-3xl">
                                            {totalEditMode ? formatCurrency(parseFloat(finalPaidAmount) || 0, currencySymbol) : formatAmount(total)}
                                        </Text>
                                        {totalEditMode && (parseFloat(finalPaidAmount) || 0) !== total && (
                                            <Text style={{ color: '#64748B', fontSize: 13, textDecorationLine: 'line-through', marginTop: 2 }}>{formatAmount(total)}</Text>
                                        )}
                                    </View>
                                    <TouchableOpacity onPress={() => { setTotalEditMode(!totalEditMode); if (!totalEditMode) setFinalPaidAmount(total.toString()); }} className="p-2">
                                        <Pencil size={16} color={totalEditMode ? '#16A34A' : '#64748B'} />
                                    </TouchableOpacity>
                                </View>
                                {totalEditMode && (
                                    <TextInput placeholderTextColor="#94A3B8"
                                        autoFocus
                                        className="mt-3 bg-lightBackground rounded-xl px-4 py-3 font-black text-primary text-lg border border-primary/30"
                                        keyboardType="numeric"
                                        value={finalPaidAmount}
                                        onChangeText={setFinalPaidAmount}
                                        placeholder="Enter adjusted total..."
                                    />
                                )}
                            </View>

                            {/* PAYMENT METHOD (4 BOXES) */}
                            <Text className="text-textSecondary text-xs font-black uppercase mb-3 mt-8">Payment Method</Text>
                            <View className="flex-row gap-2 mb-6">
                                {[
                                    { key: 'CASH', icon: Banknote, label: 'Cash' },
                                    { key: 'TRANSFER', icon: ArrowLeftRight, label: 'Transfer' },
                                    { key: 'POS', icon: CreditCard, label: 'POS' },
                                    { key: 'PAY_LATER', icon: Clock, label: 'Pay Later' }
                                ].map(m => (
                                    <TouchableOpacity 
                                        key={m.key} 
                                        onPress={() => setSelectedPaymentType(m.key as PaymentType)}
                                        className={`flex-1 items-center justify-center p-3 rounded-xl border ${selectedPaymentType === m.key ? 'bg-primaryLight border-primary' : 'bg-lightBackground border-border'}`}
                                    >
                                        <m.icon size={20} color={selectedPaymentType === m.key ? '#16A34A' : '#64748B'} />
                                        <Text className={`text-[10px] font-black mt-2 ${selectedPaymentType === m.key ? 'text-primaryDark' : 'text-textSecondary'}`}>{m.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* CUSTOMER DETAILS */}
                            <Text className="text-textSecondary text-xs font-black uppercase mb-3 mt-2">Customer Details {selectedPaymentType === 'PAY_LATER' ? '(Required)' : '(Optional)'}</Text>
                            <View className="mb-8">
                                <TextInput placeholderTextColor="#94A3B8" 
                                    className={`bg-lightBackground border p-4 rounded-xl font-bold mb-1 text-textPrimary ${customerNameError && selectedPaymentType === 'PAY_LATER' ? 'border-red-500' : 'border-border'}`}
                                    placeholder="Customer Name"
                                    value={customerName}
                                    onChangeText={(t) => { setCustomerName(t); if (customerNameError) setCustomerNameError(''); }}
                                />
                                {customerNameError && selectedPaymentType === 'PAY_LATER' && (
                                    <Text className="text-red-500 font-bold text-[10px] mb-2 ml-1">{customerNameError}</Text>
                                )}
                                <TextInput placeholderTextColor="#94A3B8" 
                                    className="bg-lightBackground border border-border p-4 rounded-xl font-bold text-textPrimary" 
                                    placeholder="Phone Number"
                                    keyboardType="phone-pad"
                                    value={customerPhone}
                                    onChangeText={setCustomerPhone}
                                />
                            </View>
                        </ScrollView>

                        <View className="p-6 pt-2 bg-white border-t border-border">
                            <TouchableOpacity 
                                onPress={() => selectedPaymentType && !saleLoading && executeSale(selectedPaymentType)}
                                disabled={!selectedPaymentType || saleLoading}
                                className={`w-full py-4 rounded-2xl items-center flex-row justify-center ${selectedPaymentType && !saleLoading ? 'bg-primary' : 'bg-textSecondary/20'}`}
                            >
                                {saleLoading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text className="text-white font-black text-lg">
                                        Confirm {totalEditMode ? formatCurrency(parseFloat(finalPaidAmount) || total, currencySymbol) : formatAmount(total)}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {successVisible && (
                <View className="absolute inset-0 bg-primary items-center justify-center z-[200]">
                    <CheckCircle size={100} color="white" />
                    <Text className="text-white font-black text-3xl mt-4">SALE RECORDED</Text>
                </View>
            )}

            {celebrationVisible && (
                <Modal visible={celebrationVisible} transparent animationType="fade">
                    <View className="flex-1 bg-black/60 items-center justify-center px-6">
                        <View className="bg-white rounded-[40px] p-8 w-full items-center shadow-2xl">
                            <View className="w-20 h-20 bg-[#DCFCE7] rounded-full items-center justify-center mb-6">
                                <Sparkles size={40} color="#16A34A" />
                            </View>
                            <Text className="text-textPrimary font-black text-3xl text-center mb-2">🎉 Congratulations!</Text>
                            <Text className="text-textSecondary font-bold text-sm text-center mb-8 leading-6">
                                You just made your first Chobo sale! Your inventory has been updated automatically. Now let's see your real-time business profits.
                            </Text>
                            <TouchableOpacity 
                                onPress={() => {
                                    setCelebrationVisible(false);
                                    if (onNavigateToOverview) onNavigateToOverview();
                                }}
                                className="bg-primary w-full py-4 rounded-2xl items-center justify-center shadow-lg shadow-primary/30"
                            >
                                <Text className="text-white font-black text-base">Check my earnings in Overview →</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={() => setCelebrationVisible(false)}
                                className="mt-4"
                            >
                                <Text className="text-textSecondary font-bold text-sm">Keep Selling</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
}
