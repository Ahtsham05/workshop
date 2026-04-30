import { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/stores/store';
import { fetchAllProducts } from '@/stores/product.slice';
import { fetchSuppliers } from '@/stores/supplier.slice';
import { PurchasePanel, PurchaseList } from './components';
import { ProductCatalog } from './components/product-catalog';
import { toast } from 'sonner';
import { useLanguage } from '@/context/language-context';
import { usePermissions } from '@/context/permission-context';
import type { Product, Category } from '../invoice/index';

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
}

// Supplier Interface
export interface Supplier {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  balance?: number;
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

const PurchaseInvoicePage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const [currentView, setCurrentView] = useState<ViewType>('create');
  const [purchase, setPurchase] = useState<Purchase>({
    invoiceNumber: '',
    supplier: {} as Supplier,
    items: [],
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
    setCurrentView('list');
    setIsEditing(false);
    setEditingPurchase(null);
    setPurchase({
      invoiceNumber: '',
      supplier: {} as Supplier,
      items: [],
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
    setCurrentView('create');
    setIsEditing(false);
    setEditingPurchase(null);
    setPurchase({
      invoiceNumber: '',
      supplier: {} as Supplier,
      items: [],
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

  // Handle save success callback
  const handleSaveSuccess = useCallback(() => {
    // Optimistically update products state with new stock and costs right now
    // so the catalog shows correct values before the re-fetch completes
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

    // Background re-fetch to get exact values from backend (handles rounding, averaging, etc.)
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

    handleBackToList()
  }, [handleBackToList, dispatch, purchase.items]);

  return (
    <div className="h-full w-full">
      {currentView === 'list' ? (
        <PurchaseList
          onBack={() => setCurrentView('create')}
          onCreateNew={handleCreateNew}
          onEdit={handleEdit}
        />
      ) : currentView === 'create' ? (
        <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
          {/* Left Column - Purchase Panel */}
          <div className="space-y-4 pb-6">
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
            />
          </div>

          {/* Right Column - Product Catalog */}
          <div className="space-y-4 max-h-[2000px] overflow-y-auto pb-6">
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
        </div>
      ) : null}
    </div>
  );
};

export default PurchaseInvoicePage;
