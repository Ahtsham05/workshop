import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { AppDispatch, RootState } from '@/stores/store';
import { fetchAllProducts } from '@/stores/product.slice';
import { fetchSuppliers } from '@/stores/supplier.slice';
import { PurchasePanel, PurchaseList } from './components';
import { ProductCatalog } from './components/product-catalog';
import { toast } from 'sonner';
import { useLanguage } from '@/context/language-context';
import { usePermissions } from '@/context/permission-context';
import type { Product, Category } from '../invoice/index';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Columns2, LayoutGrid, PauseCircle, Trash2, ClipboardList, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeSuppliersList } from './utils/catalog-helpers';
import {
  clearPurchaseWorkspace,
  savePurchaseWorkspace,
  loadPurchaseWorkspace,
  listPurchaseHeld,
  pushPurchaseHeld,
  removePurchaseHeld,
  newHoldId,
  isPurchaseDraftSnapshotEmpty,
  POS_HOLD_MAX_AGE_MS,
  type PurchaseHeldRecord,
} from '@/lib/pos-hold-storage';

// Purchase Item Interface - simpler than invoice, no profit tracking
export interface PurchaseItem {
  product: Product;
  quantity: number;
  unit?: string; // Unit of measurement
  conversionFactor?: number;
  stockQuantity?: number;
  purchasePrice: number; // price we bought it at (cost)
  sellingPrice?: number; // price we will sell it at (retail)
  isManualEntry?: boolean; // flag for manual product selection
  imeis?: string[]; // IMEI/serial numbers received, when product.trackImei is true
}

// Supplier Interface
export interface Supplier {
  _id: string;
  name: string;
  nameUrdu?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  balance?: number;
  picture?: { url?: string; publicId?: string };
}

export function createEmptyPurchaseManualItem(): PurchaseItem {
  return {
    product: {
      id: '',
      _id: '',
      name: '',
      price: 0,
      cost: 0,
      stockQuantity: 0,
    } as Product,
    quantity: 1,
    purchasePrice: 0,
    isManualEntry: true,
  };
}

// Purchase Interface - no types, no payments
export interface Purchase {
  _id?: string;
  invoiceNumber: string;
  supplier: Supplier;
  items: PurchaseItem[];
  subtotal: number;
  total: number;
  paidAmount?: number;
  balance?: number;
  paymentType?: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Credit' | 'Wallet';
  walletType?: string;
  notes?: string;
  date: string;
  createdAt?: string;
  updatedAt?: string;
}

type ViewType = 'create' | 'list' | 'details';

const PURCHASE_SHOW_CATALOG_KEY = 'purchaseShowProductCatalog';

const getInitialShowProductCatalog = (): boolean => {
  const stored = localStorage.getItem(PURCHASE_SHOW_CATALOG_KEY);
  if (stored === null) return true;
  return stored === 'true';
};

