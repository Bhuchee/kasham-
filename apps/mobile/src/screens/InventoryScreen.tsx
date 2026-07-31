import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, Modal, ScrollView, Image, ActivityIndicator
} from 'react-native';
import AppModal from '../components/AppModal';
import PaywallModal from '../components/PaywallModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProducts, createProduct, updateProduct, updateProductQuantity, deleteProduct, getStockSummary, getProductCount } from '../db';
import { pushSalesToBackend } from '../services/syncService';
import { 
    Plus, 
    X, 
    Edit3, 
    Trash2, 
    ScanLine,
    Package,
    AlertTriangle,
    CheckCircle,
    Search,
    Filter,
    Camera,
    PackageSearch,
    PackageCheck,
    Lock,
    ChevronRight,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { v4 as uuidv4 } from 'uuid';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { formatCurrency, getInitials } from '../utils/format';
import { fetchProductFromOFF } from '../services/offService';
import { Header } from './SellScreen';
import * as ImagePicker from 'expo-image-picker';
import { useCurrency } from '../hooks/useCurrency';

interface InventoryScreenProps {
    initialBarcode?: string | null;
    onClearBarcode?: () => void;
}

type LookupState = 'idle' | 'local' | 'chobo' | 'global' | 'done';
type StockTab = 'inStock' | 'addQuantity';
const CATEGORIES = [
    { label: 'Provisions', value: 'Provisions' },
    { label: 'Beverages', value: 'Beverages' },
    { label: 'Snacks', value: 'Snacks' },
    { label: 'Pharmacy', value: 'Pharmacy' },
    { label: 'Clothes', value: 'Clothes' },
    { label: 'Electronics', value: 'Electronics' },
    { label: 'Fresh Food', value: 'Fresh Food' },
    { label: 'Others', value: 'Others' }
];

const debounce = (func: Function, delay: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
};

export default function InventoryScreen({ initialBarcode, onClearBarcode }: InventoryScreenProps) {
    const [products, setProducts] = useState<any[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [summary, setSummary] = useState({ total: 0, low: 0, outOfStock: 0 });
    const [modalVisible, setModalVisible] = useState(false);
    const [modal, setModal] = useState<{ visible: boolean; type: 'success' | 'error' | 'warning' | 'info'; title: string; subtitle?: string; primaryLabel?: string; onPrimary?: () => void; secondaryLabel?: string; onSecondary?: () => void; autoDismiss?: boolean } | null>(null);
    const [scannerVisible, setScannerVisible] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [isLookingUp, setIsLookingUp] = useState(false);
    
    // Filter Sheet State
    const [filterVisible, setFilterVisible] = useState(false);
    const [sortBy, setSortBy] = useState<string>('Newest');

    // Form state
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [stock, setStock] = useState('');
    const [barcode, setBarcode] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);
    const [category, setCategory] = useState('Provisions');
    const [customCategory, setCustomCategory] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

    // Validation error states
    const [nameError, setNameError] = useState('');
    const [priceError, setPriceError] = useState('');
    const [stockError, setStockError] = useState('');

    const [lookupState, setLookupState] = useState<LookupState>('idle');
    const [activeTab, setActiveTab] = useState<StockTab>('inStock');
    const [nameSuggestions, setNameSuggestions] = useState<any[]>([]);
    const [showLookupStatus, setShowLookupStatus] = useState(false);

    const [newQuantity, setNewQuantity] = useState('');
    const [showAddQtySheet, setShowAddQtySheet] = useState(false);
    const [selectedPendingProduct, setSelectedPendingProduct] = useState<any>(null);

    const [permission, requestPermission] = useCameraPermissions();
    const { token, userId, activeRole, stores, activeStoreOwnerId, setShowSubscriptionModal } = useAuthStore();
    const activeStore = stores.find(s => s.ownerId === activeStoreOwnerId);
    const tier = activeStore?.tier ?? 'FREE';
    const isCashier = activeRole === 'STAFF';
    const { isOnline } = useSyncStore();
    const { symbol, formatAmount } = useCurrency();
    const insets = useSafeAreaInsets();

    // Section 1B — product count for FREE tier soft cap
    const [productCount, setProductCount] = useState(0);
    // Section 2A — cost price form state
    const [costPrice, setCostPrice] = useState('');
    // FIX 9 — PaywallModal state for locked features
    const [paywallVisible, setPaywallVisible] = useState(false);

    const loadData = useCallback(async () => {
        if (!userId) return;
        const threshold = parseInt((await AsyncStorage.getItem('lowStockThreshold')) || '5', 10);
        const [rows, sum, count] = await Promise.all([
            getProducts(userId),
            getStockSummary(userId, threshold),
            getProductCount(userId),
        ]);
        setProducts(rows);
        setSummary(sum);
        setProductCount(count);
    }, [userId]);

    useEffect(() => { loadData(); }, [loadData]);

    // loadData triggered by useEffect above

    useEffect(() => {
        if (initialBarcode) {
            handleLookupFlow(initialBarcode);
            onClearBarcode?.();
        }
    }, [initialBarcode]);

    useEffect(() => {
        let result = [...products];
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(p => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(searchQuery)));
        }

        if (sortBy === 'Low Stock') result.sort((a, b) => a.stock - b.stock);
        if (sortBy === 'Most Sold') result.sort((a, b) => b.stock - a.stock); // Proxy for now
        if (sortBy === 'Price (High)') result.sort((a, b) => b.price - a.price);
        if (sortBy === 'Price (Low)') result.sort((a, b) => a.price - b.price);
        // Newest is default by id/db order, handled natively
        
        setFilteredProducts(result);
    }, [searchQuery, products, sortBy]);

    const handleLookupFlow = async (barcodeData: string) => {
        if (!barcodeData) return;

        setShowLookupStatus(true);
        const local = products.find(p => p.barcode === barcodeData);
        if (local) {
            setShowLookupStatus(false);
            setScannerVisible(false);
            handleEdit(local);
            setModal({
                visible: true,
                type: 'info',
                title: 'Found',
                subtitle: `${local.name} is already in your stock.`,
            });
            return;
        }

        setEditingProduct(null);
        setBarcode(barcodeData);
        setName('');
        setPrice('');
        setStock('');
        setImageUri(null);
        setCategory('Provisions');
        setCustomCategory('');
        setShowCustomInput(false);

        if (!isOnline) {
            setShowLookupStatus(false);
            setScannerVisible(false);
            setModal({
                visible: true,
                type: 'info',
                title: 'Offline',
                subtitle: "You're offline — barcode lookup unavailable. Fill in details manually.",
            });
            setModalVisible(true);
            return;
        }

        try {
            // 1. Check Chobo Shared Catalogue
            setLookupState('chobo');
            const res = await fetch(`${API_BASE_URL}/catalogue/lookup/${barcodeData}`);
            if (res.ok && res.status !== 204) {
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await res.json();
                    if (data) {
                        setName(data.name);
                        if (data.imageUrl) setImageUri(data.imageUrl);
                        
                        // Prefill Category
                        if (data.category) {
                            const matched = CATEGORIES.find(c => c.value.toLowerCase() === data.category.toLowerCase());
                            if (matched && matched.value !== 'Others') {
                                setCategory(matched.value);
                                setShowCustomInput(false);
                            } else {
                                setCategory('Others');
                                setCustomCategory(data.category === 'Others' ? '' : data.category);
                                setShowCustomInput(true);
                            }
                        }

                        setLookupState('done');
                        setShowLookupStatus(false);
                        setScannerVisible(false);
                        setModalVisible(true);
                        return;
                    }
                }
            }

            // 2. Fallback to Open Food Facts
            setLookupState('global');
            const offData = await fetchProductFromOFF(barcodeData);
            if (offData && offData.name) {
                setName(offData.name);
                if (offData.image) setImageUri(offData.image);
                
                // Prefill Category
                if (offData.category) {
                    const matched = CATEGORIES.find(c => c.value.toLowerCase() === offData.category.toLowerCase());
                    if (matched && matched.value !== 'Others') {
                        setCategory(matched.value);
                        setShowCustomInput(false);
                    } else {
                        setCategory('Others');
                        setCustomCategory(offData.category === 'Others' ? '' : offData.category);
                        setShowCustomInput(true);
                    }
                }

                // 3. Contribute to Chobo Catalogue so others can find it
                fetch(`${API_BASE_URL}/catalogue/contribute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        barcode: barcodeData,
                        name: offData.name,
                        imageUrl: offData.image,
                        brand: offData.brand,
                        category: offData.category
                    })
                }).catch(e => console.log('Contribution failed', e));
            }
        } catch (e) {
            console.error('Lookup failed', e);
        } finally {
            setShowLookupStatus(false);
            setLookupState('done');
            setScannerVisible(false);
            setModalVisible(true);
        }
    };

    const searchProductName = React.useMemo(
        () =>
          debounce(async (query: string) => {
            if (query.length < 2 || !isOnline) {
                setNameSuggestions([]);
                return;
            }
            try {
              const res = await fetch(
                `${API_BASE_URL}/catalogue/search?q=${encodeURIComponent(query)}`
              );
              const results = await res.json();
              setNameSuggestions(results.slice(0, 5));
            } catch {
              setNameSuggestions([]);
            }
          }, 300),
        [isOnline]
    );

    const handleNameChange = (text: string) => {
        setName(text);
        searchProductName(text);
    };

    const selectSuggestion = (suggestion: any) => {
        setName(suggestion.name);
        if (suggestion.imageUrl) setImageUri(suggestion.imageUrl);
        if (suggestion.barcode) setBarcode(suggestion.barcode);
        setNameSuggestions([]);
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });
        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    const takePhoto = async () => {
        if (!permission?.granted) {
            requestPermission();
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });
        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    const handleEdit = (product: any) => {
        setEditingProduct(product);
        setName(product.name);
        setPrice(product.price.toString());
        setStock(product.stock.toString());
        setBarcode(product.barcode || '');
        setImageUri(product.image_uri || null);
        // Section 1B — wire cost price into edit flow
        setCostPrice(product.cost_price != null ? product.cost_price.toString() : '');
        
        setNameError('');
        setPriceError('');
        setStockError('');

        if (product.category) {
            const matched = CATEGORIES.find(c => c.value.toLowerCase() === product.category.toLowerCase());
            if (matched && matched.value !== 'Others') {
                setCategory(matched.value);
                setShowCustomInput(false);
            } else {
                setCategory('Others');
                setCustomCategory(product.category === 'Others' ? '' : product.category);
                setShowCustomInput(true);
            }
        } else {
            setCategory('Provisions');
            setShowCustomInput(false);
        }

        setModalVisible(true);
    };

    const handleDelete = (product: any) => {
        setModal({
            visible: true,
            type: 'warning',
            title: 'Delete',
            subtitle: `Are you sure you want to delete ${product.name}?`,
            primaryLabel: 'Delete',
            onPrimary: async () => {
                await deleteProduct(product.id);
                loadData();
            },
            secondaryLabel: 'Cancel',
        });
    };

    const handleSave = async () => {
        let valid = true;
        setNameError('');
        setPriceError('');
        setStockError('');

        if (!name.trim()) {
            setNameError('Product name is required');
            valid = false;
        }
        if (!price.trim()) {
            setPriceError('Selling price is required');
            valid = false;
        } else if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
            setPriceError('Enter a valid price');
            valid = false;
        }
        if (!stock.trim()) {
            setStockError('Quantity is required');
            valid = false;
        } else if (isNaN(parseInt(stock, 10)) || parseInt(stock, 10) < 0) {
            setStockError('Enter a valid quantity');
            valid = false;
        }

        if (!valid) return;

        // Section 1D — block FREE tier at 50-product limit
        if (!editingProduct && tier === 'FREE') { // TODO: Remove before launch
            const count = await getProductCount(userId || '');
            if (count >= 50) {
                setModal({
                    visible: true,
                    type: 'warning',
                    title: 'Product limit reached',
                    subtitle: 'Free accounts can store up to 50 products. Upgrade to Growth for unlimited products.',
                    primaryLabel: 'Upgrade to Growth',
                    onPrimary: () => { setModal(null); setShowSubscriptionModal(true); },
                    secondaryLabel: 'Not now',
                    onSecondary: () => setModal(null),
                });
                return;
            }
        }
        // TODO: Remove FREE check before launch — restore tier gating

        setLoading(true);
        try {
            const finalCategory = category === 'Others' ? (customCategory.trim() || 'Others') : category;
            const parsedCostPrice = costPrice.trim() && !isNaN(parseFloat(costPrice)) ? parseFloat(costPrice) : null;
            
            if (editingProduct) {
                await updateProduct(editingProduct.id, name, parseFloat(price), parseInt(stock, 10), barcode || null, imageUri, parsedCostPrice, finalCategory);
            } else {
                await createProduct(uuidv4(), name, parseFloat(price), parseInt(stock, 10), barcode || null, imageUri, userId || '', parsedCostPrice, finalCategory);
            }

            // Contribute to the shared catalogue in background if online
            if (barcode && isOnline) {
                fetch(`${API_BASE_URL}/catalogue/contribute`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        barcode,
                        name,
                        imageUrl: imageUri,
                        category: finalCategory
                    })
                }).catch(e => console.log('Contribution failed', e));
            }

            setModalVisible(false);
            loadData();
        } catch (e: any) {
            if (e.message?.includes('UNIQUE')) {
                setModal({
                    visible: true,
                    type: 'error',
                    title: 'Error',
                    subtitle: 'Barcode already exists',
                });
            } else {
                setModal({
                    visible: true,
                    type: 'error',
                    title: 'Error',
                    subtitle: 'Could not save product',
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleOpenScanner = () => {
        if (!permission?.granted) {
            requestPermission();
            return;
        }
        setScannerVisible(true);
    };

    return (
        <View className="flex-1 bg-lightBackground">
            <Header title="Stock Hub" subtitle="Manage your inventory" showBell={true} />

            {isLookingUp && (
                <View className="bg-primaryLight p-2 items-center flex-row justify-center gap-2">
                    <ActivityIndicator size="small" color="#16A34A" />
                    <Text className="text-primaryDark text-xs font-bold">Looking up barcode globally...</Text>
                </View>
            )}

            {/* MINI DASHBOARD ROW */}
            <View className="flex-row gap-4 px-6 pt-6 pb-4">
                <View className="flex-1 bg-white p-4 rounded-3xl border border-border shadow-sm">
                    <Package size={20} color="#0F172A" />
                    <Text className="text-textPrimary font-black text-xl mt-2">{summary.total}</Text>
                    <Text className="text-textSecondary text-[10px] font-bold uppercase tracking-tight">Total Products</Text>
                </View>
                <View className="flex-1 bg-accentLight p-4 rounded-3xl border border-accent/20 shadow-sm">
                    <AlertTriangle size={20} color="#92400E" />
                    <Text className="text-accent font-black text-xl mt-2">{summary.low}</Text>
                    <Text className="text-[#92400E] text-[10px] font-bold uppercase tracking-tight">Low Stock</Text>
                </View>
                <View className="flex-1 bg-dangerLight p-4 rounded-3xl border border-danger/20 shadow-sm">
                    <CheckCircle size={20} color="#EF4444" />
                    <Text className="text-danger font-black text-xl mt-2">{summary.outOfStock}</Text>
                    <Text className="text-danger text-[10px] font-bold uppercase tracking-tight">Out</Text>
                </View>
            </View>

            {/* Tabs */}
            <View className="flex-row px-6 border-b border-border mb-4">
                <TouchableOpacity 
                    onPress={() => setActiveTab('inStock')}
                    className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'inStock' ? 'border-primary' : 'border-transparent'}`}
                >
                    <Text className={`font-black ${activeTab === 'inStock' ? 'text-primary' : 'text-textSecondary'}`}>In Stock</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => setActiveTab('addQuantity')}
                    className={`flex-1 py-3 items-center border-b-2 ${activeTab === 'addQuantity' ? 'border-primary' : 'border-transparent'}`}
                >
                    <View className="flex-row items-center gap-2">
                        <Text className={`font-black ${activeTab === 'addQuantity' ? 'text-primary' : 'text-textSecondary'}`}>Add Quantity</Text>
                        {summary.outOfStock > 0 && (
                            <View className="bg-danger px-1.5 py-0.5 rounded-full">
                                <Text className="text-white text-[10px] font-bold">{summary.outOfStock}</Text>
                            </View>
                        )}
                    </View>
                </TouchableOpacity>
            </View>

            {/* Search Bar & Filter */}
            <View className="px-6 pb-4 flex-row gap-3">
                <View className="flex-1 flex-row items-center bg-white rounded-2xl px-4 h-12 shadow-sm border border-border">
                    <Search size={18} color="#64748B" />
                    <TextInput placeholderTextColor="#94A3B8"
                        className="flex-1 ml-3 text-textPrimary font-bold text-sm"
                        placeholder="Search stock..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X size={16} color="#64748B" />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity onPress={() => setFilterVisible(true)} className="bg-white w-12 h-12 rounded-2xl items-center justify-center border border-border shadow-sm">
                    <Filter size={20} color="#0F172A" />
                </TouchableOpacity>
            </View>

            {/* Section 1C — FREE tier product limit banner */}
            {tier === 'FREE' && productCount >= 50 && ( // TODO: Remove before launch
                <TouchableOpacity
                    onPress={() => setShowSubscriptionModal(true)}
                    style={{
                        backgroundColor: '#FEF9C3',
                        borderColor: '#FACC15',
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 14,
                        marginHorizontal: 16,
                        marginBottom: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <AlertTriangle size={18} color="#92400E" />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#92400E' }}>
                            Product limit reached
                        </Text>
                        <Text style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>
                            You have {productCount} products. Upgrade to Growth for unlimited products.
                        </Text>
                    </View>
                    <ChevronRight size={16} color="#92400E" />
                </TouchableOpacity>
            )}

            <FlatList
                data={activeTab === 'inStock' ? filteredProducts.filter(p => p.stock > 0) : products.filter(p => p.stock <= 0)}
                keyExtractor={p => p.id}
                contentContainerStyle={{ padding: 24, paddingBottom: 150 }}
                ListEmptyComponent={
                    <View className="items-center justify-center py-20 opacity-30">
                        {activeTab === 'inStock' ? (
                            <>
                                <Package size={64} color="#64748B" />
                                <Text className="font-bold mt-4 text-center text-lg">Your stock is empty.{'\n'}Tap + to add items.</Text>
                            </>
                        ) : (
                            <>
                                <PackageCheck size={64} color="#64748B" />
                                <Text className="font-bold mt-4 text-center text-lg">No products pending quantity.</Text>
                            </>
                        )}
                    </View>
                }
                renderItem={({ item }) => (
                    <View className="bg-white rounded-2xl p-4 mb-4 border border-border flex-row items-center shadow-sm">
                        <View className="w-12 h-12 bg-primaryLight rounded-full items-center justify-center overflow-hidden border border-border/50">
                            {item.image_uri ? (
                                <Image source={{ uri: item.image_uri }} className="w-full h-full" resizeMode="cover" />
                            ) : (
                                <Text className="text-primaryDark font-bold text-lg">{getInitials(item.name)}</Text>
                            )}
                        </View>
                        <View className="flex-1 ml-4">
                            <Text className="font-bold text-sm text-textPrimary" numberOfLines={1}>{item.name}</Text>
                            <Text className="text-primary font-black mt-0.5">{formatAmount(item.price)}</Text>
                            {/* Section 2B — cost price nudge for FREE users */}
                            {tier === 'FREE' && !item.cost_price && ( // TODO: Remove before launch
                                <TouchableOpacity onPress={() => setShowSubscriptionModal(true)}>
                                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                                        Add cost price to track profit
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <View className="flex-col items-end gap-2">
                            <View className={`px-2 py-1 rounded-lg ${item.stock <= 5 ? 'bg-dangerLight' : 'bg-lightBackground'}`}>
                                <Text className={`text-[10px] font-black ${item.stock <= 5 ? 'text-danger' : 'text-textSecondary'}`}>{item.stock} left</Text>
                            </View>
                            <View className="flex-row gap-2">
                                {activeTab === 'inStock' ? (
                                    !isCashier && (
                                        <TouchableOpacity onPress={() => handleEdit(item)} className="p-1.5 bg-lightBackground rounded-lg">
                                            <Edit3 size={16} color="#64748B" />
                                        </TouchableOpacity>
                                    )
                                ) : (
                                    <TouchableOpacity 
                                        onPress={() => { setSelectedPendingProduct(item); setShowAddQtySheet(true); }} 
                                        className="bg-primary px-3 py-1.5 rounded-lg"
                                    >
                                        <Text className="text-white text-[10px] font-black">Add quantity</Text>
                                    </TouchableOpacity>
                                )}
                                {activeTab === 'inStock' && !isCashier && (
                                    <TouchableOpacity onPress={() => handleDelete(item)} className="p-1.5 bg-dangerLight rounded-lg">
                                        <Trash2 size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    </View>
                )}
            />

            {/* FAB — hidden from Cashiers */}
            {!isCashier && (
            <View className="absolute bottom-6 right-6 items-end">
                <TouchableOpacity 
                    onPress={handleOpenScanner}
                    className="bg-textPrimary w-12 h-12 rounded-2xl items-center justify-center shadow-lg mb-3"
                >
                    <ScanLine size={20} color="white" />
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => {
                        setEditingProduct(null);
                        setName('');
                        setPrice('');
                        setStock('');
                        setBarcode('');
                        setImageUri(null);
                        setCategory('Provisions');
                        setCustomCategory('');
                        setShowCustomInput(false);
                        setNameError('');
                        setPriceError('');
                        setStockError('');
                        setCostPrice(''); // Section 2A — reset cost price
                        setModalVisible(true);
                    }}
                    className="bg-primary w-14 h-14 rounded-full items-center justify-center shadow-lg shadow-primary/30"
                >
                    <Plus size={28} color="white" />
                </TouchableOpacity>
            </View>
            )}

            {/* ADD QUANTITY MODAL */}
            <Modal visible={showAddQtySheet} transparent animationType="slide">
                <View className="flex-1 bg-black/40 justify-end">
                    <View className="bg-white rounded-t-[40px] p-6 pb-12">
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <Text className="text-xl font-black text-center mb-4">
                            How many {selectedPendingProduct?.name} do you have?
                        </Text>
                        <TextInput
                            keyboardType="numeric"
                            placeholder="e.g. 24"
                            placeholderTextColor="#94A3B8"
                            value={newQuantity}
                            onChangeText={setNewQuantity}
                            className="bg-lightBackground border border-border p-4 rounded-xl font-bold mb-6 text-center text-2xl text-textPrimary"
                            autoFocus
                        />
                        <View className="flex-row gap-3">
                            <TouchableOpacity 
                                onPress={() => setShowAddQtySheet(false)}
                                className="flex-1 bg-lightBackground py-4 rounded-2xl items-center"
                            >
                                <Text className="text-textPrimary font-black text-lg">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                onPress={async () => {
                                    if (!newQuantity) return;
                                    await updateProductQuantity(selectedPendingProduct.id, parseInt(newQuantity, 10));
                                    setShowAddQtySheet(false);
                                    setNewQuantity('');
                                    setActiveTab('inStock');
                                    await loadData();
                                    if (isOnline) {
                                        pushSalesToBackend();
                                    }
                                }}
                                className="flex-2 bg-primary py-4 rounded-2xl items-center"
                            >
                                <Text className="text-white font-black text-lg">Save Stock</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* SCANNER MODAL */}
            <Modal visible={scannerVisible} transparent animationType="slide">
                <View className="flex-1 bg-black justify-end">
                    <View className="flex-row items-center justify-between px-6 pt-12 pb-4">
                        <Text className="text-white font-black text-xl">Scan to Add/Edit</Text>
                        <TouchableOpacity onPress={() => setScannerVisible(false)} className="bg-white/20 p-2 rounded-full">
                            <X size={24} color="white" />
                        </TouchableOpacity>
                    </View>
                    <View className="flex-1 items-center justify-center">
                        <View className="w-[80%] aspect-square rounded-3xl overflow-hidden border-4 border-primary">
                            <CameraView 
                                style={{ flex: 1 }}
                                facing="back"
                                onBarcodeScanned={({ data }) => {
                                    if (showLookupStatus) return;
                                    handleLookupFlow(data);
                                }} 
                                barcodeScannerSettings={{
                                    barcodeTypes: ['ean13', 'ean8', 'code128', 'upc_a', 'upc_e', 'qr']
                                }}
                            />
                        </View>
                        {showLookupStatus && lookupState !== 'idle' && lookupState !== 'done' && (
                            <View className="mt-6 flex-row items-center gap-3 bg-white/10 px-4 py-2 rounded-full">
                                <ActivityIndicator size="small" color="#16A34A" />
                                <Text className="text-white font-bold">
                                    Loading...
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ADD/EDIT PRODUCT SHEET */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <View className="flex-1 bg-black/40 justify-end">
                    <View className="bg-white rounded-t-[40px] p-6" style={{ paddingBottom: Math.max(insets.bottom, 24) }}>
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-black text-textPrimary">{editingProduct ? 'Edit stock' : 'Add to Stock'}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)} className="bg-lightBackground p-2 rounded-full">
                                <X size={24} color="#0F172A" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Image Selection Area with Absolute Delete X Overlay */}
                            <View className="w-24 h-24 self-center mb-6 relative">
                                <TouchableOpacity onPress={() => {
                                    setModal({
                                        visible: true,
                                        type: 'info',
                                        title: 'Product Image',
                                        subtitle: 'Choose an option',
                                        primaryLabel: 'Take Photo',
                                        onPrimary: takePhoto,
                                        secondaryLabel: 'Choose from Gallery',
                                        onSecondary: pickImage,
                                    });
                                }} className="w-full h-full bg-lightBackground rounded-3xl items-center justify-center border border-border overflow-hidden shadow-sm">
                                    {imageUri ? (
                                        <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
                                    ) : (
                                        <View className="items-center justify-center">
                                            <Camera size={24} color="#64748B" />
                                            <Text className="text-[10px] text-textSecondary font-bold mt-1">Add Image</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                                {imageUri && (
                                    <TouchableOpacity 
                                        onPress={() => setImageUri(null)} 
                                        className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5 z-50 shadow-md"
                                    >
                                        <X size={12} color="white" />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Name and suggestions */}
                            <View className="z-50 mb-2">
                                <TextInput placeholderTextColor="#94A3B8" 
                                    className={`bg-lightBackground border p-4 rounded-xl font-bold text-textPrimary ${nameError ? 'border-red-500' : 'border-border'}`} 
                                    placeholder="Product Name" 
                                    value={name} 
                                    onChangeText={(t) => { handleNameChange(t); if (nameError) setNameError(''); }} 
                                />
                                {nameError ? <Text className="text-red-500 font-bold text-[10px] mt-1 ml-1">{nameError}</Text> : null}
                                {nameSuggestions.length > 0 && (
                                    <View className="bg-white border border-border rounded-xl mt-1 shadow-lg overflow-hidden">
                                        {nameSuggestions.map((s, idx) => (
                                            <TouchableOpacity 
                                                key={idx} 
                                                onPress={() => selectSuggestion(s)}
                                                className="flex-row items-center p-3 border-b border-border last:border-0"
                                            >
                                                <View className="w-8 h-8 bg-primaryLight rounded-full items-center justify-center overflow-hidden mr-3">
                                                    {s.imageUrl ? (
                                                        <Image source={{ uri: s.imageUrl }} className="w-full h-full" />
                                                    ) : (
                                                        <Text className="text-primaryDark font-bold text-xs">{getInitials(s.name)}</Text>
                                                    )}
                                                </View>
                                                <View>
                                                    <Text className="font-bold text-sm text-textPrimary">{s.name}</Text>
                                                    {s.brand && <Text className="text-[10px] text-textSecondary">{s.brand}</Text>}
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>

                            {/* Price and Stock Inputs with dynamic inline errors and red borders */}
                            <View className="flex-row gap-4 mb-4">
                                <View className="flex-1">
                                    <TextInput placeholderTextColor="#94A3B8" 
                                        className={`w-full bg-lightBackground border p-4 rounded-xl font-bold text-textPrimary ${priceError ? 'border-red-500' : 'border-border'}`} 
                                        placeholder={`Price (${symbol})`}
                                        keyboardType="numeric" 
                                        value={price} 
                                        onChangeText={(t) => { setPrice(t); if (priceError) setPriceError(''); }} 
                                    />
                                    {priceError ? <Text className="text-red-500 font-bold text-[10px] mt-1 ml-1">{priceError}</Text> : null}
                                </View>
                                <View className="flex-1">
                                    <TextInput placeholderTextColor="#94A3B8" 
                                        className={`w-full bg-lightBackground border p-4 rounded-xl font-bold text-textPrimary ${stockError ? 'border-red-500' : 'border-border'}`} 
                                        placeholder="Quantity" 
                                        keyboardType="numeric" 
                                        value={stock} 
                                        onChangeText={(t) => { setStock(t); if (stockError) setStockError(''); }} 
                                    />
                                    {stockError ? <Text className="text-red-500 font-bold text-[10px] mt-1 ml-1">{stockError}</Text> : null}
                                </View>
                            </View>

                            {/* Section 2A — Cost Price field (Growth+ only, locked for FREE) */}
                            {(tier === 'GROWTH' || tier === 'BUSINESS' || tier === 'ENTERPRISE') ? ( // TODO: Remove before launch
                                <View style={{ marginBottom: 16 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginLeft: 2 }}>Cost price (optional)</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14 }}>
                                        <Text style={{ color: '#64748B', fontWeight: '700', marginRight: 4 }}>{symbol}</Text>
                                        <TextInput
                                            value={costPrice}
                                            onChangeText={setCostPrice}
                                            keyboardType="numeric"
                                            placeholder="0.00"
                                            placeholderTextColor="#94A3B8"
                                            style={{ flex: 1, paddingVertical: 14, fontSize: 15, fontWeight: '600', color: '#0F172A' }}
                                        />
                                    </View>
                                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, marginLeft: 2 }}>Used to calculate your profit margin</Text>
                                </View>
                            ) : (
                                // FIX 9 — Locked cost price: open PaywallModal instead of going straight to SubscriptionScreen
                                <TouchableOpacity
                                    onPress={() => setPaywallVisible(true)}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: 14,
                                        backgroundColor: '#F8FAFC',
                                        borderRadius: 12,
                                        borderWidth: 1,
                                        borderColor: '#E5E7EB',
                                        borderStyle: 'dashed',
                                        marginBottom: 16,
                                    }}
                                >
                                    <Lock size={14} color="#64748B" />
                                    <Text style={{ flex: 1, fontSize: 13, color: '#64748B' }}>
                                        Cost price tracking — Growth plan
                                    </Text>
                                    <ChevronRight size={14} color="#64748B" />
                                </TouchableOpacity>
                            )}

                            {/* Horizontal Category Selector Chips */}
                            <Text className="text-textSecondary text-[10px] font-black uppercase mb-2 ml-1">Category</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
                                <View className="flex-row gap-2">
                                    {CATEGORIES.map((cat) => (
                                        <TouchableOpacity
                                            key={cat.value}
                                            onPress={() => {
                                                setCategory(cat.value);
                                                setShowCustomInput(cat.value === 'Others');
                                            }}
                                            className={`px-4 py-2 rounded-full border ${category === cat.value ? 'bg-primary border-primary' : 'bg-lightBackground border-border'}`}
                                        >
                                            <Text className={`font-black text-[11px] ${category === cat.value ? 'text-white' : 'text-textPrimary'}`}>
                                                {cat.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            {/* Conditional Custom Category Input */}
                            {showCustomInput && (
                                <TextInput placeholderTextColor="#94A3B8"
                                    className="bg-lightBackground border border-border p-4 rounded-xl font-bold mb-4 text-textPrimary"
                                    placeholder="Enter Custom Category"
                                    value={customCategory}
                                    onChangeText={setCustomCategory}
                                />
                            )}

                            {/* Barcode input */}
                            <View className="flex-row items-center bg-lightBackground border border-border rounded-xl pr-2 mb-8">
                                <TextInput placeholderTextColor="#94A3B8" 
                                    className="flex-1 p-4 font-bold text-textPrimary" 
                                    placeholder="Barcode (Optional)" 
                                    value={barcode} 
                                    onChangeText={setBarcode} 
                                />
                                <TouchableOpacity onPress={() => { setModalVisible(false); handleOpenScanner(); }} className="p-3">
                                    <ScanLine size={20} color="#16A34A" />
                                </TouchableOpacity>
                            </View>

                            {/* Save action */}
                            <TouchableOpacity onPress={handleSave} className="bg-primary py-4 rounded-2xl items-center shadow-sm">
                                {loading ? <ActivityIndicator color="white" /> : <Text className="text-white font-black text-lg">{editingProduct ? 'Update Product' : 'Save Product'}</Text>}
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* FILTER SHEET */}
            <Modal visible={filterVisible} transparent animationType="slide">
                <View className="flex-1 bg-black/40 justify-end">
                    <View className="bg-white rounded-t-[40px] p-6 pb-12">
                        <View className="w-12 h-1.5 bg-border rounded-full self-center mb-6" />
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-black">Sort & Filter</Text>
                            <TouchableOpacity onPress={() => setFilterVisible(false)} className="bg-lightBackground p-2 rounded-xl">
                                <X size={24} color="black" />
                            </TouchableOpacity>
                        </View>
                        <Text className="text-textSecondary text-[10px] font-black uppercase mb-3">Sort by</Text>
                        <View className="flex-row flex-wrap gap-2 mb-8">
                            {['Newest', 'Low Stock', 'Most Sold', 'Price (High)', 'Price (Low)'].map(s => (
                                <TouchableOpacity 
                                    key={s} 
                                    onPress={() => setSortBy(s)}
                                    className={`px-4 py-3 rounded-xl border ${sortBy === s ? 'bg-primary border-primary' : 'bg-lightBackground border-border'}`}
                                >
                                    <Text className={`font-black text-[12px] ${sortBy === s ? 'text-white' : 'text-textPrimary'}`}>{s}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <TouchableOpacity onPress={() => setFilterVisible(false)} className="bg-textPrimary py-4 rounded-2xl items-center">
                            <Text className="text-white font-black text-lg">Apply Filters</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
            {/* FIX 9 — PaywallModal for locked Growth features */}
            <PaywallModal
                visible={paywallVisible}
                onClose={() => setPaywallVisible(false)}
                featureName="Cost price tracking"
                featureDescription="Track what you paid for each product to see your real profit margin."
                requiredTier="GROWTH"
                onUpgrade={() => {
                    setPaywallVisible(false);
                    setShowSubscriptionModal(true);
                }}
            />
        </View>
    );
}
