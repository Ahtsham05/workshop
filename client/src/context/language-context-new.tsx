import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

// Define our supported languages
type Language = 'en' | 'ur'

// Define our translations
interface TranslationDictionary {
  [key: string]: string;
}

interface Translations {
  en: TranslationDictionary;
  ur: TranslationDictionary;
}

const translations: Translations = {
  en: {
    // General Search and Command Menu
    "search": "Search",
    "search_placeholder": "Type a command or search...",
    "no_results_found": "No results found.",
    "theme": "Theme",
    "light": "Light",
    "dark": "Dark",
    "system": "System",
    
    // Dashboard
    "dashboard": "Dashboard",
    "download": "Download",
    "overview": "Overview",
    "analytics": "Analytics",
    "reports": "Reports",
    "notifications": "Notifications",
    "total_revenue": "Total Revenue",
    "subscriptions": "Subscriptions",
    "sales": "Sales",
    "active_now": "Active Now",
    "from_last_month": "from last month",
    "since_last_hour": "since last hour",
    "recent_sales": "Recent Sales",
    "sales_this_month": "You made 265 sales this month.",
    
    // User Profile and Authentication
    "upgrade_to_pro": "Upgrade to Pro",
    "account": "Account",
    "profile": "Profile",
    "billing": "Billing",
    "settings": "Settings",
    "new_team": "New Team",
    "log_out": "Log out",
    "logout_success": "Logout successfully!",
    
    // Suppliers page
    "suppliers_list": "Suppliers List",
    "manage_suppliers": "Manage your Suppliers here.",
    "search_suppliers": "Search suppliers...",
    "add_supplier": "Add Supplier",
    "edit_supplier": "Edit Supplier",
    "delete_supplier": "Delete Supplier",
    "supplier_name": "Supplier Name",
    
    // Customers page
    "customers_list": "Customers List",
    "manage_customers": "Manage your Customers here.",
    "search_customers": "Search customers...",
    "filter_customers": "Filter Customers...",
    "add_customer": "Add Customer",
    "edit_customer": "Edit Customer",
    "delete_customer": "Delete Customer",
    "customer_name": "Customer Name",
    
    // Products page
    "products_list": "Products List",
    "manage_products": "Manage your Products here.",
    "search_products": "Search products...",
    "search_categories": "Search categories...",
    "filter_products": "Filter Products...",
    "add_product": "Add Product",
    "edit_product": "Edit Product",
    "delete_product": "Delete Product",
    "product_name": "Product Name",
    "description": "Description",
    "barcode": "Barcode",
    "price": "Price",
    "cost": "Cost",
    "stock_quantity": "Stock Quantity",
    
    // Common fields
    "email": "Email",
    "phone": "Phone",
    "whatsapp": "Whatsapp",
    "address": "Address",
    "actions": "Actions",
    "no_results": "No results.",
    "name_required": "Name is required.",
    
    // Table actions
    "edit": "Edit",
    "delete": "Delete",
    "asc": "Asc",
    "desc": "Desc",
    "hide": "Hide",
    "view": "View",
    "toggle_columns": "Toggle columns",
    "select": "Select",
    
    // Pagination
    "rows_per_page": "Rows per page",
    "page": "Page",
    "of": "of",
    "row_selected": "row(s) selected.",
    
    // Common UI components
    "loading": "Loading...",
    "save_changes": "Save changes",
    "cancel": "Cancel",
    "warning": "Warning!",
    
    // Sidebar Navigation
    "general": "General",
    "suppliers": "Suppliers",
    "customers": "Customers",
    "products": "Products",
    "purchase": "Purchase",
    "sale": "Sale",
    "accounts": "Accounts",
    "transactions": "Transactions",
    "mobile_repairing": "Mobile Repairing",
    "jazz_cash_load": "Jazz Cash & Load",
    "customers_ledger": "Customers Ledger",
    "suppliers_ledger": "Suppliers Ledger",
    "transaction_ledger": "Transaction Ledger",
    "sale_ledger": "Sale Ledger",
    "purchase_ledger": "Purchase Ledger",
    "account_ledger": "Account Ledger",
  },
  ur: {
    // General Search and Command Menu
    "search": "تلاش کریں",
    "search_placeholder": "کمانڈ ٹائپ کریں یا تلاش کریں...",
    "no_results_found": "کوئی نتائج نہیں ملے۔",
    "theme": "تھیم",
    "light": "ہلکا",
    "dark": "گہرا",
    "system": "سسٹم",
    
    // Dashboard
    "dashboard": "ڈیش بورڈ",
    "download": "ڈاؤن لوڈ",
    "overview": "جائزہ",
    "analytics": "تجزیات",
    "reports": "رپورٹس",
    "notifications": "نوٹیفیکیشنز",
    "total_revenue": "کل آمدنی",
    "subscriptions": "رکنیت",
    "sales": "فروخت",
    "active_now": "فی الوقت فعال",
    "from_last_month": "گزشتہ مہینے سے",
    "since_last_hour": "گزشتہ گھنٹے سے",
    "recent_sales": "حالیہ فروخت",
    "sales_this_month": "آپ نے اس مہینے 265 فروخت کیے ہیں۔",
    
    // User Profile and Authentication
    "upgrade_to_pro": "پرو ورژن حاصل کریں",
    "account": "اکاؤنٹ",
    "profile": "پروفائل",
    "billing": "بلنگ",
    "settings": "سیٹنگز",
    "new_team": "نئی ٹیم",
    "log_out": "لاگ آؤٹ",
    "logout_success": "کامیابی سے لاگ آؤٹ ہو گیا!",
    
    // Suppliers page
    "suppliers_list": "سپلائرز کی فہرست",
    "manage_suppliers": "اپنے سپلائرز کو یہاں منظم کریں۔",
    "search_suppliers": "سپلائرز تلاش کریں...",
    "add_supplier": "سپلائر شامل کریں",
    "edit_supplier": "سپلائر میں ترمیم کریں",
    "delete_supplier": "سپلائر حذف کریں",
    "supplier_name": "سپلائر کا نام",
    
    // Customers page
    "customers_list": "کسٹمرز کی فہرست",
    "manage_customers": "اپنے کسٹمرز کو یہاں منظم کریں۔",
    "search_customers": "کسٹمرز تلاش کریں...",
    "filter_customers": "کسٹمرز فلٹر کریں...",
    "add_customer": "کسٹمر شامل کریں",
    "edit_customer": "کسٹمر میں ترمیم کریں",
    "delete_customer": "کسٹمر حذف کریں",
    "customer_name": "کسٹمر کا نام",
    
    // Products page
    "products_list": "پروڈکٹس کی فہرست",
    "manage_products": "اپنے پروڈکٹس کو یہاں منظم کریں۔",
    "search_products": "پروڈکٹس تلاش کریں...",
    "search_categories": "کیٹگریز تلاش کریں...",
    "filter_products": "پروڈکٹس فلٹر کریں...",
    "add_product": "پروڈکٹ شامل کریں",
    "edit_product": "پروڈکٹ میں ترمیم کریں",
    "delete_product": "پروڈکٹ حذف کریں",
    "product_name": "پروڈکٹ کا نام",
    "description": "تفصیل",
    "barcode": "بارکوڈ",
    "price": "قیمت",
    "cost": "لاگت",
    "stock_quantity": "اسٹاک کی مقدار",
    
    // Common fields
    "email": "ای میل",
    "phone": "فون",
    "whatsapp": "واٹس ایپ",
    "address": "پتہ",
    "actions": "کارروائیاں",
    "no_results": "کوئی نتائج نہیں۔",
    "name_required": "نام درکار ہے۔",
    
    // Table actions
    "edit": "ترمیم کریں",
    "delete": "حذف کریں",
    "asc": "چڑھتا ہوا",
    "desc": "اترتا ہوا",
    "hide": "چھپائیں",
    "view": "دیکھیں",
    "toggle_columns": "کالم دکھائیں/چھپائیں",
    "select": "منتخب کریں",
    
    // Pagination
    "rows_per_page": "صفحہ کے لائنوں کی تعداد",
    "page": "صفحہ",
    "of": "کُل",
    "row_selected": "قطاریں منتخب کی گئیں۔",
    
    // Common UI components
    "loading": "لوڈ ہو رہا ہے...",
    "save_changes": "تبدیلیاں محفوظ کریں",
    "cancel": "منسوخ کریں",
    "warning": "انتباہ!",
    
    // Sidebar Navigation
    "general": "عمومی",
    "suppliers": "سپلائرز",
    "customers": "کسٹمرز",
    "products": "پروڈکٹس",
    "purchase": "خریداری",
    "sale": "فروخت",
    "accounts": "اکاؤنٹس",
    "transactions": "ٹرانزیکشنز",
    "mobile_repairing": "موبائل ریپیئرنگ",
    "jazz_cash_load": "جاز کیش اور لوڈ",
    "customers_ledger": "کسٹمر لیجر",
    "suppliers_ledger": "سپلائر لیجر",
    "transaction_ledger": "ٹرانزیکشن لیجر",
    "sale_ledger": "سیل لیجر",
    "purchase_ledger": "پرچیز لیجر",
    "account_ledger": "اکاؤنٹ لیجر",
  }
}

