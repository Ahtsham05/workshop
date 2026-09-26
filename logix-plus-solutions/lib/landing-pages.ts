import type { Faq } from "./site";
import type { IconName } from "@/components/Icon";

export type Point = { icon: IconName; title: string; desc: string; href?: string };

export type LandingPage = {
  slug: string;
  /** <title> — primary keyword first, under ~60 chars. */
  metaTitle: string;
  /** Meta description — under ~155 chars, ends with a reason to click. */
  metaDescription: string;
  keywords: string[];
  /** Short name used in nav, footer and breadcrumbs. */
  navLabel: string;
  group: "product" | "industry" | "region";
  eyebrow: string;
  h1: string;
  h1Highlight: string;
  intro: string;
  pains: Point[];
  features: Point[];
  outcomes: string[];
  faqs: Faq[];
  /** OpenGraph locale and hreflang for region pages. */
  locale?: "en_PK" | "en_GB" | "en_US";
  hreflang?: "en-PK" | "en-GB" | "en-US";
  /** Show PKR prices next to USD. */
  showPkr?: boolean;
  /** Overrides for the generic section copy. */
  closing?: string;
  faqTitle?: string;
  /** Flagship pages only: short proof points in a bar under the hero. */
  trustBar?: string[];
  /** Flagship pages only: "included at no extra cost" checklist. */
  included?: { title: string; highlight: string; intro: string; items: string[]; footnote?: string };
  /** Flagship pages only: store types in this market, optionally linking to an industry page. */
  verticals?: { title: string; highlight: string; items: Point[] };
};