const PurchaseInvoicePage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { supplierId?: string };
  const suppliersData = useSelector((state: RootState) => state.supplier.data);
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const [currentView, setCurrentView] = useState<ViewType>('create');
  const [purchase, setPurchase] = useState<Purchase>({
    invoiceNumber: '',
    supplier: {} as Supplier,
    items: [createEmptyPurchaseManualItem()],
    subtotal: 0,
    total: 0,
    paidAmount: 0,
    balance: 0,
    paymentType: 'Cash',
    walletType: undefined,
    notes: '',
    date: new Date().toISOString(),
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  
  // State for products and categories
  const [products, setProducts] = useState<Product[]>([]);
  const [categorizedProducts, setCategorizedProducts] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  
  // UI state
  const [showImages, setShowImages] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductCatalog, setShowProductCatalog] = useState(getInitialShowProductCatalog);

  const toggleProductCatalog = useCallback(() => {
    setShowProductCatalog((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PURCHASE_SHOW_CATALOG_KEY, String(next));
      } catch {
        /* quota / private mode */
      }
      return next;
    });
  }, []);

  const [heldSheetOpen, setHeldSheetOpen] = useState(false);
  const [heldUiEpoch, setHeldUiEpoch] = useState(0);
  const purchaseAutosaveRecoveredRef = useRef(false);

  const purchasePersistRef = useRef({
    loading,
    currentView,
    isEditing,
    purchase,
    showImages,
    searchTerm,
    showProductCatalog,
  });
  purchasePersistRef.current = {
    loading,
    currentView,
    isEditing,
    purchase,
    showImages,
    searchTerm,
    showProductCatalog,
  };

  const persistPurchaseDraftSync = useCallback(() => {
    const s = purchasePersistRef.current;
    if (s.loading) return;
    if (s.currentView !== 'create' || s.isEditing) return;
    if (isPurchaseDraftSnapshotEmpty(s.purchase as unknown as Record<string, unknown>)) {
      clearPurchaseWorkspace();
      return;
    }
    savePurchaseWorkspace({
      purchase: s.purchase as unknown as Record<string, unknown>,
      showImages: s.showImages,
      searchTerm: s.searchTerm,
      showProductCatalog: s.showProductCatalog,
    });
  }, []);

  const resetPurchaseForm = useCallback(() => {
    setPurchase({
      invoiceNumber: '',
      supplier: {} as Supplier,
      items: [createEmptyPurchaseManualItem()],
      subtotal: 0,
      total: 0,
      paidAmount: 0,
      balance: 0,
      paymentType: 'Cash',
      walletType: undefined,
      notes: '',
      date: new Date().toISOString(),
    });
  }, []);

  const purchaseHeldList = useMemo(() => listPurchaseHeld(), [heldUiEpoch]);

  useEffect(() => {
    if (loading) return;
    persistPurchaseDraftSync();
  }, [
    loading,
    purchase,
    showImages,
    searchTerm,
    showProductCatalog,
    currentView,
    isEditing,
    persistPurchaseDraftSync,
  ]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') persistPurchaseDraftSync();
    };
    const onPageLifecycle = () => persistPurchaseDraftSync();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageLifecycle);
    window.addEventListener('beforeunload', onPageLifecycle);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageLifecycle);
      window.removeEventListener('beforeunload', onPageLifecycle);
    };
  }, [persistPurchaseDraftSync]);

  useEffect(() => {
    return () => persistPurchaseDraftSync();
  }, [persistPurchaseDraftSync]);

  useLayoutEffect(() => {
    if (loading) return;
    if (currentView !== 'create' || isEditing) return;
    if (purchaseAutosaveRecoveredRef.current) return;
    purchaseAutosaveRecoveredRef.current = true;

    const ws = loadPurchaseWorkspace();
    if (
      !ws ||
      isPurchaseDraftSnapshotEmpty(ws.purchase) ||
      Date.now() - ws.updatedAt > POS_HOLD_MAX_AGE_MS
    ) {
      if (ws && Date.now() - ws.updatedAt > POS_HOLD_MAX_AGE_MS) clearPurchaseWorkspace();
      return;
    }
    setPurchase(ws.purchase as unknown as Purchase);
    setShowImages(ws.showImages);
    setSearchTerm(ws.searchTerm);
    setShowProductCatalog(ws.showProductCatalog ?? true);
    toast.success(t('purchase_draft_restored'));
  }, [loading, currentView, isEditing, t]);

  const manualHoldPurchase = useCallback(() => {
    if (currentView !== 'create' || isEditing) return;
    if (isPurchaseDraftSnapshotEmpty(purchase as unknown as Record<string, unknown>)) {
      toast.error(t('nothing_to_hold'));
      return;
    }
    const purchaseLineTotal = purchase.items.reduce(
      (sum, item) => sum + item.quantity * (item.purchasePrice || 0),
      0,
    );
    const purchaseForHold: Purchase = {
      ...purchase,
      subtotal: purchaseLineTotal,
      total: purchaseLineTotal,
    };
    const supName =
      purchase.supplier?.name?.trim() ||
      t('supplier');
    const lineCount = purchase.items.filter((it) => {
      const pid = it.product?.id || (it.product as { _id?: string })._id;
      return (pid && String(pid).trim()) || Boolean(it.product?.name?.trim());
    }).length;
    const label = `${supName} · Rs ${purchaseLineTotal.toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} · ${lineCount}`;
    const record: PurchaseHeldRecord = {
      id: newHoldId(),
      label,
      savedAt: Date.now(),
      snapshot: {
        purchase: purchaseForHold as unknown as Record<string, unknown>,
        showImages,
        searchTerm,
        showProductCatalog,
      },
    };
    pushPurchaseHeld(record);
    clearPurchaseWorkspace();
    resetPurchaseForm();
    setHeldUiEpoch((x) => x + 1);
    toast.success(t('purchase_draft_saved_to_held'));
  }, [
    currentView,
    isEditing,
    purchase,
    showImages,
    searchTerm,
    showProductCatalog,
    t,
    resetPurchaseForm,
  ]);

  const resumePurchaseHeld = useCallback(
    (id: string) => {
      const entry = listPurchaseHeld().find((h) => h.id === id);
      if (!entry) return;
      setPurchase(entry.snapshot.purchase as unknown as Purchase);
      setShowImages(entry.snapshot.showImages);
      setSearchTerm(entry.snapshot.searchTerm);
      setShowProductCatalog(entry.snapshot.showProductCatalog ?? true);
      removePurchaseHeld(id);
      clearPurchaseWorkspace();
      setHeldUiEpoch((x) => x + 1);
      setHeldSheetOpen(false);
      toast.success(t('held_restored'));
    },
    [t],
  );

  const deletePurchaseHeld = useCallback(
    (id: string) => {
      removePurchaseHeld(id);
      setHeldUiEpoch((x) => x + 1);
      toast.success(t('held_deleted'));
    },
    [t],
  );

  // Fetch data on mount
  useEffect(() => {
    console.log('=== PURCHASE INVOICE COMPONENT MOUNT ===');
    console.log('Fetching products and suppliers data');
    
    setLoading(true);
    
    // Fetch products
    const fetchProductsPromise = dispatch(fetchAllProducts({}))
      .then((data) => {
        console.log('Products response:', data);
        let productsData = [];
        
        if (data.payload?.results) {
          productsData = data.payload.results;
        } else if (data.payload) {
          productsData = Array.isArray(data.payload) ? data.payload : [];
        } else {
          productsData = [];
        }
        
        console.log('Processed products data:', productsData.length, 'products');
        setProducts(productsData);
        console.log('Products state updated');
      })
      .catch((error) => {
        console.error('Error fetching products:', error);
        setProducts([]);
        toast.error('Failed to fetch products');
      });

    // Fetch suppliers
    const fetchSuppliersPromise = dispatch(fetchSuppliers({ page: 1, limit: 1000 }))
      .catch((error) => {
        console.error('Error fetching suppliers:', error);
        toast.error('Failed to fetch suppliers');
      });

    Promise.all([fetchProductsPromise, fetchSuppliersPromise])
      .finally(() => {
        setLoading(false);
      });
  }, [dispatch]);

  useEffect(() => {
    const supplierId = search.supplierId?.trim();
    if (!supplierId || currentView !== 'create' || isEditing) return;
    const suppliers = normalizeSuppliersList(suppliersData);
    const match = suppliers.find(
      (s) => s._id === supplierId || (s as { id?: string }).id === supplierId,
    );
    if (!match) return;
    const sid = match._id || (match as { id?: string }).id;
    if (!sid) return;
    setPurchase((prev) => {
      const currentId = prev.supplier?._id || (prev.supplier as { id?: string })?.id;
      if (currentId === sid) return prev;
      return {
        ...prev,
        supplier: {
          _id: sid,
          name: match.name,
          nameUrdu: match.nameUrdu,
          phone: match.phone,
          whatsapp: (match as { whatsapp?: string }).whatsapp,
          email: match.email,
          address: match.address,
          balance: match.balance,
          picture: match.picture,
        },
        paymentType: 'Credit',
      };
    });
  }, [search.supplierId, suppliersData, currentView, isEditing]);
  
  // Group products by category
  useEffect(() => {
    const categoryMap = new Map<string, Category>();
    
    products.forEach(product => {
      let categoryId = 'other';
      let categoryName = 'Other';
      
      // Ensure stockQuantity exists and preserve original product structure
      // Don't add id property if _id doesn't exist - keep the product as-is
      const productWithStock = {
        ...product,
        stockQuantity: product.stockQuantity || 0
      };
      
      // Check for category in different possible formats
      if (product.category) {
        categoryId = product.category._id;
        categoryName = product.category.name;
      } else if (product.categories && product.categories.length > 0) {
        categoryId = product.categories[0]._id;
        categoryName = product.categories[0].name;
      }
      
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          _id: categoryId,
          name: categoryName,
          products: []
        });
      }
      
      categoryMap.get(categoryId)!.products.push(productWithStock);
    });
    
    setCategorizedProducts(Array.from(categoryMap.values()));
  }, [products]);

  // Add product to purchase
  const addToPurchase = useCallback((product: Product, quantity: number = 1) => {
    console.log('Adding product to purchase:', product);
    console.log('Product id:', product.id || (product as any)._id);
    
    setPurchase((prev) => {
      const productIdToMatch = product.id || (product as any)._id;
      const existingIndex = prev.items.findIndex((item) => {
        const itemProductId = item.product.id || (item.product as any)._id;
        return itemProductId === productIdToMatch;
      });

      if (existingIndex >= 0) {
        const updated = [...prev.items];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return { ...prev, items: updated };
      }

      const newItem: PurchaseItem = {
        product,
        quantity,
        unit: product.unit || 'pcs',
        conversionFactor: 1,
        stockQuantity: quantity,
        purchasePrice: product.cost || product.price,
        sellingPrice: product.price || 0,
      };

      return { ...prev, items: [...prev.items, newItem] };
    });
  }, []);

  // Remove item from purchase
  const removeFromPurchase = useCallback((productId: string) => {
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.filter((item) => {
        const itemProductId = item.product.id || (item.product as any)._id;
        return itemProductId !== productId;
      }),
    }));
  }, []);

  // Update quantity
  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) return;
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const itemProductId = item.product.id || (item.product as any)._id;
        return itemProductId === productId ? { ...item, quantity } : item;
      }),
    }));
  }, []);

  // Update purchase price
  const updatePurchasePrice = useCallback((productId: string, price: number) => {
    if (price < 0) return;
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const itemProductId = item.product.id || (item.product as any)._id;
        return itemProductId === productId ? { ...item, purchasePrice: price } : item;
      }),
    }));
  }, []);

  // Update selling price
  const updateSellingPrice = useCallback((productId: string, price: number) => {
    if (price < 0) return;
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const itemProductId = item.product.id || (item.product as any)._id;
        return itemProductId === productId ? { ...item, sellingPrice: price } : item;
      }),
    }));
  }, []);

  // Calculate totals
  const calculateTotals = useCallback(() => {
    const subtotal = purchase.items.reduce(
      (sum, item) => sum + (item.quantity * (item.purchasePrice || 0)),
      0
    );
    return {
      subtotal,
      total: subtotal,
    };
  }, [purchase.items]);

  // Handle barcode search
  const handleBarcodeSearch = useCallback(
    (barcode: string) => {
      const product = products.find(p => p.barcode === barcode);
      if (product) {
        addToPurchase(product);
        setSearchTerm('');
        toast.success(`Product found: ${product.name}`);
      } else {
        toast.error('Product not found');
      }
    },
    [products, addToPurchase]
  );

  // Switch to list view
  const handleBackToList = useCallback(() => {
    clearPurchaseWorkspace();
    setCurrentView('list');
    setIsEditing(false);
    setEditingPurchase(null);
    setPurchase({
      invoiceNumber: '',
      supplier: {} as Supplier,
      items: [createEmptyPurchaseManualItem()],
      subtotal: 0,
      total: 0,
      paidAmount: 0,
      balance: 0,
      paymentType: 'Cash',
      walletType: undefined,
      notes: '',
      date: new Date().toISOString(),
    });
  }, []);

  // Switch to create view
  const handleCreateNew = useCallback(() => {
    clearPurchaseWorkspace();
    setCurrentView('create');
    setIsEditing(false);
    setEditingPurchase(null);
    setPurchase({
      invoiceNumber: '',
      supplier: {} as Supplier,
      items: [createEmptyPurchaseManualItem()],
      subtotal: 0,
      total: 0,
      paidAmount: 0,
      balance: 0,
      paymentType: 'Cash',
      walletType: undefined,
      notes: '',
      date: new Date().toISOString(),
    });
  }, []);

  // Handle edit
  const handleEdit = useCallback((purchaseToEdit: any) => {
    // Check permission before allowing edit
    if (!hasPermission('editPurchases' as any)) {
      toast.error(t('no_permission_edit_purchase') || 'You do not have permission to edit purchases');
      return;
    }

    clearPurchaseWorkspace();
    
    console.log('Editing purchase:', purchaseToEdit);
    setCurrentView('create');
    setIsEditing(true);
    setEditingPurchase(purchaseToEdit);
    
    // Transform items from backend format to frontend format
    const transformedItems = (purchaseToEdit.items || []).map((item: any) => ({
      product: item.product, // Already populated by backend
      quantity: item.quantity,
      unit: item.unit || item.product?.unit,
      conversionFactor: item.conversionFactor,
      stockQuantity: item.stockQuantity,
      purchasePrice: item.priceAtPurchase, // Map priceAtPurchase to purchasePrice
      sellingPrice: item.sellingPriceAtPurchase || item.product?.price || 0,
      imeis: item.imeis || [],
    }));
    
    console.log('Transformed items:', transformedItems);
    
    setPurchase({
      ...purchaseToEdit,
      items: transformedItems,
      supplier: purchaseToEdit.supplier || ({} as Supplier),
      date: purchaseToEdit.purchaseDate || purchaseToEdit.date || new Date().toISOString(),
      paymentType: purchaseToEdit.paymentType || 'Cash', // Ensure paymentType has valid default
      walletType: purchaseToEdit.walletType || undefined,
    });
  }, []);

  const refreshProductsAfterPurchase = useCallback(() => {
    setProducts(prevProducts => {
      const updated = prevProducts.map(p => {
        const productId = p.id || (p as any)._id
        const purchasedItem = purchase.items.find(item => {
          const itemProductId = item.product.id || (item.product as any)._id
          return itemProductId === productId
        })
        if (!purchasedItem) return p
        const addedStock = purchasedItem.quantity * (purchasedItem.conversionFactor || 1)
        return {
          ...p,
          stockQuantity: (p.stockQuantity || 0) + addedStock,
          cost: purchasedItem.purchasePrice > 0 ? purchasedItem.purchasePrice : p.cost,
          price: (purchasedItem.sellingPrice ?? 0) > 0 ? purchasedItem.sellingPrice! : p.price,
        }
      })
      return updated
    })

    dispatch(fetchAllProducts({}))
      .then((data: any) => {
        let productsData: Product[] = []
        if (data.payload?.results) {
          productsData = data.payload.results
        } else if (data.payload) {
          productsData = Array.isArray(data.payload) ? data.payload : []
        }
        if (productsData.length > 0) {
          setProducts(productsData)
        }
      })
      .catch((err: any) => console.error('Failed to refresh products after purchase:', err))
  }, [dispatch, purchase.items])

  // Handle save success callback
  const handleSaveSuccess = useCallback(
    (mode: 'create' | 'update' = 'update') => {
      refreshProductsAfterPurchase()

      if (mode === 'create') {
        clearPurchaseWorkspace()
        setIsEditing(false)
        setEditingPurchase(null)
        resetPurchaseForm()
        return
      }

      handleBackToList()
    },
    [refreshProductsAfterPurchase, resetPurchaseForm, handleBackToList],
  )

  return (
    <div className="h-full w-full">
      {currentView === 'list' ? (
        <PurchaseList
          onBack={() => setCurrentView('create')}
          onCreateNew={handleCreateNew}
          onEdit={handleEdit}
        />
      ) : currentView === 'create' ? (
        <div
          className={cn(
            'flex h-full min-h-0 flex-col p-4',
            showProductCatalog ? 'gap-4' : 'gap-3 pt-3',
          )}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="order-2 max-w-xl text-xs leading-snug text-muted-foreground sm:order-1">
              {t('autosave_hint')}
            </p>
            <div className="flex flex-wrap justify-end gap-2 order-1 sm:order-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 shadow-sm"
                onClick={() => setCurrentView('list')}
              >
                <History className="h-4 w-4 shrink-0" aria-hidden />
                Purchase history
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 shadow-sm"
                onClick={() => navigate({ to: '/purchase-orders' })}
              >
                <ClipboardList className="h-4 w-4 shrink-0" aria-hidden />
                Purchase orders
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 shadow-sm"
                onClick={manualHoldPurchase}
              >
                <PauseCircle className="h-4 w-4 shrink-0" aria-hidden />
                {t('hold_purchase')}
              </Button>

              <Sheet open={heldSheetOpen} onOpenChange={setHeldSheetOpen}>
                <SheetTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-2 shadow-sm">
                    {t('held_drafts')}
                    {purchaseHeldList.length > 0 ? (
                      <Badge variant="secondary" className="px-1.5 py-0">
                        {purchaseHeldList.length}
                      </Badge>
                    ) : null}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-md">
                  <SheetHeader className="text-left">
                    <SheetTitle>{t('held_drafts_sheet_title_purchases')}</SheetTitle>
                    {purchaseHeldList.length === 0 ? (
                      <SheetDescription className="text-xs">{t('held_drafts_empty')}</SheetDescription>
                    ) : (
                      <SheetDescription className="sr-only">{t('held_drafts_sheet_title_purchases')}</SheetDescription>
                    )}
                  </SheetHeader>
                  <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                    {purchaseHeldList.length === 0
                      ? null
                      : purchaseHeldList.map((h) => (
                          <div
                            key={h.id}
                            className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-sm"
                          >
                            <p className="text-sm font-medium leading-snug">{h.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(h.savedAt).toLocaleString()}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" type="button" onClick={() => resumePurchaseHeld(h.id)}>
                                {t('resume_held')}
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                variant="outline"
                                className="gap-1"
                                onClick={() => deletePurchaseHeld(h.id)}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                                {t('held_remove')}
                              </Button>
                            </div>
                          </div>
                        ))}
                  </div>
                </SheetContent>
              </Sheet>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 shadow-sm"
                onClick={toggleProductCatalog}
                aria-pressed={showProductCatalog}
                aria-expanded={showProductCatalog}
                aria-label={
                  showProductCatalog ? t('hide_product_catalog') : t('show_product_catalog')
                }
              >
                {showProductCatalog ? (
                  <>
                    <Columns2 className="h-4 w-4 shrink-0" aria-hidden />
                    {t('hide_product_catalog')}
                  </>
                ) : (
                  <>
                    <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
                    {t('show_product_catalog')}
                  </>
                )}
              </Button>
            </div>
          </div>

          <div
            className={cn(
              'grid min-h-0 w-full flex-1 items-start content-start',
              showProductCatalog ? 'grid-cols-1 gap-6 lg:grid-cols-2' : 'grid-cols-1 gap-4',
            )}
          >
          {/* Left Column - Purchase Panel */}
          <div
            className={cn(
              'min-w-0 space-y-4 pb-6',
              !showProductCatalog &&
                'mx-auto w-full max-w-2xl sm:max-w-3xl 2xl:max-w-4xl',
            )}
          >
            <PurchasePanel
              purchase={purchase}
              setPurchase={setPurchase}
              updateQuantity={updateQuantity}
              removeFromPurchase={removeFromPurchase}
              updatePurchasePrice={updatePurchasePrice}
              updateSellingPrice={updateSellingPrice}
              calculateTotals={calculateTotals}
              onBackToList={handleBackToList}
              onSaveSuccess={handleSaveSuccess}
              isEditing={isEditing}
              editingPurchase={editingPurchase}
              products={products}
              productsLoading={loading}
              setProducts={setProducts}
            />
          </div>

          {/* Right Column - Product Catalog */}
          {showProductCatalog && (
          <div className="min-w-0 space-y-4 max-h-[2000px] overflow-y-auto pb-6">
            <ProductCatalog
              categorizedProducts={categorizedProducts}
              loading={loading}
              showImages={showImages}
              setShowImages={setShowImages}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onAddToInvoice={addToPurchase}
              onBarcodeSearch={handleBarcodeSearch}
            />
          </div>
          )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PurchaseInvoicePage;
