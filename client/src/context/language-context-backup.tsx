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
    
    // Product CRUD operations
    "product_created_successfully": "Product created successfully",
    "product_updated_successfully": "Product updated successfully",
    "product_deleted_successfully": "Product deleted successfully",
    "update_product_description": "Update the product here. Click save when you're done.",
    "create_product_description": "Create new product here. Click save when you're done.",
    
    // Delete dialog
    "delete_product_confirmation": "Are you sure you want to delete",
    "delete_product_warning": "This action will permanently remove the product of",
    "delete_product_warning_suffix": "from the system. This cannot be undone.",
    "delete_product_placeholder": "Enter Product to confirm deletion.",
    "delete_operation_warning": "Please be careful, this operation can not be rolled back.",
    
    // Barcode functionality
    "scan_barcode": "Scan Barcode",
    "enter_barcode": "Enter Barcode",
    "barcode_scanner": "Barcode Scanner",
    "barcode_input": "Barcode Input",
    "barcode_scanned": "Barcode Scanned",
    "barcode_entered": "Barcode Entered",
    "enter_or_scan_barcode": "Enter or scan barcode...",
    "point_camera_at_barcode": "Point camera at barcode to scan",
    "camera_access_failed": "Camera access failed. Please check permissions.",
    "try_again": "Try Again",
    "cancel": "Cancel",
    "add": "Add",
    "use_scanner_gun": "Use Scanner Gun",
    "stop_scanner": "Stop Scanner",
    "scanner_ready": "Scanner ready - scan a barcode",
    "scanner_listening": "Listening for barcode scanner...",
    "scanner_instructions": "Use your barcode gun or type manually",
    "barcode_product_search": "Barcode Product Search",
    "enter_barcode_to_search": "Enter barcode to search...",
    "product_found": "Product Found",
    "product_not_found": "Product Not Found",
    "no_product_with_barcode": "No product found with barcode",
    "consider_adding_new_product": "Consider adding this as a new product",
    "search_error": "Search error occurred",
    "capture_barcode": "Capture Barcode",
    "enter_barcode_manually": "Enter barcode manually",
    "barcode_from_image": "Barcode from image",
    "scanned": "Scanned",
    "click_scanner_button_to_activate": "Click scanner button to activate",
    "clear": "Clear",
    
    // Mobile camera scanner
    "mobile_camera_scanner": "Mobile Camera Scanner",
    "scan_with_camera": "Scan with Camera",
    "scanning_for_barcode": "Scanning for barcode",
    "enter_barcode_manually_for_testing": "Enter barcode manually for testing",
    "enter_manually_instead": "Enter Manually Instead",
    "scanning_instructions": "Scanning Instructions",
    "hold_phone_steady": "Hold phone steady",
    "ensure_good_lighting": "Ensure good lighting",
    "barcode_should_fill_frame": "Barcode should fill the frame",
    "enter_manually": "Enter Manually",
    
    // New mobile scanner translations
    "point_camera_at_qr_or_barcode": "Point camera at QR code or barcode",
    "ensure_good_lighting_or_use_flashlight": "Ensure good lighting or use flashlight button",
    "align_code_within_frame": "Align code within the scanning frame",
    "detection_is_automatic": "Detection is automatic - no need to press capture",
    "supports_multiple_formats": "Supports QR codes, EAN, Code128, and more",
    "flashlight_turned_off": "Flashlight turned off",
    "flashlight_turned_on": "Flashlight turned on",
    "flashlight_not_available": "Flashlight not available on this device",
    "turn_off_flashlight": "Turn off flashlight",
    "turn_on_flashlight": "Turn on flashlight",
    "make_sure_to": "Make sure to",
    "allow_camera_permission": "Allow camera permission when prompted",
    "try_refreshing_page": "Try refreshing the page",
    "check_camera_not_used_by_other_app": "Check if camera is being used by another app",
    "initializing_scanner": "Initializing scanner...",
    "this_will_take_moment": "This will only take a moment",
    
    // Image upload functionality
    "product_image": "Product Image",
    "upload_image": "Upload Image",
    "remove_image": "Remove Image",
    "drag_drop_image": "Drag & drop an image here",
    "or_click_to_select": "or click to select",
    "or_use_options_below": "or use the options below",
    "drop_image_here": "Drop image here",
    "uploading_image": "Uploading image...",
    "image_upload_failed": "Image upload failed",
    "image_uploaded_successfully": "Image uploaded successfully",
    "image_removed_successfully": "Image removed successfully",
    "image_load_failed": "Failed to load image",
    "select_file": "Select File",
    "take_photo": "Take Photo",
    "capture": "Capture",
    "switch_camera": "Switch Camera",
    "retry": "Retry",
    
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
    
    // Dialog content
    "update_supplier": "Update the Supplier here.",
    "create_supplier": "Create new Supplier here.",
    "update_customer": "Update the Customer here.",
    "create_customer": "Create new Customer here.",
    "click_save": "Click save when you're done.",
    "save_changes": "Save changes",
    "delete_confirmation": "Are you sure you want to delete",
    "delete_warning": "This action will permanently remove the supplier",
    "delete_customer_warning": "This action will permanently remove the customer",
    "from_system": "from the system. This cannot be undone.",
    "enter_name_confirm": "Enter Supplier Name to confirm deletion.",
    "enter_customer_name_confirm": "Enter Customer Name to confirm deletion.",
    "warning": "Warning!",
    "operation_warning": "Please be careful, this operation cannot be rolled back.",
    
    // Common UI components
    "loading": "Loading...",
    
    // Success Messages
    "supplier_created_success": "Supplier created successfully",
    "supplier_updated_success": "Supplier updated successfully",
    "supplier_deleted_success": "Supplier deleted successfully",
    "customer_created_success": "Customer created successfully",
    "customer_updated_success": "Customer updated successfully",
    "customer_deleted_success": "Customer deleted successfully",
    
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

    // Categories page
    "categories": "Categories",
    "manage_product_categories": "Manage your product categories here.",
    "add_category": "Add Category",
    "edit_category": "Edit Category",
    "delete_category": "Delete Category",
    "category_name": "Category Name",
    "category_image": "Category Image",
    "enter_category_name": "Enter category name",
    "enter_category_description": "Enter category description",
    "upload_category_image": "Upload category image",
    "optional": "Optional",
    
    // Category CRUD operations
    "category_created_successfully": "Category created successfully",
    "category_updated_successfully": "Category updated successfully",
    "category_deleted_successfully": "Category deleted successfully",
    "category_creation_failed": "Failed to create category",
    "category_update_failed": "Failed to update category",
    "category_deletion_failed": "Failed to delete category",
    "update_category_description": "Update the category here. Click save when you're done.",
    "create_category_description": "Create new category here. Click save when you're done.",
    "create_category": "Create Category",
    "update_category": "Update Category",
    "delete_category_confirmation": "Are you sure you want to delete this category",
    "saving": "Saving...",
    "deleting": "Deleting...",
    "failed_to_load_categories": "Failed to load categories",
    "select_categories": "Select Categories",
    "no_categories_found": "No categories found",
    
    // Voice Input functionality
    "no_speech_detected": "No speech detected",
    "microphone_not_available": "Microphone not available",
    "microphone_permission_denied": "Microphone permission denied",
    "network_error_voice_recognition": "Network error during voice recognition",
    "voice_recognition_error": "Voice recognition error",
    "voice_recording_started": "Voice recording started",
    "failed_to_start_voice_recording": "Failed to start voice recording",
    "voice_recording_stopped": "Voice recording stopped",
    "start_voice_recording": "Start voice recording",
    "stop_voice_recording": "Stop voice recording",
    "voice_recognition_not_supported": "Voice recognition not supported in this browser",
    
    // Voice Input Demo
    "voice_input_demo": "Voice Input Demo",
    "test_voice_to_text_functionality": "Test voice to text functionality",
    "product_information": "Product Information",
    "voice_input_product_demo_description": "Try speaking to fill in product details",
    "speak_or_type_product_name": "Speak or type product name...",
    "speak_or_type_description": "Speak or type description...",
    "additional_notes": "Additional Notes",
    "speak_or_type_notes": "Speak or type notes...",
    "voice_input_results": "Voice Input Results",
    "see_converted_text_here": "See the converted text here",
    "no_text_entered": "No text entered yet",
    "voice_input_instructions": "Voice Input Instructions",
    "click_microphone_icon_to_start": "Click the microphone icon to start recording",
    "speak_clearly_into_microphone": "Speak clearly into your microphone",
    "voice_automatically_converts_to_text": "Voice will automatically convert to text",
    "click_microphone_again_to_stop": "Click the microphone icon again to stop recording",
    "note": "Note",
    "language_switches_automatically": "Language detection switches automatically based on your selected language",
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
    
    // Product CRUD operations
    "product_created_successfully": "پروڈکٹ کامیابی سے بنایا گیا",
    "product_updated_successfully": "پروڈکٹ کامیابی سے اپ ڈیٹ ہوگیا",
    "product_deleted_successfully": "پروڈکٹ کامیابی سے حذف ہوگیا",
    "update_product_description": "یہاں پروڈکٹ کو اپ ڈیٹ کریں۔ ہو جانے پر محفوظ کریں۔",
    "create_product_description": "یہاں نیا پروڈکٹ بنائیں۔ ہو جانے پر محفوظ کریں۔",
    
    // Delete dialog
    "delete_product_confirmation": "کیا آپ واقعی حذف کرنا چاہتے ہیں",
    "delete_product_warning": "یہ عمل پروڈکٹ کو مستقل طور پر ہٹا دے گا",
    "delete_product_warning_suffix": "سسٹم سے۔ اسے واپس نہیں کیا جا سکتا۔",
    "delete_product_placeholder": "حذف کرنے کی تصدیق کے لیے پروڈکٹ داخل کریں۔",
    "delete_operation_warning": "براہ کرم محتاط رہیں، اس آپریشن کو واپس نہیں کیا جا سکتا۔",
    
    // Barcode functionality
    "scan_barcode": "بارکوڈ اسکین کریں",
    "enter_barcode": "بارکوڈ داخل کریں",
    "barcode_scanner": "بارکوڈ اسکینر",
    "barcode_input": "بارکوڈ انپٹ",
    "barcode_scanned": "بارکوڈ اسکین ہوگیا",
    "barcode_entered": "بارکوڈ داخل کیا گیا",
    "enter_or_scan_barcode": "بارکوڈ داخل کریں یا اسکین کریں...",
    "point_camera_at_barcode": "بارکوڈ اسکین کرنے کے لیے کیمرہ اس طرف کریں",
    "camera_access_failed": "کیمرہ تک رسائی ناکام۔ براہ کرم اجازات چیک کریں۔",
    "try_again": "دوبارہ کوشش کریں",
    "cancel": "منسوخ کریں",
    "add": "شامل کریں",
    "use_scanner_gun": "اسکینر گن استعمال کریں",
    "stop_scanner": "اسکینر بند کریں",
    "scanner_ready": "اسکینر تیار ہے - بارکوڈ اسکین کریں",
    "scanner_listening": "بارکوڈ اسکینر کی سن رہا ہے...",
    "scanner_instructions": "اپنا بارکوڈ گن استعمال کریں یا ہاتھ سے ٹائپ کریں",
    "barcode_product_search": "بارکوڈ پروڈکٹ تلاش",
    "enter_barcode_to_search": "تلاش کے لیے بارکوڈ داخل کریں...",
    "product_found": "پروڈکٹ مل گیا",
    "product_not_found": "پروڈکٹ نہیں ملا",
    "no_product_with_barcode": "اس بارکوڈ کے ساتھ کوئی پروڈکٹ نہیں ملا",
    "consider_adding_new_product": "اسے نیا پروڈکٹ شامل کرنے پر غور کریں",
    "search_error": "تلاش میں خرابی ہوئی",
    "capture_barcode": "بارکوڈ کیپچر کریں",
    "enter_barcode_manually": "بارکوڈ دستی طور پر داخل کریں",
    "barcode_from_image": "تصویر سے بارکوڈ",
    "scanned": "اسکین ہوگیا",
    "click_scanner_button_to_activate": "فعال کرنے کے لیے اسکینر بٹن پر کلک کریں",
    "clear": "صاف کریں",
    
    // Mobile camera scanner  
    "mobile_camera_scanner": "موبائل کیمرہ اسکینر",
    "scanning_for_barcode": "بارکوڈ اسکین کر رہا ہے",
    "enter_barcode_manually_for_testing": "ٹیسٹنگ کے لیے بارکوڈ دستی طور پر داخل کریں",
    "enter_manually_instead": "اس کے بجائے دستی طور پر داخل کریں",
    "scanning_instructions": "اسکیننگ کی ہدایات",
    "hold_phone_steady": "فون کو مستحکم رکھیں",
    "ensure_good_lighting": "اچھی روشنی کو یقینی بنائیں",
    "barcode_should_fill_frame": "بارکوڈ فریم کو بھرنا چاہیے",
    "enter_manually": "دستی طور پر داخل کریں",
    
    // New mobile scanner translations
    "point_camera_at_qr_or_barcode": "کیمرہ کو QR کوڈ یا بارکوڈ پر لگائیں",
    "ensure_good_lighting_or_use_flashlight": "اچھی روشنی یا ٹارچ بٹن استعمال کریں",
    "align_code_within_frame": "کوڈ کو اسکیننگ فریم کے اندر لائیں",
    "detection_is_automatic": "شناخت خودکار ہے - کیپچر دبانے کی ضرورت نہیں",
    "supports_multiple_formats": "QR کوڈز، EAN، Code128 اور مزید کو سپورٹ کرتا ہے",
    "flashlight_turned_off": "ٹارچ بند کر دیا گیا",
    "flashlight_turned_on": "ٹارچ چالو کر دیا گیا",
    "flashlight_not_available": "اس ڈیوائس پر ٹارچ دستیاب نہیں",
    "turn_off_flashlight": "ٹارچ بند کریں",
    "turn_on_flashlight": "ٹارچ چالو کریں",
    "make_sure_to": "یقینی بنائیں کہ",
    "allow_camera_permission": "کیمرہ کی اجازت دیں جب پوچھا جائے",
    "try_refreshing_page": "صفحہ ریفریش کرنے کی کوشش کریں",
    "check_camera_not_used_by_other_app": "چیک کریں کہ کیمرہ کسی اور ایپ میں استعمال تو نہیں ہو رہا",
    "initializing_scanner": "اسکینر شروع کر رہا ہے...",
    "this_will_take_moment": "اس میں صرف ایک لمحہ لگے گا",
    
    // Barcode demo page
    "barcode_inventory_system": "بارکوڈ انوینٹری سسٹم",
    "barcode_scanning_options": "بارکوڈ اسکیننگ آپشنز",
    "hardware_scanner": "ہارڈویئر اسکینر",
    "use_dedicated_scanner_gun": "مخصوص بارکوڈ اسکینر گن استعمال کریں",
    "scan_with_barcode_gun": "بارکوڈ گن سے اسکین کریں...",
    "camera_scanner": "کیمرہ اسکینر",
    "use_device_camera": "اسکین کے لیے اپنا ڈیوائس کیمرہ استعمال کریں",
    "scan_with_camera": "کیمرے سے اسکین کریں",
    "scanned_products": "اسکین شدہ پروڈکٹس",
    "no_products_scanned_yet": "ابھی تک کوئی پروڈکٹ اسکین نہیں ہوا",
    "scan_barcode_to_add_products": "پروڈکٹ شامل کرنے کے لیے بارکوڈ اسکین کریں",
    "each": "ہر ایک",
    "total_value": "کل قیمت",
    "last_scanned_barcode": "آخری اسکین شدہ بارکوڈ",
    "implementation_guide": "نافذ کرنے کا گائیڈ",
    "hardware_solution": "ہارڈویئر حل",
    "camera_solution": "کیمرہ حل",
    "manual_entry": "دستی انٹری",
    
    // Image upload functionality
    "product_image": "پروڈکٹ کی تصویر",
    "upload_image": "تصویر اپ لوڈ کریں",
    "remove_image": "تصویر ہٹائیں",
    "drag_drop_image": "یہاں تصویر کو گھسیٹ کر چھوڑیں",
    "or_click_to_select": "یا منتخب کرنے کے لیے کلک کریں",
    "or_use_options_below": "یا نیچے دیے گئے اختیارات استعمال کریں",
    "drop_image_here": "تصویر یہاں چھوڑیں",
    "uploading_image": "تصویر اپ لوڈ ہو رہی ہے...",
    "image_upload_failed": "تصویر اپ لوڈ ناکام",
    "image_uploaded_successfully": "تصویر کامیابی سے اپ لوڈ ہوئی",
    "image_removed_successfully": "تصویر کامیابی سے ہٹا دی گئی",
    "image_load_failed": "تصویر لوڈ کرنے میں ناکام",
    "select_file": "فائل منتخب کریں",
    "take_photo": "تصویر لیں",
    "capture": "کیپچر",
    "switch_camera": "کیمرہ تبدیل کریں",
    "retry": "دوبارہ کوشش",
    
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
    
    // Dialog content
    "update_supplier": "یہاں سپلائر کو اپ ڈیٹ کریں۔",
    "create_supplier": "یہاں نیا سپلائر بنائیں۔",
    "update_customer": "یہاں کسٹمر کو اپ ڈیٹ کریں۔",
    "create_customer": "یہاں نیا کسٹمر بنائیں۔",
    "click_save": "جب آپ مکمل کر لیں تو محفوظ کریں پر کلک کریں۔",
    "save_changes": "تبدیلیاں محفوظ کریں",
    "delete_confirmation": "کیا آپ واقعی حذف کرنا چاہتے ہیں",
    "delete_warning": "یہ عمل سپلائر کو مستقل طور پر سسٹم سے ہٹا دے گا",
    "delete_customer_warning": "یہ عمل کسٹمر کو مستقل طور پر سسٹم سے ہٹا دے گا",
    "from_system": "اسے واپس نہیں کیا جا سکتا۔",
    "enter_name_confirm": "حذف کرنے کی تصدیق کے لیے سپلائر کا نام درج کریں۔",
    "enter_customer_name_confirm": "حذف کرنے کی تصدیق کے لیے کسٹمر کا نام درج کریں۔",
    "warning": "انتباہ!",
    "operation_warning": "براہ کرم محتاط رہیں، اس آپریشن کو واپس نہیں کیا جا سکتا۔",
    
    // Common UI components
    "loading": "لوڈ ہو رہا ہے...",
    
    // Success Messages
    "supplier_created_success": "سپلائر کامیابی سے بنایا گیا",
    "supplier_updated_success": "سپلائر کامیابی سے اپڈیٹ ہو گیا",
    "supplier_deleted_success": "سپلائر کامیابی سے حذف کر دیا گیا",
    "customer_created_success": "کسٹمر کامیابی سے بنایا گیا",
    "customer_updated_success": "کسٹمر کامیابی سے اپڈیٹ ہو گیا",
    "customer_deleted_success": "کسٹمر کامیابی سے حذف کر دیا گیا",
    
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

    // Categories page
    "categories": "کیٹگریز",
    "manage_product_categories": "یہاں اپنی پروڈکٹ کیٹگریز کا انتظام کریں۔",
    "add_category": "کیٹگری شامل کریں",
    "edit_category": "کیٹگری میں ترمیم کریں",
    "delete_category": "کیٹگری حذف کریں",
    "category_name": "کیٹگری کا نام",
    "category_image": "کیٹگری کی تصویر",
    "enter_category_name": "کیٹگری کا نام داخل کریں",
    "enter_category_description": "کیٹگری کی تفصیل داخل کریں",
    "upload_category_image": "کیٹگری کی تصویر اپ لوڈ کریں",
    "optional": "اختیاری",
    
    // Category CRUD operations
    "category_created_successfully": "کیٹگری کامیابی سے بنائی گئی",
    "category_updated_successfully": "کیٹگری کامیابی سے اپ ڈیٹ ہوگئی",
    "category_deleted_successfully": "کیٹگری کامیابی سے حذف ہوگئی",
    "category_creation_failed": "کیٹگری بنانے میں ناکامی",
    "category_update_failed": "کیٹگری اپ ڈیٹ کرنے میں ناکامی",
    "category_deletion_failed": "کیٹگری حذف کرنے میں ناکامی",
    "update_category_description": "یہاں کیٹگری کو اپ ڈیٹ کریں۔ ہو جانے پر محفوظ کریں۔",
    "create_category_description": "یہاں نئی کیٹگری بنائیں۔ ہو جانے پر محفوظ کریں۔",
    "create_category": "کیٹگری بنائیں",
    "update_category": "کیٹگری اپ ڈیٹ کریں",
    "delete_category_confirmation": "کیا آپ واقعی اس کیٹگری کو حذف کرنا چاہتے ہیں",
    "saving": "محفوظ کر رہے ہیں...",
    "deleting": "حذف کر رہے ہیں...",
    "failed_to_load_categories": "کیٹگریز لوڈ کرنے میں ناکامی",
    "select_categories": "کیٹگریز منتخب کریں",
    "no_categories_found": "کوئی کیٹگری نہیں ملی",
    
    // Voice Input functionality
    "no_speech_detected": "کوئی آواز کا پتہ نہیں چلا",
    "microphone_not_available": "مائیکروفون دستیاب نہیں",
    "microphone_permission_denied": "مائیکروفون کی اجازت مسترد",
    "network_error_voice_recognition": "آواز کی شناخت میں نیٹ ورک کی خرابی",
    "voice_recognition_error": "آواز کی شناخت میں خرابی",
    "voice_recording_started": "آواز کی ریکارڈنگ شروع ہوگئی",
    "failed_to_start_voice_recording": "آواز کی ریکارڈنگ شروع کرنے میں ناکامی",
    "voice_recording_stopped": "آواز کی ریکارڈنگ رک گئی",
    "start_voice_recording": "آواز کی ریکارڈنگ شروع کریں",
    "stop_voice_recording": "آواز کی ریکارڈنگ رک کریں",
    "voice_recognition_not_supported": "اس براؤزر میں آواز کی شناخت کی سہولت دستیاب نہیں",
    
    // Voice Input Demo
    "voice_input_demo": "آواز سے ٹیکسٹ ڈیمو",
    "test_voice_to_text_functionality": "آواز سے ٹیکسٹ کی فیچر ٹیسٹ کریں",
    "product_information": "پروڈکٹ کی معلومات",
    "voice_input_product_demo_description": "پروڈکٹ کی تفصیلات بھرنے کے لیے بولنے کی کوشش کریں",
    "speak_or_type_product_name": "پروڈکٹ کا نام بولیں یا ٹائپ کریں...",
    "speak_or_type_description": "تفصیل بولیں یا ٹائپ کریں...",
    "additional_notes": "اضافی نوٹس",
    "speak_or_type_notes": "نوٹس بولیں یا ٹائپ کریں...",
    "voice_input_results": "آواز سے ٹیکسٹ کے نتائج",
    "see_converted_text_here": "تبدیل شدہ ٹیکسٹ یہاں دیکھیں",
    "no_text_entered": "ابھی تک کوئی ٹیکسٹ داخل نہیں ہوا",
    "voice_input_instructions": "آواز سے ٹیکسٹ کی ہدایات",
    "click_microphone_icon_to_start": "ریکارڈنگ شروع کرنے کے لیے مائیکروفون آئیکن پر کلک کریں",
    "speak_clearly_into_microphone": "اپنے مائیکروفون میں صاف بولیں",
    "voice_automatically_converts_to_text": "آواز خود کار طریقے سے ٹیکسٹ میں تبدیل ہو جائے گی",
    "click_microphone_again_to_stop": "ریکارڈنگ رکنے کے لیے مائیکروفون آئیکن پر دوبارہ کلک کریں",
    "note": "نوٹ",
    "language_switches_automatically": "زبان کی شناخت آپ کی منتخب کردہ زبان کی بنیاد پر خود کار طریقے سے بدل جاتی ہے",
    // "category_image": "کیٹگری کی تصویر",
    // "enter_category_name": "کیٹگری کا نام داخل کریں",
    // "enter_category_description": "کیٹگری کی تفصیل داخل کریں",
    // "upload_category_image": "کیٹگری کی تصویر اپ لوڈ کریں",
    // "optional": "اختیاری",
    
    // // Category CRUD operations
    // "category_created_successfully": "کیٹگری کامیابی سے بنائی گئی",
    // "category_updated_successfully": "کیٹگری کامیابی سے اپ ڈیٹ ہوگئی",
    // "category_deleted_successfully": "کیٹگری کامیابی سے حذف ہوگئی",
    // "category_creation_failed": "کیٹگری بنانے میں ناکام",
    // "category_update_failed": "کیٹگری اپ ڈیٹ کرنے میں ناکام",
    // "category_deletion_failed": "کیٹگری حذف کرنے میں ناکام",
    // "update_category_description": "یہاں کیٹگری کو اپ ڈیٹ کریں۔ ہو جانے پر محفوظ کریں۔",
    // "create_category_description": "یہاں نئی کیٹگری بنائیں۔ ہو جانے پر محفوظ کریں۔",
    // "create_category": "کیٹگری بنائیں",
    // "update_category": "کیٹگری اپ ڈیٹ کریں",
    // "delete_category_confirmation": "کیا آپ واقعی اس کیٹگری کو حذف کرنا چاہتے ہیں",
    // "saving": "محفوظ کر رہے ہیں...",
    // "deleting": "حذف کر رہے ہیں...",
    // "failed_to_load_categories": "کیٹگریز لوڈ کرنے میں ناکام",
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