export const LANDING_PAGES: LandingPage[] = [
  // ─── Products ──────────────────────────────────────────────────────────────
  {
    slug: "pos-software",
    metaTitle: "POS Software for Retail Shops & Stores | Logix Plus",
    metaDescription:
      "Fast, simple POS software with barcode billing, stock control, cash register and reports. Works online and offline. Start a 14-day free trial today.",
    keywords: [
      "pos software",
      "point of sale software",
      "retail pos system",
      "cloud pos",
      "pos system for small business",
      "billing software",
      "barcode billing software",
    ],
    navLabel: "POS Software",
    group: "product",
    eyebrow: "Point of sale",
    h1: "POS software that bills in seconds and",
    h1Highlight: "never loses a sale",
    intro:
      "Scan, bill and print in one screen. Logix Plus keeps your stock, cash and customer balances up to date with every sale, so closing the day takes minutes instead of an hour.",
    pains: [
      { icon: "clock", title: "Long queues at the counter", desc: "Slow billing and manual price look-ups make customers walk out before they pay." },
      { icon: "wallet", title: "Cash never matches", desc: "At closing time the drawer is short and nobody can tell which sale, refund or expense caused it." },
      { icon: "package", title: "Out of stock surprises", desc: "You find out an item is finished when a customer asks for it, not before." },
      { icon: "userx", title: "Staff mistakes and discounts", desc: "Wrong prices and unapproved discounts quietly eat your profit every day." },
    ],
    features: [
      { icon: "scan", title: "Barcode & quick billing", desc: "Scan or search by name, set quantity and print a thermal or A4 receipt in a few taps." },
      { icon: "wallet", title: "Cash register & cash book", desc: "Opening cash, sales, expenses and closing cash per shift, with the difference shown clearly." },
      { icon: "bell", title: "Low-stock alerts", desc: "Get warned before items run out and see what to reorder from each supplier." },
      { icon: "undo", title: "Returns & exchanges", desc: "Take returns against the original invoice so stock and customer balance stay correct." },
      { icon: "shield", title: "Staff permissions", desc: "Decide who can give discounts, edit prices, delete invoices or see profit." },
      { icon: "chart", title: "Daily sales reports", desc: "Sales, profit, top products and payment types for today, this week or any date range." },
    ],
    outcomes: [
      "Bill a customer in under 10 seconds",
      "Close the cash register with an exact difference",
      "Know today's profit before you lock the shop",
    ],
    faqs: [
      { q: "Which hardware does the POS work with?", a: "Any USB or Bluetooth barcode scanner, 58mm or 80mm thermal receipt printers and normal A4 printers. It runs in a browser on Windows, Mac, Android tablets and phones, or as a Windows desktop app." },
      { q: "Can I print barcode labels for my products?", a: "Yes. The built-in barcode generator prints labels with name and price for items that don't come with a barcode." },
      { q: "Can I bill when the internet is down?", a: "Yes, with the Windows desktop app. Sales are saved on the computer and synced automatically when the connection returns." },
      { q: "Can I give credit to regular customers?", a: "Yes. Unpaid amounts go to the customer's ledger and you can send them a balance reminder on WhatsApp." },
    ],
  },
  {
    slug: "erp-software",
    metaTitle: "ERP Software for Small & Medium Businesses | Logix Plus",
    metaDescription:
      "Affordable cloud ERP: sales, purchases, inventory, accounting, HR and multi-branch reports in one system. From $10/month. Try it free for 14 days.",
    keywords: [
      "erp software",
      "cloud erp",
      "erp for small business",
      "sme erp software",
      "business management software",
      "erp system",
      "affordable erp",
    ],
    navLabel: "ERP Software",
    group: "product",
    eyebrow: "Cloud ERP",
    h1: "One ERP for sales, stock, accounts and staff —",
    h1Highlight: "without the enterprise price tag",
    intro:
      "Most ERP systems are built for large companies with IT teams and long rollouts. Logix Plus gives small and medium businesses the same control — every branch, every rupee, dollar or pound, every item — set up in a day.",
    pains: [
      { icon: "layers", title: "Five tools that don't talk", desc: "Billing in one app, stock in Excel, accounts with the accountant and salaries on paper." },
      { icon: "eyeoff", title: "No real picture of the business", desc: "You can't answer simple questions like which branch or product actually makes money." },
      { icon: "coins", title: "ERP quotes you can't justify", desc: "Big-name ERP means licence fees, consultants and months of implementation." },
      { icon: "file", title: "Month-end takes a week", desc: "Reconciling sales, purchases, payments and bank statements by hand every month." },
    ],
    features: [
      { icon: "cart", title: "Sales & invoicing", desc: "Quotations, invoices, POS billing, returns and customer payments with automatic balances." },
      { icon: "truck", title: "Purchases & suppliers", desc: "Purchase orders, purchase invoices, supplier payments and suggested reorder lists." },
      { icon: "package", title: "Inventory & warehouses", desc: "Stock across branches, stock transfers, adjustments, units, variants and expiry dates." },
      { icon: "book", title: "Accounting & banking", desc: "Ledgers, bank accounts, cash book, payment vouchers and bank reconciliation." },
      { icon: "users", title: "HR & payroll", desc: "Staff records, attendance, salaries and salesman commission tracking." },
      { icon: "building", title: "Multi-branch control", desc: "Compare branches, push products and prices to all of them and control access by role." },
    ],
    outcomes: [
      "Replace separate billing, stock and accounts tools with one login",
      "See profit by branch, product and salesman",
      "Go live in a day with Excel import",
    ],
    faqs: [
      { q: "How is Logix Plus different from SAP, Odoo or NetSuite?", a: "Logix Plus is made for small and medium businesses. There are no implementation projects or consultants — you sign up, import your items from Excel and start working. Pricing starts at $10 per month." },
      { q: "Can I manage several branches or warehouses?", a: "Yes. The Business plan covers up to 5 branches with stock transfers, branch comparison and user roles per branch. Larger setups are available on request." },
      { q: "Is my data secure?", a: "Data is stored securely in the cloud and every connection is encrypted. Every user has their own login and you choose exactly what each role can see and do. An audit log records important changes." },
      { q: "Can you customise it for my business?", a: "Yes. We build custom modules and reports for businesses with specific needs. Message us on WhatsApp with what you need." },
    ],
  },
  {
    slug: "accounting-software",
    metaTitle: "Accounting Software for Small Business | Logix Plus",
    metaDescription:
      "Simple accounting software with customer & supplier ledgers, bank accounts, cash book, VAT/GST and profit & loss. Connected to your POS. Free 14-day trial.",
    keywords: [
      "accounting software",
      "small business accounting software",
      "bookkeeping software",
      "accounts software",
      "ledger software",
      "cash book software",
      "vat accounting software",
    ],
    navLabel: "Accounting Software",
    group: "product",
    eyebrow: "Accounts & finance",
    h1: "Accounting software that",
    h1Highlight: "writes the entries for you",
    intro:
      "Every sale, purchase, payment and expense you record in Logix Plus posts to the right ledger automatically. You get live balances, a real cash book and profit & loss — without learning double-entry.",
    pains: [
      { icon: "book", title: "Registers and khata books", desc: "Customer and supplier balances live in notebooks that only one person understands." },
      { icon: "search", title: "Who owes you what?", desc: "Chasing payments is guesswork when you can't pull up an exact statement in seconds." },
      { icon: "bank", title: "Bank never matches the books", desc: "Deposits, transfers and charges are hard to trace back to real transactions." },
      { icon: "percent", title: "Tax time panic", desc: "VAT or GST figures have to be rebuilt from invoices at the end of every period." },
    ],
    features: [
      { icon: "users", title: "Customer & supplier ledgers", desc: "Live balances and printable statements for every party, updated with each invoice and payment." },
      { icon: "bank", title: "Bank accounts & wallets", desc: "Track multiple bank accounts, cash in hand and mobile wallets, with transfers between them." },
      { icon: "wallet", title: "Cash book", desc: "Daily cash in and out with opening and closing balance, reconciled against the register." },
      { icon: "receipt", title: "Payment & receipt vouchers", desc: "Record payments and receipts, edit them safely and every ledger updates itself." },
      { icon: "percent", title: "VAT, GST & sales tax", desc: "Tax rates per product and party, calculated on every invoice and purchase." },
      { icon: "chart", title: "Profit & loss", desc: "P&L, expense breakdowns and ROI reports for any period and any branch." },
    ],
    outcomes: [
      "Send any customer an exact statement in seconds",
      "Reconcile cash and bank daily, not monthly",
      "Hand your accountant clean reports at month-end",
    ],
    faqs: [
      { q: "Do I need to know accounting to use it?", a: "No. You record sales, purchases, payments and expenses the normal way and the ledgers are updated for you. Accountants still get full ledgers and reports." },
      { q: "Can I send payment reminders to customers?", a: "Yes. You can set reminders and share balances or statements with customers on WhatsApp." },
      { q: "Does it support VAT and GST?", a: "Yes. You set tax rates on products and on customers or suppliers, and tax is applied on invoices and purchases automatically." },
      { q: "Can I export reports to Excel or PDF?", a: "Yes. Reports can be printed, saved as PDF or exported for your accountant." },
    ],
  },
  {
    slug: "inventory-management-software",
    metaTitle: "Inventory Management Software | Stock Control | Logix Plus",
    metaDescription:
      "Track stock across shops and warehouses: barcodes, low-stock alerts, transfers, expiry dates and dead-stock reports. Start free for 14 days.",
    keywords: [
      "inventory management software",
      "stock management software",
      "stock control software",
      "warehouse inventory software",
      "inventory software for small business",
      "barcode inventory system",
    ],
    navLabel: "Inventory Software",
    group: "product",
    eyebrow: "Inventory & stock",
    h1: "Inventory software that shows",
    h1Highlight: "exactly where your money is sitting",
    intro:
      "Stock is usually a business's biggest cost. Logix Plus tracks every item in every branch, warns you before you run out and shows which products aren't selling — so cash stops getting stuck on shelves.",
    pains: [
      { icon: "package", title: "Stock counts never match", desc: "The system says 20, the shelf says 12, and nobody knows where the rest went." },
      { icon: "archive", title: "Money stuck in dead stock", desc: "Slow items pile up in the back while fast sellers keep running out." },
      { icon: "calendar", title: "Expired goods thrown away", desc: "Near-expiry items are only noticed after they can no longer be sold." },
      { icon: "truck", title: "Transfers get lost", desc: "Goods move between branches or warehouses without a record on either side." },
    ],
    features: [
      { icon: "scan", title: "Barcodes & labels", desc: "Scan to sell, receive and count. Print labels for items without barcodes." },
      { icon: "bell", title: "Low-stock alerts", desc: "Minimum levels per item with alerts and purchase suggestions by supplier." },
      { icon: "truck", title: "Stock transfers", desc: "Move stock between branches with a record on both sides." },
      { icon: "sliders", title: "Stock adjustments", desc: "Record damage, loss and count corrections with reasons and full history." },
      { icon: "chart", title: "ABC & dead-stock analysis", desc: "Rank products by sales and profit and find items that haven't moved in weeks." },
      { icon: "upload", title: "Excel import & price updates", desc: "Import thousands of items at once and update costs from supplier price lists." },
    ],
    outcomes: [
      "Always know stock on hand in every branch",
      "Free up cash from slow and dead stock",
      "Reorder on time, every time",
    ],
    faqs: [
      { q: "Can I track stock in more than one location?", a: "Yes. Each branch has its own stock, and you can transfer items between branches with a record on both sides." },
      { q: "Does it support units like boxes and pieces?", a: "Yes. You can sell in pieces and buy in cartons or boxes with automatic conversion." },
      { q: "Can I track expiry dates?", a: "Yes. Expiry dates can be recorded on stock so you can spot items that are close to expiring." },
      { q: "How do I add my existing products?", a: "Import them from Excel. Rows with problems are listed so you can fix them, and the rest are imported straight away." },
    ],
  },

  // ─── Industries ────────────────────────────────────────────────────────────
  {
    slug: "school-management-software",
    metaTitle: "School Management Software with Fee Collection | Logix Plus",
    metaDescription:
      "School software for fees, vouchers, attendance, exams, results, timetables, teacher payroll and SMS to parents. Built for private schools. Try it free.",
    keywords: [
      "school management software",
      "school management system",
      "school fee management software",
      "fee collection software",
      "student information system",
      "school erp",
    ],
    navLabel: "School Management",
    group: "industry",
    eyebrow: "Schools & academies",
    h1: "School management software that",
    h1Highlight: "gets fees collected on time",
    intro:
      "Fee vouchers, collection, defaulters, attendance, exams, results and parent messages — in one system that office staff can learn in an afternoon.",
    pains: [
      { icon: "receipt", title: "Fee defaulters slip through", desc: "Nobody has an up-to-date list of who hasn't paid which month." },
      { icon: "file", title: "Vouchers made by hand", desc: "Office staff spend days every month preparing and checking fee vouchers." },
      { icon: "message", title: "Parents don't get informed", desc: "Absences, results and fee reminders reach parents late or not at all." },
      { icon: "clipboard", title: "Results in spreadsheets", desc: "Marks, grades and report cards are typed up again for every exam." },
    ],
    features: [
      { icon: "receipt", title: "Fee vouchers & collection", desc: "Generate monthly vouchers, collect by month, give discounts and print receipts." },
      { icon: "chart", title: "Fee reports & defaulters", desc: "Collection by date and by fee month, outstanding lists and discount and refund reports." },
      { icon: "check", title: "Attendance", desc: "Student and teacher attendance with leave management." },
      { icon: "award", title: "Exams, marks & results", desc: "Enter marks, calculate grades and print result cards." },
      { icon: "message", title: "SMS & WhatsApp to parents", desc: "Fee reminders, absence alerts and announcements with ready-made templates." },
      { icon: "users", title: "Teachers & payroll", desc: "Teacher assignments, timetables, attendance and monthly salaries." },
    ],
    outcomes: [
      "Fee vouchers for the whole school in minutes",
      "Defaulter list always up to date",
      "Parents informed the same day",
    ],
    faqs: [
      { q: "Can parents and students log in?", a: "Yes. Parent and student portals let families see fees, attendance and results. Portal logins don't count toward your user limit." },
      { q: "Can I print ID cards?", a: "Yes. Student ID cards can be generated and printed from the system." },
      { q: "Does SMS need a paid gateway?", a: "No. Logix Plus can send SMS through an Android phone with its SMS gateway app, so you use your own SIM package." },
      { q: "Is the school module included in all plans?", a: "Yes. School management is included from the Starter plan." },
    ],
  },
  {
    slug: "restaurant-pos-software",
    metaTitle: "Restaurant POS Software with KOT & QR Ordering | Logix Plus",
    metaDescription:
      "Restaurant POS with table management, kitchen orders, QR menu ordering, reservations and daily sales reports. Easy for cafés and restaurants. Free trial.",
    keywords: [
      "restaurant pos software",
      "restaurant pos system",
      "cafe pos",
      "restaurant billing software",
      "qr code ordering",
      "kitchen order ticket system",
    ],
    navLabel: "Restaurant POS",
    group: "industry",
    eyebrow: "Restaurants & cafés",
    h1: "Restaurant POS that keeps tables turning and",
    h1Highlight: "the kitchen in sync",
    intro:
      "Take orders at the table or by QR code, send them straight to the kitchen and bill in one tap. Logix Plus keeps waiters, kitchen and counter working from the same screen.",
    pains: [
      { icon: "message", title: "Orders lost between floor and kitchen", desc: "Handwritten slips get missed, misread or cooked twice." },
      { icon: "clock", title: "Slow bills at rush hour", desc: "Customers wait to pay while staff total up orders by hand." },
      { icon: "grid", title: "No view of tables", desc: "You can't see at a glance which tables are free, ordering or waiting for the bill." },
      { icon: "coins", title: "Leaks you can't see", desc: "Items served but never billed, and no daily report to catch it." },
    ],
    features: [
      { icon: "grid", title: "Table management", desc: "Live floor view of free, occupied and billing tables." },
      { icon: "chef", title: "Kitchen display", desc: "Orders go straight to the kitchen screen with status updates back to the floor." },
      { icon: "qr", title: "QR code ordering", desc: "Guests scan a table QR, browse the menu and send their order." },
      { icon: "book", title: "Menu management", desc: "Categories, items, prices and availability updated in one place." },
      { icon: "calendar", title: "Reservations", desc: "Take and manage table bookings." },
      { icon: "chart", title: "Sales reports", desc: "Daily sales, top items and payment breakdowns." },
    ],
    outcomes: [
      "Every order reaches the kitchen",
      "Bills ready the moment guests ask",
      "Daily report of everything sold",
    ],
    faqs: [
      { q: "Do guests need an app to order by QR?", a: "No. They scan the QR code on the table with their phone camera and order in the browser." },
      { q: "Can I print kitchen tickets?", a: "Yes. Kitchen and customer receipts can be printed on thermal printers, or orders can be shown on a kitchen screen." },
      { q: "Does it also handle stock and accounts?", a: "Yes. The restaurant module runs on the same system as inventory, purchases and accounting." },
      { q: "Can I use tablets for waiters?", a: "Yes. Logix Plus runs in the browser on any Android or iPad tablet." },
    ],
  },
  {
    slug: "mobile-shop-software",
    metaTitle: "Mobile Shop Software: IMEI, Repairs & Load | Logix Plus",
    metaDescription:
      "Software for mobile phone shops: IMEI tracking, new & used phone sales, repair jobs, load and bill payments, plus accessories stock. Try it free.",
    keywords: [
      "mobile shop software",
      "mobile phone shop pos",
      "imei tracking software",
      "phone repair shop software",
      "mobile shop management system",
      "easyload software",
    ],
    navLabel: "Mobile Shop Software",
    group: "industry",
    eyebrow: "Mobile phone shops",
    h1: "Mobile shop software that tracks",
    h1Highlight: "every IMEI, repair and rupee",
    intro:
      "Phones, accessories, repairs, load and bill payments all make money differently. Logix Plus tracks each one separately, so you finally know what the shop earns from each side of the business.",
    pains: [
      { icon: "smartphone", title: "Can't trace a phone", desc: "A customer comes back with a phone and you can't prove when or at what price it was sold." },
      { icon: "wrench", title: "Repair jobs forgotten", desc: "Devices sit in the drawer with no record of fault, promised date or parts used." },
      { icon: "coins", title: "Load and bill cash mixed up", desc: "Load, bill payment and sales cash all go in one drawer and never reconcile." },
      { icon: "refresh", title: "Used-phone deals on trust", desc: "Buying second-hand phones without records of the seller and IMEI is risky." },
    ],
    features: [
      { icon: "smartphone", title: "IMEI tracking", desc: "Record IMEI on purchase and sale and search any phone's full history." },
      { icon: "refresh", title: "New & used phones", desc: "Buy and sell used phones with seller details and profit per device." },
      { icon: "wrench", title: "Repair jobs", desc: "Job cards with fault, parts, charges, status and customer pickup." },
      { icon: "zap", title: "Load & bill payments", desc: "Track load and utility bill payments with separate commission and cash." },
      { icon: "package", title: "Accessories stock", desc: "Chargers, covers and parts with barcode billing and low-stock alerts." },
      { icon: "wallet", title: "Wallets & cash", desc: "Separate balances for cash, bank and mobile wallets, reconciled daily." },
    ],
    outcomes: [
      "Find any phone by IMEI in seconds",
      "Never lose track of a repair job",
      "Know profit from phones, repairs and load separately",
    ],
    faqs: [
      { q: "Can I search a phone by IMEI?", a: "Yes. Enter the IMEI to see when it was bought, from whom, when it was sold and to which customer." },
      { q: "Does it handle installments?", a: "Yes. Sales can be recorded with partial payments and the balance tracked on the customer ledger." },
      { q: "Which plan includes the mobile shop module?", a: "The mobile shop module is included from the Growth plan." },
      { q: "Can I print repair receipts?", a: "Yes. Repair job receipts can be printed for the customer when the device is dropped off and collected." },
    ],
  },
  {
    slug: "wholesale-distribution-software",
    metaTitle: "Wholesale & Distribution Software | Logix Plus",
    metaDescription:
      "Wholesale software for distributors: bulk invoicing, customer credit limits and ledgers, salesman tracking, supplier price updates and branch stock. Free trial.",
    keywords: [
      "wholesale software",
      "distribution software",
      "wholesale billing software",
      "distributor management software",
      "wholesale inventory software",
    ],
    navLabel: "Wholesale & Distribution",
    group: "industry",
    eyebrow: "Wholesalers & distributors",
    h1: "Wholesale software that keeps",
    h1Highlight: "credit, stock and salesmen under control",
    intro:
      "Wholesale runs on credit, volume and thin margins. Logix Plus shows who owes you what, which salesman sold what, and whether your latest price list actually protects your margin.",
    pains: [
      { icon: "coins", title: "Outstanding payments pile up", desc: "Retailers keep buying on credit and recoveries fall behind." },
      { icon: "tag", title: "Supplier prices change weekly", desc: "Updating hundreds of costs and sale prices by hand means margins slip." },
      { icon: "userx", title: "Salesmen with no accountability", desc: "No clear record of orders, recoveries and commission per salesman." },
      { icon: "truck", title: "Stock spread across godowns", desc: "Different warehouses and shops with no single view of stock." },
    ],
    features: [
      { icon: "receipt", title: "Bulk invoicing", desc: "Fast invoices with retail and wholesale price levels, units and cartons." },
      { icon: "users", title: "Customer ledgers", desc: "Balances, statements and payment allocation against invoices." },
      { icon: "tag", title: "Price Update Center", desc: "Paste or upload a supplier price list and update matching costs and prices in bulk." },
      { icon: "badge", title: "Salesman tracking", desc: "Sales, recoveries and commission per salesman." },
      { icon: "truck", title: "Purchases & suppliers", desc: "Purchase orders, invoices, returns and supplier payments." },
      { icon: "building", title: "Branches & godowns", desc: "Stock per location with transfers between them." },
    ],
    outcomes: [
      "Recover payments faster with clear statements",
      "Update hundreds of prices in minutes",
      "Know every salesman's real performance",
    ],
    faqs: [
      { q: "Can I keep separate wholesale and retail prices?", a: "Yes. Products can carry different price levels for retail and wholesale customers." },
      { q: "Can salesmen take orders?", a: "Yes. Salesmen can log in with limited permissions and every invoice records who created it." },
      { q: "How does the price update tool work?", a: "Paste a supplier's WhatsApp message, upload their Excel or PDF, or snap a photo of the list. Logix Plus matches the items to your products and you confirm the changes." },
      { q: "Can I set credit limits?", a: "You can see every customer's outstanding balance on the invoice screen before you extend more credit." },
    ],
  },

  // ─── Regions ───────────────────────────────────────────────────────────────
  {
    slug: "pos-software-usa",
    metaTitle: "POS System for Small Business in the USA — $10/mo | Logix Plus",
    metaDescription:
      "All-in-one POS, inventory & bookkeeping for US small businesses. Keep your own card processor, sales tax built in, no contracts. $10/month. Free 14-day trial.",
    keywords: [
      "pos system for small business",
      "pos software usa",
      "retail pos system",
      "small business pos",
      "inventory management software for small business",
      "pos with inventory management",
      "affordable pos system",
      "pos system no processing lock-in",
      "convenience store pos",
      "small business erp",
    ],
    navLabel: "United States",
    group: "region",
    eyebrow: "Built for American small businesses",
    h1: "POS, inventory and bookkeeping for $10 a month —",
    h1Highlight: "with no processor lock-in",
    closing: "Logix Plus puts checkout, inventory and your books in one system — at a price built for small business.",
    faqTitle: "Questions US store owners ask",
    intro:
      "Ring up sales, track every item across your locations and know your real profit, all in one system. Keep the card processor you already have, skip the long-term contract, and stop paying for add-ons one feature at a time.",
    locale: "en_US",
    hreflang: "en-US",
    trustBar: [
      "Keep your own card processor",
      "Sales tax built in",
      "No contract · cancel online",
      "No per-register fees",
      "14-day free trial, no card",
    ],
    pains: [
      { icon: "lock", title: "Stuck with their processor", desc: "Many POS systems only work with their own payment processing, so you can't shop around for a better rate." },
      { icon: "coins", title: "Nickel-and-dimed on add-ons", desc: "Inventory, advanced reports, extra registers and employee tools each add another monthly charge." },
      { icon: "package", title: "Inventory lives in a spreadsheet", desc: "Counts are out of date by lunchtime, so you over-order slow items and run out of best sellers." },
      { icon: "book", title: "Books in a separate app", desc: "Sales in one system, bookkeeping in another, and hours every month reconciling the two." },
      { icon: "percent", title: "Sales tax you can't trust", desc: "Different rates, taxable and non-taxable items, and exempt customers make end-of-month totals a guess." },
      { icon: "building", title: "A second location doubles the work", desc: "Separate logins, separate stock and no single view of how each store is really doing." },
    ],
    features: [
      { icon: "scan", title: "Fast checkout", desc: "Scan barcodes or search by name, apply discounts and print or share the receipt in seconds." },
      { icon: "card", title: "Any card terminal", desc: "Take card payments on the terminal you already use and record cash, card or split payments on the sale." },
      { icon: "percent", title: "Sales tax built in", desc: "Set tax rates per product and per customer, including non-taxable items and tax-exempt customers." },
      { icon: "package", title: "Real-time inventory", desc: "Stock updates with every sale, return and delivery, with low-stock alerts and reorder suggestions." },
      { icon: "truck", title: "Purchase orders & vendors", desc: "Create POs, receive stock against them and keep track of what you owe each vendor." },
      { icon: "users", title: "Customer accounts", desc: "House accounts, customer balances and printable statements for regulars and B2B buyers." },
      { icon: "building", title: "Multi-location", desc: "Run up to 5 stores on one account with transfers between locations and store-by-store reports." },
      { icon: "shield", title: "Employee permissions", desc: "Control who can discount, void, refund or see profit, with a log of important changes." },
      { icon: "chart", title: "Profit reports", desc: "Sales, gross profit, best and worst sellers and a profit & loss you can hand to your accountant." },
    ],
    outcomes: [
      "Keep the processing rate you negotiated",
      "Inventory, reports and multi-location without add-on fees",
      "Know today's profit before you close up",
    ],
    included: {
      title: "The features other POS systems charge extra for —",
      highlight: "included",
      intro: "Every plan starts at a flat monthly price. No setup fee, no hardware bundle, no per-register charge.",
      items: [
        "Inventory management",
        "Unlimited products",
        "Barcode label printing",
        "Low-stock alerts",
        "Returns & exchanges",
        "Cash drawer & shift closing",
        "Sales & inventory reports",
        "Customer purchase history",
        "Cloud + Windows offline app",
        "Excel import of your catalog",
        "Free updates",
        "Email & WhatsApp support",
      ],
      footnote:
        "Starter plan. Bookkeeping, profit & loss, payroll and multi-location reports are on Growth ($15) and Business ($30).",
    },
    verticals: {
      title: "Built for independent",
      highlight: "American stores",
      items: [
        { icon: "cart", title: "Convenience & grocery stores", desc: "High-volume barcode checkout, fast-moving stock and daily cash reconciliation.", href: "/pos-software" },
        { icon: "tag", title: "Retail boutiques & gift shops", desc: "Variants, seasonal stock, returns and customer purchase history.", href: "/inventory-management-software" },
        { icon: "wrench", title: "Hardware & auto parts", desc: "Thousands of SKUs, contractor house accounts and supplier price updates.", href: "/inventory-management-software" },
        { icon: "smartphone", title: "Cell phone & repair stores", desc: "IMEI tracking, repair tickets, used device buy-backs and accessories.", href: "/mobile-shop-software" },
        { icon: "truck", title: "Wholesale & distributors", desc: "Customer credit, sales rep tracking and bulk price-list updates.", href: "/wholesale-distribution-software" },
        { icon: "chef", title: "Restaurants & cafés", desc: "Table management, kitchen display and QR-code ordering.", href: "/restaurant-pos-software" },
      ],
    },
    faqs: [
      { q: "How much does Logix Plus cost?", a: "Starter is $10/month, Growth is $15/month and Business is $30/month. Every plan includes POS and inventory. There are no setup fees, no contracts and no per-register fees." },
      { q: "Do I have to use a specific card processor?", a: "No. Logix Plus doesn't process payments, so you're never locked in. Take the card on the terminal you already use and record it as card on the sale." },
      { q: "What hardware do I need?", a: "Any computer, tablet or phone with a browser. It works with standard USB or Bluetooth barcode scanners, 58mm/80mm receipt printers, label printers and cash drawers connected to your receipt printer." },
      { q: "Can it handle multiple sales tax rates and exempt customers?", a: "Yes. Tax rates are set per product and per customer, so non-taxable items and tax-exempt customers are handled automatically on every sale." },
      { q: "What happens if my internet goes down?", a: "The Windows desktop app keeps ringing up sales offline and syncs them to the cloud when you're back online." },
      { q: "Can I bring my existing products over?", a: "Yes. Export your catalog to Excel or CSV from your current system and import it. Logix Plus flags any rows that need fixing and imports the rest." },
      { q: "Is there a long-term contract?", a: "No. You pay month to month and can cancel online at any time. If you stop, your data stays available in read-only mode so you can export it." },
      { q: "Can I try it before paying?", a: "Yes. Every account starts with a 14-day free trial loaded with sample data, and no credit card is needed to sign up." },
    ],
  },
  {
    slug: "pos-software-uk",
    metaTitle: "EPOS System for UK Small Businesses — VAT Ready | Logix Plus",
    metaDescription:
      "Affordable cloud EPOS with stock control and bookkeeping for UK shops. VAT on every sale, use any card machine, no contract. From about £8 a month. Free trial.",
    keywords: [
      "epos system uk",
      "epos system for small business",
      "pos software uk",
      "retail epos uk",
      "till system for small shop",
      "stock control software uk",
      "small business accounting software uk",
      "convenience store epos",
    ],
    navLabel: "United Kingdom",
    group: "region",
    eyebrow: "Built for UK independents",
    h1: "EPOS, stock control and bookkeeping in one —",
    h1Highlight: "VAT-ready, with no contract",
    closing: "Logix Plus puts your till, stock and books in one system — month to month, with no contract.",
    faqTitle: "Questions UK shop owners ask",
    intro:
      "Stop paying separately for a till, a stock system and bookkeeping software. Logix Plus brings them together with VAT on every sale, works with the card machine you already have, and runs month to month.",
    locale: "en_GB",
    hreflang: "en-GB",
    trustBar: [
      "Use your existing card machine",
      "VAT on every sale",
      "No contract · cancel online",
      "No per-till fees",
      "14-day free trial, no card",
    ],
    pains: [
      { icon: "lock", title: "Tied into long contracts", desc: "Many EPOS deals come with multi-year contracts and card terminals you can't change." },
      { icon: "coins", title: "Three subscriptions for one shop", desc: "One for the till, one for stock and one for bookkeeping, and they still don't talk to each other." },
      { icon: "percent", title: "VAT rebuilt by hand", desc: "Totting up standard, reduced and zero-rated sales from receipts every quarter." },
      { icon: "package", title: "Stock you can't see", desc: "Best sellers run out and slow lines tie up cash on the shelves." },
      { icon: "book", title: "Trade accounts in a notebook", desc: "Account customers and supplier balances tracked by hand, with nothing to send them." },
      { icon: "building", title: "A second shop doubles the admin", desc: "Separate systems per shop and no joined-up view of stock or takings." },
    ],
    features: [
      { icon: "scan", title: "Fast till", desc: "Scan or search, take cash, card or split payments and print or send the receipt." },
      { icon: "card", title: "Any card machine", desc: "Keep your existing terminal and provider — just record card payments on the sale." },
      { icon: "percent", title: "VAT on every sale", desc: "Standard, reduced and zero rates per product, shown on receipts and invoices." },
      { icon: "package", title: "Stock control", desc: "Live stock, low-stock alerts, deliveries against purchase orders and stock takes." },
      { icon: "users", title: "Trade accounts", desc: "Customer balances, statements and payments for account customers." },
      { icon: "book", title: "Bookkeeping built in", desc: "Supplier and customer ledgers, bank accounts, cash book and profit & loss." },
      { icon: "building", title: "Multi-shop", desc: "Up to 5 shops on one account with transfers and shop-by-shop reports." },
      { icon: "shield", title: "Staff permissions", desc: "Decide who can discount, refund, void or see margins." },
      { icon: "cloud", title: "Cloud & offline", desc: "Use any browser, or the Windows app that keeps trading when the internet drops." },
    ],
    outcomes: [
      "One subscription instead of three",
      "VAT totals ready for your return",
      "Month to month — cancel any time",
    ],
    included: {
      title: "Everything a small shop needs,",
      highlight: "in one price",
      intro: "No setup fee, no hardware bundle, no per-till charge and no contract.",
      items: [
        "Stock control",
        "Unlimited products",
        "Barcode label printing",
        "Low-stock alerts",
        "Refunds & exchanges",
        "Cash-up & shift closing",
        "Sales & stock reports",
        "Customer purchase history",
        "Cloud + Windows offline app",
        "Excel import of your products",
        "Free updates",
        "Email & WhatsApp support",
      ],
      footnote:
        "Starter plan. Bookkeeping, profit & loss, payroll and multi-shop reports are on Growth and Business. Plans are billed in US dollars; pound amounts are approximate.",
    },
    verticals: {
      title: "Made for",
      highlight: "UK independents",
      items: [
        { icon: "cart", title: "Convenience stores & newsagents", desc: "Quick barcode sales, fast-moving stock and daily cash-up.", href: "/pos-software" },
        { icon: "tag", title: "Independent retailers", desc: "Clothing, gifts, homeware and more, with variants and returns.", href: "/inventory-management-software" },
        { icon: "smartphone", title: "Phone shops & repairs", desc: "IMEI tracking, repair jobs and refurbished handset sales.", href: "/mobile-shop-software" },
        { icon: "truck", title: "Wholesalers & cash-and-carry", desc: "Trade accounts, price lists and bulk invoicing.", href: "/wholesale-distribution-software" },
        { icon: "wrench", title: "DIY & hardware", desc: "Large catalogues, trade customers and supplier price updates.", href: "/inventory-management-software" },
        { icon: "chef", title: "Cafés & takeaways", desc: "Table orders, kitchen screen and QR ordering.", href: "/restaurant-pos-software" },
      ],
    },
    faqs: [
      { q: "How much does it cost in the UK?", a: "Plans are $10, $15 and $30 a month (roughly £8, £12 and £23), billed monthly by card. No setup fees, no contract, and you can cancel at any time." },
      { q: "Does it work with my card machine?", a: "Yes. Logix Plus doesn't process payments, so you keep your existing terminal and provider and record the card payment on the sale." },
      { q: "Is it Making Tax Digital (MTD) compatible?", a: "Logix Plus records VAT on every sale and purchase and gives you the totals for your return. Submission to HMRC is done by your accountant or through MTD bridging software." },
      { q: "What hardware do I need?", a: "Any PC, tablet or phone with a browser, plus a standard barcode scanner and receipt printer if you want them. A cash drawer can open from the receipt printer." },
      { q: "What if the internet goes down?", a: "The Windows desktop app keeps trading offline and syncs sales when the connection returns." },
      { q: "Can I try it before paying?", a: "Yes. Every account starts with a 14-day free trial with sample data, and no card is needed to sign up." },
    ],
  },
  {
    slug: "pos-software-pakistan",
    metaTitle: "POS & ERP Software in Pakistan | Urdu, PKR | Logix Plus",
    metaDescription:
      "Pakistan's easy POS, accounts & inventory software. Urdu support, PKR pricing from Rs 2,800/month, JazzCash & Easypaisa payment, WhatsApp support.",
    keywords: [
      "pos software pakistan",
      "erp software pakistan",
      "accounting software pakistan",
      "billing software pakistan",
      "inventory software pakistan",
      "software house faisalabad",
      "shop software urdu",
    ],
    navLabel: "Pakistan",
    group: "region",
    eyebrow: "Made in Pakistan · Built for Pakistani businesses",
    h1: "POS, accounts & stock software for Pakistan —",
    h1Highlight: "in Urdu and in rupees",
    intro:
      "Replace the khata register, the calculator and the Excel sheet with one simple system. Pay in rupees by bank, JazzCash or Easypaisa and get support on WhatsApp from a local team.",
    locale: "en_PK",
    hreflang: "en-PK",
    showPkr: true,
    pains: [
      { icon: "book", title: "Khata and udhaar out of control", desc: "Credit customers, cheques and supplier payments tracked in notebooks." },
      { icon: "coins", title: "Foreign software, dollar prices", desc: "Expensive tools that don't fit how Pakistani shops actually work." },
      { icon: "zap", title: "Load-shedding and weak internet", desc: "Billing stops whenever the power or internet goes." },
      { icon: "message", title: "No local support", desc: "Nobody to call in your language when something goes wrong." },
    ],
    features: [
      { icon: "languages", title: "Urdu & English", desc: "Use the software and send receipts and reminders in Urdu or English." },
      { icon: "wallet", title: "Pay in PKR", desc: "Bank transfer, JazzCash or Easypaisa for 1, 3, 6 or 12 months." },
      { icon: "zap", title: "Works through outages", desc: "The Windows desktop app keeps billing offline and syncs later." },
      { icon: "message", title: "WhatsApp everything", desc: "Send invoices, balance reminders and statements to customers on WhatsApp." },
      { icon: "percent", title: "GST ready", desc: "Set GST rates on products and parties and get tax on every invoice." },
      { icon: "headset", title: "Local support", desc: "Setup help and support by phone and WhatsApp from our team in Faisalabad." },
    ],
    outcomes: [
      "Udhaar tracked to the last rupee",
      "Billing continues during load-shedding",
      "Plans from Rs 2,800 per month",
    ],
    faqs: [
      { q: "How much does it cost in Pakistan?", a: "Plans start from Rs 2,800 per month. You can pay by bank transfer, JazzCash or Easypaisa for 1, 3, 6 or 12 months at a time." },
      { q: "Do you provide installation and training?", a: "Yes. Our team helps you set up your products, import your data and train your staff over WhatsApp or phone." },
      { q: "Which cities do you serve?", a: "All of Pakistan — Lahore, Karachi, Islamabad, Rawalpindi, Faisalabad, Multan, Peshawar and everywhere else. Everything is online, so location doesn't matter." },
      { q: "Is it good for kiryana stores and marts?", a: "Yes. Barcode billing, fast checkout, udhaar ledgers and low-stock alerts are made for kiryana stores, marts and supermarkets." },
    ],
  },
];

export function getLandingPage(slug: string) {
  return LANDING_PAGES.find((p) => p.slug === slug);
}
