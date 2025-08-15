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
    // User Profile and Authentication
    "upgrade_to_pro": "Upgrade to Pro",
    "account": "Account",
    "billing": "Billing",
    "notifications": "Notifications",
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
    
    // Dialog content
    "update_supplier": "Update the Supplier here.",
    "create_supplier": "Create new Supplier here.",
    "click_save": "Click save when you're done.",
    "save_changes": "Save changes",
    "delete_confirmation": "Are you sure you want to delete",
    "delete_warning": "This action will permanently remove the supplier",
    "from_system": "from the system. This cannot be undone.",
    "enter_name_confirm": "Enter Supplier Name to confirm deletion.",
    "warning": "Warning!",
    "operation_warning": "Please be careful, this operation cannot be rolled back.",
    
    // Common UI components
    "loading": "Loading...",
    
    // Success Messages
    "supplier_created_success": "Supplier created successfully",
    "supplier_updated_success": "Supplier updated successfully",
    "supplier_deleted_success": "Supplier deleted successfully",
    
    // Sidebar Navigation
    "general": "General",
    "dashboard": "Dashboard",
    "suppliers": "Suppliers",
    "customers": "Customers",
    "products": "Products",
    "purchase": "Purchase",
    "sale": "Sale",
    "accounts": "Accounts",
    "transactions": "Transactions",
    "mobile_repairing": "Mobile Repairing",
    "jazz_cash_load": "Jazz Cash & Load",
    "reports": "Reports",
    "customers_ledger": "Customers Ledger",
    "suppliers_ledger": "Suppliers Ledger",
    "transaction_ledger": "Transaction Ledger",
    "sale_ledger": "Sale Ledger",
    "purchase_ledger": "Purchase Ledger",
    "account_ledger": "Account Ledger",
  },
  ur: {
    // User Profile and Authentication
    "upgrade_to_pro": "پرو ورژن حاصل کریں",
    "account": "اکاؤنٹ",
    "billing": "بلنگ",
    "notifications": "نوٹیفیکیشنز",
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
    
    // Dialog content
    "update_supplier": "یہاں سپلائر کو اپ ڈیٹ کریں۔",
    "create_supplier": "یہاں نیا سپلائر بنائیں۔",
    "click_save": "جب آپ مکمل کر لیں تو محفوظ کریں پر کلک کریں۔",
    "save_changes": "تبدیلیاں محفوظ کریں",
    "delete_confirmation": "کیا آپ واقعی حذف کرنا چاہتے ہیں",
    "delete_warning": "یہ عمل سپلائر کو مستقل طور پر سسٹم سے ہٹا دے گا",
    "from_system": "اسے واپس نہیں کیا جا سکتا۔",
    "enter_name_confirm": "حذف کرنے کی تصدیق کے لیے سپلائر کا نام درج کریں۔",
    "warning": "انتباہ!",
    "operation_warning": "براہ کرم محتاط رہیں، اس آپریشن کو واپس نہیں کیا جا سکتا۔",
    
    // Common UI components
    "loading": "لوڈ ہو رہا ہے...",
    
    // Success Messages
    "supplier_created_success": "سپلائر کامیابی سے بنایا گیا",
    "supplier_updated_success": "سپلائر کامیابی سے اپڈیٹ ہو گیا",
    "supplier_deleted_success": "سپلائر کامیابی سے حذف کر دیا گیا",
    
    // Sidebar Navigation
    "general": "عمومی",
    "dashboard": "ڈیش بورڈ",
    "suppliers": "سپلائرز",
    "customers": "کسٹمرز",
    "products": "پروڈکٹس",
    "purchase": "خریداری",
    "sale": "فروخت",
    "accounts": "اکاؤنٹس",
    "transactions": "ٹرانزیکشنز",
    "mobile_repairing": "موبائل ریپیئرنگ",
    "jazz_cash_load": "جاز کیش اور لوڈ",
    "reports": "رپورٹس",
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
  
  // We're using LTR for all languages
  const isRTL = false
  
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
    
    // Set language attribute
    root.setAttribute('lang', language)
    
    // Always use LTR direction
    root.setAttribute('dir', 'ltr')
    root.classList.add('ltr')
    root.classList.remove('rtl')
    
    if (language === 'ur') {
      // Apply Urdu font
      document.body.style.fontFamily = "'Noto Nastaliq Urdu', system-ui, sans-serif"
    } else {
      // For English, use default font
      document.body.style.fontFamily = "system-ui, sans-serif"
      
      // Reset to default font
      document.body.style.fontFamily = "system-ui, sans-serif"
    }
  }, [language])
  
  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  )
}
