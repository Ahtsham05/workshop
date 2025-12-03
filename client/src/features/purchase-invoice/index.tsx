import { useState, useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/stores/store';
import { fetchAllProducts } from '@/stores/product.slice';
import { fetchSuppliers } from '@/stores/supplier.slice';
import { PurchasePanel, PurchaseList } from './components';
import { ProductCatalog } from '../invoice/components/product-catalog';
import { toast } from 'sonner';
import type { Product, Category } from '../invoice/index';

// Purchase Item Interface - simpler than invoice, no profit tracking
export interface PurchaseItem {
  product: Product;
  quantity: number;
  purchasePrice: number; // price we bought it at
}

// Supplier Interface
export interface Supplier {
  _id?: string;
  id?: string;
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
  supplier: Supplier | null;
  items: PurchaseItem[];
  subtotal: number;
  total: number;
  notes?: string;
  date: string;
  createdAt?: string;
  updatedAt?: string;
}

type ViewType = 'create' | 'list' | 'details';

const PurchaseInvoicePage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [currentView, setCurrentView] = useState<ViewType>('create');
  const [purchase, setPurchase] = useState<Purchase>({
    invoiceNumber: '',
    supplier: null,
    items: [],
    subtotal: 0,
    total: 0,
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
      
      // Ensure stockQuantity exists and preserve ID fields
      const productWithStock = {
        ...product,
        _id: product._id || product.id, // Ensure _id exists
        id: product.id || product._id,   // Ensure id exists  
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

  // Reset purchase form
  const resetPurchaseForm = useCallback(() => {
    setPurchase({
      invoiceNumber: '',
      supplier: null,
      items: [],
      subtotal: 0,
      total: 0,
      notes: '',
      date: new Date().toISOString(),
    })
  }, [])

  // Add product to purchase
  const addToPurchase = useCallback((product: Product, quantity: number = 1) => {
    setPurchase((prev) => {
      // More robust product identification - handle missing IDs
      const getProductIdentifier = (prod: Product) => {
        return prod._id || prod.id || prod.name; // fallback to name if no ID
      };

      const productIdentifier = getProductIdentifier(product);
      const existingIndex = prev.items.findIndex((item) => {
        const itemIdentifier = getProductIdentifier(item.product);
        return itemIdentifier && productIdentifier && itemIdentifier === productIdentifier;
      });

      if (existingIndex >= 0 && productIdentifier) {
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
        purchasePrice: product.cost || product.price,
      };

      return { ...prev, items: [...prev.items, newItem] };
    });
  }, []);

  // Remove item from purchase
  const removeFromPurchase = useCallback((productId: string) => {
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.filter((item) => {
        const itemId = item.product._id || item.product.id || item.product.name;
        return itemId !== productId;
      }),
    }));
  }, []);

  // Update quantity
  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) return;
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const itemId = item.product._id || item.product.id || item.product.name;
        return itemId === productId ? { ...item, quantity } : item;
      }),
    }));
  }, []);

  // Update purchase price
  const updatePurchasePrice = useCallback((productId: string, price: number) => {
    if (price < 0) return;
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const itemId = item.product._id || item.product.id || item.product.name;
        return itemId === productId ? { ...item, purchasePrice: price } : item;
      }),
    }));
  }, []);

  // Calculate totals
  const calculateTotals = useCallback(() => {
    const subtotal = purchase.items.reduce(
      (sum, item) => sum + item.quantity * item.purchasePrice,
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
    resetPurchaseForm();
  }, [resetPurchaseForm]);

  // Switch to create view
  const handleCreateNew = useCallback(() => {
    setCurrentView('create');
    setIsEditing(false);
    setEditingPurchase(null);
    resetPurchaseForm();
  }, [resetPurchaseForm]);

  // Handle edit
  const handleEdit = useCallback((purchaseToEdit: any) => {
    setCurrentView('create');
    setIsEditing(true);
    setEditingPurchase(purchaseToEdit);
    setPurchase({
      ...purchaseToEdit,
      items: purchaseToEdit.items || [],
    });
  }, []);

  // Handle save success callback
  const handleSaveSuccess = useCallback(() => {
    handleBackToList();
  }, [handleBackToList]);

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
              calculateTotals={calculateTotals}
              onBackToList={handleBackToList}
              onSaveSuccess={handleSaveSuccess}
              isEditing={isEditing}
              editingPurchase={editingPurchase}
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