// Interface for our context
interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string) => string
  isRTL: boolean
}

// Create context with default values
const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key: string) => key,
  isRTL: false
})

// Hook for using the language context
export const useLanguage = () => useContext(LanguageContext)

// Provider component
export function LanguageProvider({ children }: { children: ReactNode }) {
  // Initialize language from localStorage or default to English
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem('language') as Language) || 'en'
  )
  
  // Determine if current language is RTL
  const isRTL = language === 'ur'
  
  // Translation function
  const t = (key: string): string => {
    return translations[language][key] || key
  }
  
  // Save language to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('language', language)
  }, [language])
  
  // Apply font changes based on language (without changing direction)
  useEffect(() => {
    const root = document.documentElement
    const body = document.body
    
    // Set language attribute properly for each language
    if (language === 'ur') {
      root.setAttribute('lang', 'ur')
      body.setAttribute('lang', 'ur')
      // Add notranslate class and attributes to prevent Google Translate from translating Urdu content
      root.classList.add('notranslate')
      body.classList.add('notranslate')
      root.setAttribute('translate', 'no')
      body.setAttribute('translate', 'no')
      // Apply Urdu font
      document.body.style.fontFamily = "'Noto Nastaliq Urdu', system-ui, sans-serif"
    } else {
      root.setAttribute('lang', 'en')
      body.setAttribute('lang', 'en')
      // Remove notranslate class for English
      root.classList.remove('notranslate')
      body.classList.remove('notranslate')
      root.removeAttribute('translate')
      body.removeAttribute('translate')
      // For English, use default font
      document.body.style.fontFamily = "system-ui, sans-serif"
    }
    
    // Always use LTR direction
    root.setAttribute('dir', 'ltr')
    root.classList.add('ltr')
    root.classList.remove('rtl')
  }, [language])
  
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  )
}
