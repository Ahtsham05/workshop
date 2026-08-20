const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Purchase, Product, ProductVariant, Supplier, SupplierLedger, Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const { resolvePurchaseLedgerInvoiceType } = require('../utils/ledgerInvoiceType');
const { buildSupplierPurchaseLedgerEntries } = require('../utils/ledgerSettlement');
const supplierLedgerService = require('./supplierLedger.service');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const accountsSystemService = require('./accountsSystem.service');
const imeiService = require('./imei.service');
const inventorySyncService = require('./inventorySync.service');
const inventoryService = require('./inventory.service');
const batchService = require('./batch.service');
const partnerProfitShareRuleService = require('./partnerProfitShareRule.service');
const { normalizeBusinessType } = require('../config/businessTypes');

/** Post (or re-post) double-entry journal entries for a purchase. Fire-and-forget. */
const postPurchaseToAccounts = (purchase) => {
  if (!purchase) return;
  const scope = {
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    createdBy: purchase.createdBy,
  };
  accountsSystemService.postPurchase(scope, purchase).catch(() => {});
};
const { toStockQuantity, getStockQuantityFromItem } = require('../utils/inventoryUnitConversion');
const { applySupplierLinkedListSearch } = require('../utils/listSearchFilter');
const { resolvePurchaseInvoiceBalance } = require('../utils/purchaseBalance');

const getOrganizationBusinessType = async (organizationId) => {
  if (!organizationId) {
    return 'other';
  }

  const organization = await Organization.findById(organizationId).select('businessType').lean();
  return normalizeBusinessType(organization?.businessType);
};

const getPurchaseProductId = (item) => {
  if (item?.product?._id) {
    return item.product._id.toString();
  }

  if (item?.product) {
    return item.product.toString();
  }

  return '';
};

const getPurchaseVariantId = (item) => {
  if (item?.variantId?._id) return item.variantId._id.toString();
  if (item?.variantId) return item.variantId.toString();
  return '';
};

/** (productId, variantId) composite key — two different variants of the same
 * product must be matched/adjusted as separate lines, not conflated. */
const getPurchaseItemKey = (item) => `${getPurchaseProductId(item)}:${getPurchaseVariantId(item)}`;

/**
 * Syncs serial/IMEI numbers for a variant (real or hidden-default) purchase line item —
 * the counterpart to the plain-product `imeiService.syncImeisForPurchaseItem` calls
 * elsewhere in this file, which never ran for variant items. That was a real gap: a
 * batch-tracked + serial-tracked product purchased through this module silently dropped
 * every serial number entered on the line. `batchId` links each unit to the specific
 * batch it arrived in (see imei.model.js), so the sale screen can filter "available
 * serials" down to the batch picked on that line instead of showing every in-stock unit
 * of the product regardless of which batch it's actually in.
 */
const syncVariantSerials = async ({ variant, imeis, batchId, purchase, netUnitCost, supplierId, supplierName, session }) => {
  const product = await Product.findById(variant.productId).select('name trackImei trackSerial').session(session || null);
  if (!product || !(product.trackImei || product.trackSerial)) return;
  await imeiService.syncImeisForPurchaseItem({
    purchaseId: purchase._id,
    productId: variant.productId,
    productName: product.name,
    imeis: imeis || [],
    type: product.trackSerial ? 'serial' : 'imei',
    batchId: batchId || null,
    purchasePrice: netUnitCost,
    supplierId: supplierId || null,
    supplierName: supplierName || '',
    purchaseDate: purchase.purchaseDate,
    organizationId: purchase.organizationId,
    branchId: purchase.branchId,
    createdBy: purchase.createdBy,
    session,
  });
};

/**
 * Tags a just-created/re-stocked Batch with the investor who funded it, and auto-creates the
 * matching batch-scoped PartnerProfitShareRule so that partner earns off units sold from this
 * exact lot — one purchase-time step instead of a separate manual rule setup. No-op unless
 * the line explicitly carries an investorRule. Runs inside the caller's transaction (`session`)
 * so a failure here rolls back the whole purchase, same integrity guarantee as batch/serial
 * creation above it.
 */
const applyInvestorRuleToBatch = async ({ item, batch, variant, purchase, session }) => {
  const investorRule = item.investorRule;
  if (!investorRule || !investorRule.partnerId) return;

  batch.partnerId = investorRule.partnerId;
  await batch.save({ session });

  await partnerProfitShareRuleService.createProfitShareRule(
    {
      organizationId: purchase.organizationId,
      partnerId: investorRule.partnerId,
      scope: 'batch',
      productId: variant.productId,
      variantId: variant._id,
      batchId: batch._id,
      shareType: investorRule.shareType,
      rate: investorRule.rate,
      sourcePurchaseId: purchase._id,
      effectiveFrom: purchase.purchaseDate,
      isActive: true,
      createdBy: purchase.createdBy,
    },
    session
  );
};

/** Sum of all line totals (each already net of its own item-level discount) — the
 * base the invoice-level discount is spread proportionally across in
 * resolveItemNetUnitCost. */
const resolvePurchaseSubtotal = (items) =>
  (items || []).reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const lineTotal = item.total != null ? Number(item.total) : quantity * Number(item.priceAtPurchase || 0);
    return sum + lineTotal;
  }, 0);

/**
 * True per-unit cost after both this line's own discount and its proportional share
 * of the invoice-level discount — what actually gets recorded as inventory cost
 * (product.cost, batch costPerUnit, inventory sync unitCost, IMEI purchasePrice), so
 * margin/ROI/profit reports reflect what was really paid, not the pre-discount price.
 * `priceAtPurchase` itself is left untouched everywhere else — it's the negotiated
 * unit price shown on the purchase record/print, unaffected by this allocation.
 */
const resolveItemNetUnitCost = (item, purchaseSubtotal, purchaseDiscount) => {
  const quantity = Number(item.quantity || 0);
  if (quantity <= 0) return Number(item.priceAtPurchase || 0);
  const lineTotal = item.total != null ? Number(item.total) : quantity * Number(item.priceAtPurchase || 0);
  const discount = Number(purchaseDiscount || 0);
  const shareOfPurchaseDiscount =
    discount > 0 && purchaseSubtotal > 0 ? (lineTotal / purchaseSubtotal) * discount : 0;
  const netLineTotal = Math.max(0, lineTotal - shareOfPurchaseDiscount);
  return netLineTotal / quantity;
};

/**
 * Which settlement-status ('Cash'/'Wallet'/'Credit') string to keep storing on the legacy
 * `paymentType` field, derived from the new `type`+`paymentMethod` fields. Kept in sync purely
 * for backward compatibility with reports/accounting code that still reads `paymentType`
 * directly — client input for this field is no longer trusted.
 */
const derivePurchasePaymentType = (purchase) => {
  if (purchase.type === 'credit') return 'Credit';
  return purchase.paymentMethod === 'wallet' ? 'Wallet' : 'Cash';
};

/**
 * Resolve which portion of `paidAmount` is a Cash Book entry vs a Wallet Entry, and which
 * wallet, from (paymentMethod, walletType, splitPaymentMethod, splitWalletType, splitPaidAmount).
 * The split leg is always validated (client + Joi) to be the opposite bucket from the primary
 * leg, so there is at most one cash-bucket amount and one wallet-bucket amount per purchase —
 * never two of the same kind that could collide on the same Cash Book/Wallet Entry reference key.
 */
const resolvePurchasePaymentLegs = (source) => {
  if (!source) return { cashAmount: 0, walletAmount: 0, walletType: '' };

  const paidAmount = Number(source.paidAmount || 0);
  const splitAmount = Math.max(0, Math.min(Number(source.splitPaidAmount || 0), paidAmount));
  const isWalletPrimary = source.paymentMethod === 'wallet' && source.walletType;
  const splitMethod = source.splitPaymentMethod;

  if (isWalletPrimary) {
    const cashAmount = splitMethod === 'cash' ? splitAmount : 0;
    return {
      cashAmount,
      walletAmount: Math.max(0, paidAmount - cashAmount),
      walletType: String(source.walletType).trim(),
    };
  }

  if (splitMethod === 'wallet' && source.splitWalletType) {
    const walletAmount = splitAmount;
    return {
      cashAmount: Math.max(0, paidAmount - walletAmount),
      walletAmount,
      walletType: String(source.splitWalletType).trim(),
    };
  }

  return { cashAmount: paidAmount, walletAmount: 0, walletType: '' };
};

const resolvePurchaseLedgerPaymentMethod = (purchase) => {
  const legs = resolvePurchasePaymentLegs(purchase);
  if (legs.cashAmount > 0 && legs.walletAmount > 0) {
    return `Cash + Wallet (${legs.walletType})`;
  }
  if (legs.walletAmount > 0) {
    return `Wallet (${legs.walletType})`;
  }
  return 'Cash';
};

const DEFAULT_PURCHASE_INVOICE_SEQ = 5000;

const parsePurchaseInvoiceSequence = (invoiceNumber) => {
  const match = String(invoiceNumber || '').match(/(\d+)$/);
  if (!match) return null;
  const seq = parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
};

/**
 * Generate the next purchase invoice number (format: INV-####).
 * Scans existing numbers and uses the highest trailing numeric suffix,
 * ignoring malformed values like INV-NaN.
 */
const generateNextPurchaseInvoiceNumber = async () => {
  const purchases = await Purchase.find({}).select('invoiceNumber').lean();

  let maxSeq = DEFAULT_PURCHASE_INVOICE_SEQ;
  for (const purchase of purchases) {
    const seq = parsePurchaseInvoiceSequence(purchase.invoiceNumber);
    if (seq !== null) {
      maxSeq = Math.max(maxSeq, seq);
    }
  }

  return `INV-${maxSeq + 1}`;
};

/**
 * Guard against accidentally recording the same supplier bill twice — a common data-entry
 * mistake this field exists specifically to catch. Scoped to (organizationId, supplier),
 * not global: different suppliers routinely reuse the same small bill numbers (e.g. "001"),
 * so a global unique index would throw false positives. `excludePurchaseId` skips the
 * purchase being edited so re-saving it unchanged doesn't collide with itself.
 */
const assertVendorBillNumberAvailable = async ({ organizationId, supplier, vendorBillNumber, excludePurchaseId }) => {
  const trimmed = String(vendorBillNumber || '').trim();
  if (!trimmed || !supplier) return;

  const duplicateFilter = {
    organizationId,
    supplier,
    vendorBillNumber: trimmed,
  };
  if (excludePurchaseId) {
    duplicateFilter._id = { $ne: excludePurchaseId };
  }

  const duplicate = await Purchase.findOne(duplicateFilter).select('invoiceNumber').lean();
  if (duplicate) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Vendor bill number "${trimmed}" is already recorded for this supplier (Purchase #${duplicate.invoiceNumber})`
    );
  }
};

/**
 * Sync Cash Book + Wallet Entry + Wallet.balance for a purchase's payment, from the resolved
 * cash/wallet legs. `previous` is a plain snapshot of the pre-update payment fields (or `null`
 * on create) — used only to compute the correct wallet-balance delta on edits; Cash Book /
 * Wallet Entry themselves are always fully re-derived via idempotent upsert/delete.
 */
const syncPurchaseCashAndWalletEntries = async (purchase, previous) => {
  const current = resolvePurchasePaymentLegs(purchase);
  const prior = resolvePurchasePaymentLegs(previous);

  if (current.cashAmount > 0) {
    await cashBookService.upsertReferenceEntry({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: 'expense',
      source: 'purchase',
      amount: current.cashAmount,
      paymentMethod: 'cash',
      referenceId: purchase._id,
      referenceModel: 'Purchase',
      description: `Payment made for Purchase #${purchase.invoiceNumber}`,
      date: purchase.purchaseDate || purchase.createdAt || new Date(),
      createdBy: purchase.createdBy,
    });
  } else {
    await cashBookService.deleteEntriesByReference(purchase._id, 'Purchase');
  }

  if (current.walletAmount > 0 && current.walletType) {
    await walletEntryService.upsertReferenceEntry({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      walletType: current.walletType,
      type: 'out',
      amount: current.walletAmount,
      referenceId: purchase._id,
      referenceModel: 'Purchase',
      description: `Wallet payment sent for Purchase #${purchase.invoiceNumber}`,
      date: purchase.purchaseDate || purchase.createdAt || new Date(),
      createdBy: purchase.createdBy,
      updatedBy: purchase.updatedBy || purchase.createdBy,
    });
  } else {
    await walletEntryService.deleteEntriesByReference(purchase._id, 'Purchase');
  }

  // Wallet.balance direct adjustment — delta-aware against whatever the wallet leg was before.
  if (current.walletAmount > 0 && current.walletType) {
    if (prior.walletAmount > 0 && prior.walletType === current.walletType) {
      const delta = current.walletAmount - prior.walletAmount;
      if (delta !== 0) {
        await walletService.adjustWalletBalance({
          organizationId: purchase.organizationId,
          branchId: purchase.branchId,
          type: current.walletType,
          amount: Math.abs(delta),
          operation: delta > 0 ? 'deduct' : 'add',
          userId: purchase.updatedBy || purchase.createdBy,
        });
      }
      return;
    }

    if (prior.walletAmount > 0 && prior.walletType) {
      await walletService.adjustWalletBalance({
        organizationId: purchase.organizationId,
        branchId: purchase.branchId,
        type: prior.walletType,
        amount: prior.walletAmount,
        operation: 'add',
        userId: purchase.updatedBy || purchase.createdBy,
      });
    }

    await walletService.adjustWalletBalance({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: current.walletType,
      amount: current.walletAmount,
      operation: 'deduct',
      userId: purchase.updatedBy || purchase.createdBy,
    });
  } else if (prior.walletAmount > 0 && prior.walletType) {
    await walletService.adjustWalletBalance({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: prior.walletType,
      amount: prior.walletAmount,
      operation: 'add',
      userId: purchase.updatedBy || purchase.createdBy,
    });
  }
};

/**
 * Create a purchase record
 * @param {Object} purchaseBody
 * @returns {Promise<Purchase>}
 */
const createPurchase = async (purchaseBody) => {
  await assertVendorBillNumberAvailable({
    organizationId: purchaseBody.organizationId,
    supplier: purchaseBody.supplier,
    vendorBillNumber: purchaseBody.vendorBillNumber,
  });

  const businessType = await getOrganizationBusinessType(purchaseBody.organizationId);

  const normalizedBody = {
    ...purchaseBody,
    type: purchaseBody.type || 'cash',
    paymentMethod: purchaseBody.paymentMethod || 'cash',
    balance:
      purchaseBody.paidAmount !== undefined
        ? resolvePurchaseInvoiceBalance(purchaseBody.totalAmount, purchaseBody.paidAmount)
        : purchaseBody.balance,
  };
  normalizedBody.paymentType = derivePurchasePaymentType(normalizedBody);

  // The purchase record and every stock/batch/inventory/serial write it triggers must
  // succeed or fail together. Before this, a duplicate serial/IMEI (or any other error)
  // partway through the items loop would throw *after* the Purchase document was already
  // persisted — the request came back as an error, but the purchase (and any stock
  // already adjusted for earlier items) silently remained in the database. Wrapping the
  // whole thing in a transaction makes a failure genuinely undo everything, matching what
  // the error response tells the user. Ledger/cashbook/accounts posting below stays
  // outside the transaction, same as before — those have always been best-effort and
  // independently fault-tolerant, not part of the purchase's own data integrity.
  const session = await mongoose.startSession();
  let purchase;
  try {
    await session.withTransaction(async () => {
      const created = await Purchase.create([normalizedBody], { session });
      purchase = created[0];

      const supplierDoc = purchase.supplier
        ? await Supplier.findById(purchase.supplier).select('name').session(session)
        : null;
      const purchaseSubtotal = resolvePurchaseSubtotal(purchase.items);
      const purchaseDiscount = Number(purchase.discount || 0);

      // Now, update the stock quantity of each product in the purchase
      for (const item of purchase.items) {
        const netUnitCost = resolveItemNetUnitCost(item, purchaseSubtotal, purchaseDiscount);
        // Real-variant line item — bypasses the legacy Product.stockQuantity path entirely
        // (that field is a fallback-only display value once a product hasVariants; it must
        // never be mutated by variant-specific purchasing). Batch/expiry-tracked variants
        // create a Batch (the new primary source of batches, see
        // docs/architecture/universal-product-migration.md); other real variants get a
        // plain inventory increment via inventory.service.js.
        if (item.variantId) {
          const variant = await ProductVariant.findById(item.variantId).session(session);
          if (variant) {
            const quantityDelta = Number(item.quantity || 0);
            item.stockQuantity = quantityDelta;
            let batchId = null;

            if ((variant.trackBatch || variant.trackExpiry) && item.batchNumber) {
              const batch = await batchService.createBatch(variant._id, {
                batchNumber: item.batchNumber,
                quantity: quantityDelta,
                costPerUnit: netUnitCost,
                sellingPrice: item.sellingPriceAtPurchase,
                expiryDate: item.expiryDate,
                purchaseId: purchase._id,
                createdBy: purchase.createdBy,
                session,
              });
              batchId = batch._id;
              await applyInvestorRuleToBatch({ item, batch, variant, purchase, session });
            } else {
              await inventoryService.adjustInventory(variant._id, {
                quantityDelta,
                reason: 'Purchase',
                userId: purchase.createdBy,
                session,
              });
            }

            if (item.imeis && item.imeis.length > 0) {
              await syncVariantSerials({
                variant,
                imeis: item.imeis,
                batchId,
                purchase,
                netUnitCost,
                supplierId: purchase.supplier,
                supplierName: supplierDoc?.name,
                session,
              });
            }
          }
          continue;
        }

        const product = await Product.findById(item.product).session(session);

        if (product) {
          const conversion = toStockQuantity({ product, item, businessType });
          item.unit = conversion.lineUnit;
          item.conversionFactor = conversion.conversionFactor;
          item.stockQuantity = conversion.stockQuantity;

          // Increase stock in product stock unit (typically pcs)
          product.stockQuantity += conversion.stockQuantity;

          // Update the product's cost price to the latest purchase price — net of any
          // item/invoice discount, since that's what was actually paid per unit.
          if (item.priceAtPurchase > 0) {
            product.cost = netUnitCost;
          }

          // Update the product's selling price if provided
          if (item.sellingPriceAtPurchase > 0) {
            product.price = item.sellingPriceAtPurchase;
          }

          // Save the updated product
          await product.save({ session });

          await inventorySyncService.recordStockChange({
            organizationId: purchase.organizationId,
            productId: product._id,
            quantityDelta: conversion.stockQuantity,
            type: 'purchase',
            refType: 'Purchase',
            refId: purchase._id,
            unitCost: netUnitCost,
            createdBy: purchase.createdBy,
          });

          // Track per-unit IMEI/serial numbers for products that require it (mobile phones / serialized goods)
          if ((product.trackImei || product.trackSerial) && item.imeis && item.imeis.length > 0) {
            await imeiService.syncImeisForPurchaseItem({
              purchaseId: purchase._id,
              productId: product._id,
              productName: product.name,
              imeis: item.imeis,
              type: product.trackSerial ? 'serial' : 'imei',
              purchasePrice: netUnitCost,
              supplierId: purchase.supplier || null,
              supplierName: supplierDoc?.name || '',
              purchaseDate: purchase.purchaseDate,
              organizationId: purchase.organizationId,
              branchId: purchase.branchId,
              createdBy: purchase.createdBy,
              session,
            });
          }
        }
      }

      // Calculate balance if paidAmount is provided
      if (purchase.paidAmount !== undefined) {
        purchase.balance = resolvePurchaseInvoiceBalance(purchase.totalAmount, purchase.paidAmount);
      }

      // Save the purchase with balance calculated
      await purchase.save({ session });
    });
  } finally {
    await session.endSession();
  }

  await syncPurchaseCashAndWalletEntries(purchase, null);
  postPurchaseToAccounts(purchase);

  // Create supplier ledger entry if supplier is provided
  if (purchase.supplier) {
    try {
      const ledgerPaymentMethod = resolvePurchaseLedgerPaymentMethod(purchase);
      const ledgerInvoiceType = resolvePurchaseLedgerInvoiceType(purchase);
      console.log('Creating supplier ledger entry for purchase:', {
        supplier: purchase.supplier,
        invoiceNumber: purchase.invoiceNumber,
        totalAmount: purchase.totalAmount,
        paidAmount: purchase.paidAmount,
        balance: purchase.balance
      });

      const ledgerEntries = buildSupplierPurchaseLedgerEntries({
        organizationId: purchase.organizationId,
        branchId: purchase.branchId,
        supplierId: purchase.supplier,
        referenceId: purchase._id,
        invoiceNumber: purchase.invoiceNumber,
        vendorBillNumber: purchase.vendorBillNumber,
        transactionDate: purchase.purchaseDate || new Date(),
        totalAmount: purchase.totalAmount,
        paidAmount: purchase.paidAmount,
        paymentType: purchase.paymentType,
        invoiceType: ledgerInvoiceType,
        paymentMethod: ledgerPaymentMethod,
        itemsCount: purchase.items.length,
        balance: purchase.balance,
      });

      for (const entry of ledgerEntries) {
        const created = await supplierLedgerService.createLedgerEntry(entry);
        console.log('Supplier ledger entry created for purchase:', purchase.invoiceNumber, 'Entry ID:', created._id);
      }
    } catch (error) {
      console.error('Failed to create supplier ledger entry:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      // Don't fail the purchase creation if ledger entry fails
    }
  }

  return purchase;
};


/**
 * Query for purchases
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum number of results per page
 * @param {number} [options.page] - Current page
 * @param {string} [options.search] - Search query
 * @returns {Promise<QueryResult>}
 */
const queryPurchases = async (filter, options) => {
  const opts = { ...options };
  await applySupplierLinkedListSearch(filter, opts, {
    documentFields: ['invoiceNumber', 'vendorBillNumber', 'notes'],
  });
  // Array form, not a comma-joined string — the paginate plugin's string parser
  // converts each dotted path into a nested {path,populate} shorthand via
  // reverse+reduce, and two of those sharing the same top-level "items" path silently
  // overwrite each other's nested populate instead of merging. Passing an array calls
  // .populate() with each entry as-is, so flat dotted strings like 'items.variantId'
  // work the same way getPurchaseById already does it successfully.
  opts.populate = ['supplier', 'items.product', 'items.variantId', { path: 'createdBy', select: 'name email' }];
  const purchases = await Purchase.paginate(filter, opts);
  return purchases;
};

/**
 * Get purchase by id
 * @param {ObjectId} id
 * @returns {Promise<Purchase>}
 */
const getPurchaseById = async (id) => {
  return Purchase.findById(id)
    .populate('supplier') // Populate the 'supplier' field with the referenced supplier document
    .populate('items.product') // Populate the 'product' field within each item in the items array
    .populate('items.variantId') // Real-variant line items — lets views show "Toshiba — 12" not just "Toshiba"
    .populate('createdBy', 'name email');
};

/**
 * Update purchase by id
 * @param {ObjectId} purchaseId
 * @param {Object} updateBody
 * @returns {Promise<Purchase>}
 */
const updatePurchaseById = async (purchaseId, updateBody) => {
  // Find the purchase by its ID
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }

  // Store original values for ledger update
  const originalTotalAmount = purchase.totalAmount;
  const originalPaidAmount = purchase.paidAmount || 0;
  const originalSupplier = purchase.supplier?._id || purchase.supplier;
  const originalPaymentType = purchase.paymentType;
  const originalVendorBillNumber = purchase.vendorBillNumber || '';

  if (updateBody.vendorBillNumber !== undefined) {
    await assertVendorBillNumberAvailable({
      organizationId: purchase.organizationId,
      supplier: updateBody.supplier || originalSupplier,
      vendorBillNumber: updateBody.vendorBillNumber,
      excludePurchaseId: purchase._id,
    });
  }
  // Snapshot of every payment-leg field, for delta-aware Cash Book/Wallet resync below.
  const previousPaymentLegSnapshot = {
    paymentMethod: purchase.paymentMethod,
    walletType: purchase.walletType,
    splitPaymentMethod: purchase.splitPaymentMethod,
    splitWalletType: purchase.splitWalletType,
    paidAmount: purchase.paidAmount,
    splitPaidAmount: purchase.splitPaidAmount,
  };
  const businessType = await getOrganizationBusinessType(purchase.organizationId);
  const supplierIdForUpdate = updateBody.supplier || originalSupplier;
  const supplierDocForUpdate = supplierIdForUpdate ? await Supplier.findById(supplierIdForUpdate).select('name') : null;
  const updateSubtotal = resolvePurchaseSubtotal(updateBody.items || purchase.items);
  const updateDiscount = Number(updateBody.discount ?? purchase.discount ?? 0);

  // Loop through the updated items and calculate the stock adjustments and price updates
  for (const updatedItem of updateBody.items || []) {
    const netUnitCost = resolveItemNetUnitCost(updatedItem, updateSubtotal, updateDiscount);
    const updatedItemKey = `${updatedItem.product.toString()}:${updatedItem.variantId ? updatedItem.variantId.toString() : ''}`;

    // Find the existing purchase item — matched by (product, variant) so two
    // different variants of the same product are never conflated.
    const existingItem = purchase.items.find((item) => getPurchaseItemKey(item) === updatedItemKey);

    if (existingItem) {
      if (updatedItem.variantId) {
        // Real-variant / batch-tracked line item — adjust Inventory/Batch instead
        // of the legacy Product.stockQuantity fallback, mirroring createPurchase's
        // variant branch (which also never touches Product.cost/price for these).
        const variant = await ProductVariant.findById(updatedItem.variantId);
        if (variant) {
          const previousQuantity = Number(existingItem.stockQuantity || existingItem.quantity || 0);
          const newQuantity = Number(updatedItem.quantity || 0);
          const quantityDifference = newQuantity - previousQuantity;
          updatedItem.stockQuantity = newQuantity;
          let batchId = null;

          if ((variant.trackBatch || variant.trackExpiry) && updatedItem.batchNumber) {
            if (quantityDifference !== 0) {
              const result = await batchService.adjustBatchQuantity(variant._id, {
                batchNumber: updatedItem.batchNumber,
                quantityDelta: quantityDifference,
                createdBy: purchase.createdBy,
              });
              batchId = result.batchId;
            } else {
              // Quantity unchanged — still resolve the batch id so edited serials
              // (added/removed without a quantity change) link to the right batch.
              batchId = await batchService.findBatchIdByNumber(variant._id, updatedItem.batchNumber);
            }
          } else if (quantityDifference !== 0) {
            await inventoryService.adjustInventory(variant._id, {
              quantityDelta: quantityDifference,
              reason: 'Purchase edit',
              userId: purchase.createdBy,
            });
          }

          await syncVariantSerials({
            variant,
            imeis: updatedItem.imeis,
            batchId,
            purchase,
            netUnitCost,
            supplierId: supplierIdForUpdate,
            supplierName: supplierDocForUpdate?.name,
          });
        }
        continue;
      }

      // EXISTING ITEM - Calculate the difference and adjust stock
      const product = await Product.findById(updatedItem.product);

      if (product) {
        const updatedStock = getStockQuantityFromItem({ product, item: updatedItem, businessType });

        // Subtract the previous quantity and add the updated quantity
        const previousQuantity = Number(existingItem.stockQuantity || existingItem.quantity || 0);
        const quantityDifference = updatedStock.stockQuantity - previousQuantity;

        // Update the stock quantity
        product.stockQuantity += quantityDifference;

        updatedItem.unit = updatedStock.lineUnit;
        updatedItem.conversionFactor = updatedStock.conversionFactor;
        updatedItem.stockQuantity = updatedStock.stockQuantity;

        // Update the product's cost price to the latest purchase price — net of any
        // item/invoice discount, since that's what was actually paid per unit.
        if (updatedItem.priceAtPurchase > 0) {
          product.cost = netUnitCost;
        }

        // Update the product's selling price if provided
        if (updatedItem.sellingPriceAtPurchase > 0) {
          product.price = updatedItem.sellingPriceAtPurchase;
        }

        // Save the product with updated stock, cost, and selling price
        await product.save();

        await inventorySyncService.recordStockChange({
          organizationId: purchase.organizationId,
          productId: product._id,
          quantityDelta: quantityDifference,
          type: 'purchase',
          refType: 'Purchase',
          refId: purchase._id,
          unitCost: netUnitCost,
          createdBy: purchase.createdBy,
        });

        if (product.trackImei || product.trackSerial) {
          await imeiService.syncImeisForPurchaseItem({
            purchaseId: purchase._id,
            productId: product._id,
            productName: product.name,
            imeis: updatedItem.imeis || [],
            type: product.trackSerial ? 'serial' : 'imei',
            purchasePrice: netUnitCost,
            supplierId: supplierIdForUpdate || null,
            supplierName: supplierDocForUpdate?.name || '',
            purchaseDate: purchase.purchaseDate,
            organizationId: purchase.organizationId,
            branchId: purchase.branchId,
            createdBy: purchase.createdBy,
          });
        }
      }
    } else if (updatedItem.variantId) {
      // NEW variant/batch-tracked line item added during edit — same Inventory/Batch
      // path as createPurchase's variant branch.
      const variant = await ProductVariant.findById(updatedItem.variantId);
      if (variant) {
        const quantityDelta = Number(updatedItem.quantity || 0);
        updatedItem.stockQuantity = quantityDelta;
        let batchId = null;

        if ((variant.trackBatch || variant.trackExpiry) && updatedItem.batchNumber) {
          const batch = await batchService.createBatch(variant._id, {
            batchNumber: updatedItem.batchNumber,
            quantity: quantityDelta,
            costPerUnit: netUnitCost,
            sellingPrice: updatedItem.sellingPriceAtPurchase,
            expiryDate: updatedItem.expiryDate,
            purchaseId: purchase._id,
            createdBy: purchase.createdBy,
          });
          batchId = batch._id;
          await applyInvestorRuleToBatch({ item: updatedItem, batch, variant, purchase, session: undefined });
        } else {
          await inventoryService.adjustInventory(variant._id, {
            quantityDelta,
            reason: 'Purchase edit (new item)',
            userId: purchase.createdBy,
          });
        }

        if (updatedItem.imeis && updatedItem.imeis.length > 0) {
          await syncVariantSerials({
            variant,
            imeis: updatedItem.imeis,
            batchId,
            purchase,
            netUnitCost,
            supplierId: supplierIdForUpdate,
            supplierName: supplierDocForUpdate?.name,
          });
        }
      }
    } else {
      // NEW ITEM - Add the full quantity to stock (wasn't in original purchase)
      const product = await Product.findById(updatedItem.product);

      if (product) {
        const updatedStock = getStockQuantityFromItem({ product, item: updatedItem, businessType });

        // Add the full quantity since this is a new item
        product.stockQuantity += updatedStock.stockQuantity;

        updatedItem.unit = updatedStock.lineUnit;
        updatedItem.conversionFactor = updatedStock.conversionFactor;
        updatedItem.stockQuantity = updatedStock.stockQuantity;

        // Update the product's cost price to the latest purchase price — net of any
        // item/invoice discount, since that's what was actually paid per unit.
        if (updatedItem.priceAtPurchase > 0) {
          product.cost = netUnitCost;
        }

        // Update the product's selling price if provided
        if (updatedItem.sellingPriceAtPurchase > 0) {
          product.price = updatedItem.sellingPriceAtPurchase;
        }

        // Save the product with updated stock, cost, and selling price
        await product.save();

        await inventorySyncService.recordStockChange({
          organizationId: purchase.organizationId,
          productId: product._id,
          quantityDelta: updatedStock.stockQuantity,
          type: 'purchase',
          refType: 'Purchase',
          refId: purchase._id,
          unitCost: netUnitCost,
          createdBy: purchase.createdBy,
        });

        if ((product.trackImei || product.trackSerial) && updatedItem.imeis && updatedItem.imeis.length > 0) {
          await imeiService.syncImeisForPurchaseItem({
            purchaseId: purchase._id,
            productId: product._id,
            productName: product.name,
            imeis: updatedItem.imeis,
            type: product.trackSerial ? 'serial' : 'imei',
            purchasePrice: netUnitCost,
            supplierId: supplierIdForUpdate || null,
            supplierName: supplierDocForUpdate?.name || '',
            purchaseDate: purchase.purchaseDate,
            organizationId: purchase.organizationId,
            branchId: purchase.branchId,
            createdBy: purchase.createdBy,
          });
        }
      }
    }
  }

  // Handle removed items - decrease stock for items that were in original but not in update
  for (const originalItem of purchase.items) {
    const originalItemKey = getPurchaseItemKey(originalItem);
    const stillExists = updateBody.items?.find(
      (item) => `${item.product.toString()}:${item.variantId ? item.variantId.toString() : ''}` === originalItemKey,
    );

    if (!stillExists && originalItem.variantId) {
      // REMOVED variant/batch-tracked line item — reverse Inventory/Batch instead
      // of the legacy Product.stockQuantity fallback.
      const variant = await ProductVariant.findById(originalItem.variantId);
      if (variant) {
        const removedQuantity = Number(originalItem.stockQuantity || originalItem.quantity || 0);
        if ((variant.trackBatch || variant.trackExpiry) && originalItem.batchNumber) {
          await batchService.adjustBatchQuantity(variant._id, {
            batchNumber: originalItem.batchNumber,
            quantityDelta: -removedQuantity,
            createdBy: purchase.createdBy,
          });
        } else {
          await inventoryService.adjustInventory(variant._id, {
            quantityDelta: -removedQuantity,
            reason: 'Purchase edit (item removed)',
            userId: purchase.createdBy,
          });
        }

        // Release any still-in-stock serials this line item brought in — same as the
        // plain-product removed-item branch below.
        await syncVariantSerials({
          variant,
          imeis: [],
          batchId: null,
          purchase,
          netUnitCost: originalItem.priceAtPurchase,
          supplierId: supplierIdForUpdate,
          supplierName: supplierDocForUpdate?.name,
        });
      }
      continue;
    }

    if (!stillExists) {
      // REMOVED ITEM - Subtract the quantity from stock
      const product = await Product.findById(originalItem.product);

      if (product) {
        // Subtract the quantity since this item was removed
        const removedQuantity = Number(originalItem.stockQuantity || originalItem.quantity || 0);
        product.stockQuantity -= removedQuantity;

        // Save the product with updated stock
        await product.save();

        await inventorySyncService.recordStockChange({
          organizationId: purchase.organizationId,
          productId: product._id,
          quantityDelta: -removedQuantity,
          type: 'adjustment',
          refType: 'Purchase',
          refId: purchase._id,
          createdBy: purchase.createdBy,
        });

        if (product.trackImei || product.trackSerial) {
          await imeiService.syncImeisForPurchaseItem({
            purchaseId: purchase._id,
            productId: product._id,
            productName: product.name,
            imeis: [],
            purchasePrice: originalItem.priceAtPurchase,
            organizationId: purchase.organizationId,
            branchId: purchase.branchId,
            createdBy: purchase.createdBy,
          });
        }
      }
    }
  }

  // Now update the purchase itself
  Object.assign(purchase, updateBody);
  purchase.paymentType = derivePurchasePaymentType(purchase);
  if (purchase.paidAmount !== undefined) {
    purchase.balance = resolvePurchaseInvoiceBalance(purchase.totalAmount, purchase.paidAmount);
  }
  await purchase.save();
  await syncPurchaseCashAndWalletEntries(purchase, previousPaymentLegSnapshot);
  postPurchaseToAccounts(purchase);

  // Update supplier ledger entries if amounts or supplier changed
  const newSupplier = purchase.supplier?._id || purchase.supplier;
  const newTotalAmount = purchase.totalAmount;
  const newPaidAmount = purchase.paidAmount || 0;
  const hasLedgerEntries = await SupplierLedger.exists({ referenceId: purchase._id });

  if (originalSupplier && (
    originalTotalAmount !== newTotalAmount ||
    originalPaidAmount !== newPaidAmount ||
    originalSupplier.toString() !== newSupplier.toString() ||
    originalPaymentType !== purchase.paymentType ||
    originalVendorBillNumber !== (purchase.vendorBillNumber || '') ||
    !hasLedgerEntries
  )) {
    try {
      const ledgerPaymentMethod = resolvePurchaseLedgerPaymentMethod(purchase);
      const ledgerInvoiceType = resolvePurchaseLedgerInvoiceType(purchase);
      console.log('Updating supplier ledger entries for purchase:', {
        purchaseId: purchase._id,
        invoiceNumber: purchase.invoiceNumber,
        originalTotal: originalTotalAmount,
        newTotal: newTotalAmount,
        originalPaid: originalPaidAmount,
        newPaid: newPaidAmount,
        supplierChanged: originalSupplier.toString() !== newSupplier.toString()
      });

      // If supplier changed, delete old entries and create new ones
      if (originalSupplier.toString() !== newSupplier.toString()) {
        // Delete old ledger entries for the original supplier
        await supplierLedgerService.deleteLedgerEntriesByReference(purchase._id);
        
        // Create new entries for new supplier
        const ledgerEntries = buildSupplierPurchaseLedgerEntries({
          organizationId: purchase.organizationId,
          branchId: purchase.branchId,
          supplierId: newSupplier,
          referenceId: purchase._id,
          invoiceNumber: purchase.invoiceNumber,
          vendorBillNumber: purchase.vendorBillNumber,
          transactionDate: purchase.purchaseDate || new Date(),
          totalAmount: newTotalAmount,
          paidAmount: newPaidAmount,
          paymentType: purchase.paymentType,
          invoiceType: ledgerInvoiceType,
          paymentMethod: ledgerPaymentMethod,
          itemsCount: purchase.items.length,
          balance: purchase.balance,
          suffix: ' (Updated)',
        });

        for (const entry of ledgerEntries) {
          await supplierLedgerService.createLedgerEntry(entry);
        }
      } else {
        // Same supplier - update existing entries
        await supplierLedgerService.updateLedgerEntriesByReference(purchase._id, {
          organizationId: purchase.organizationId,
          branchId: purchase.branchId,
          supplierId: newSupplier,
          totalAmount: newTotalAmount,
          paidAmount: newPaidAmount,
          invoiceNumber: purchase.invoiceNumber,
          vendorBillNumber: purchase.vendorBillNumber,
          purchaseDate: purchase.purchaseDate,
          paymentMethod: ledgerPaymentMethod,
          paymentType: purchase.paymentType,
          invoiceType: ledgerInvoiceType,
          itemsCount: purchase.items.length,
          balance: purchase.balance,
        });
      }

      console.log('Supplier ledger entries updated successfully');
    } catch (error) {
      console.error('Failed to update supplier ledger entries:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      // Don't fail the purchase update if ledger update fails
    }
  }

  return purchase;
};



/**
 * Delete purchase by id
 * @param {ObjectId} purchaseId
 * @returns {Promise<Purchase>}
 */
const deletePurchaseById = async (purchaseId) => {
  // Find the purchase by its ID
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }

  // Loop through the items in the purchase and adjust the stock quantity for each product
  for (const item of purchase.items) {
    if (item.variantId) {
      // Real-variant / batch-tracked line item — reverse Inventory/Batch instead of
      // the legacy Product.stockQuantity fallback, mirroring createPurchase's
      // variant branch.
      const variant = await ProductVariant.findById(item.variantId);
      if (variant) {
        const removedQuantity = Number(item.stockQuantity || item.quantity || 0);
        if ((variant.trackBatch || variant.trackExpiry) && item.batchNumber) {
          await batchService.adjustBatchQuantity(variant._id, {
            batchNumber: item.batchNumber,
            quantityDelta: -removedQuantity,
            createdBy: purchase.createdBy,
          });
        } else {
          await inventoryService.adjustInventory(variant._id, {
            quantityDelta: -removedQuantity,
            reason: 'Purchase deleted',
            userId: purchase.createdBy,
          });
        }
      }
      continue;
    }

    const product = await Product.findById(item.product);

    if (product) {
      // Subtract the purchased quantity from the product's stockQuantity
      const removedQuantity = Number(item.stockQuantity || item.quantity || 0);
      product.stockQuantity -= removedQuantity;

      // Save the updated product stock
      await product.save();

      await inventorySyncService.recordStockChange({
        organizationId: purchase.organizationId,
        productId: product._id,
        quantityDelta: -removedQuantity,
        type: 'adjustment',
        refType: 'Purchase',
        refId: purchase._id,
        createdBy: purchase.createdBy,
      });
    }
  }

  // Drop any still-unsold IMEI/serial records tied to this purchase
  await imeiService.releaseImeisForPurchase(purchase._id);

  // Delete related supplier ledger entries
  if (purchase.supplier) {
    try {
      console.log('Deleting supplier ledger entries for purchase:', purchase.invoiceNumber);
      await supplierLedgerService.deleteLedgerEntriesByReference(purchase._id);
    } catch (error) {
      console.error('Failed to delete supplier ledger entries:', error);
      // Don't fail the purchase deletion if ledger deletion fails
    }
  }

  await cashBookService.deleteEntriesByReference(purchase._id, 'Purchase');
  await walletEntryService.deleteEntriesByReference(purchase._id, 'Purchase');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: purchase.organizationId, branchId: purchase.branchId },
      'Purchase',
      purchase._id
    )
    .catch(() => {});

  const deletedLegs = resolvePurchasePaymentLegs(purchase);
  if (deletedLegs.walletAmount > 0 && deletedLegs.walletType) {
    await walletService.adjustWalletBalance({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: deletedLegs.walletType,
      amount: deletedLegs.walletAmount,
      operation: 'add',
      userId: purchase.updatedBy || purchase.createdBy,
    });
  }

  // Remove the purchase after adjusting stock quantities
  await purchase.deleteOne();

  return purchase;
};

const getPurchaseByDate = async (filter) => {
  return Purchase.find({
    purchaseDate: {
      $gte: filter.startDate,
      $lte: filter.endDate,
    },
  }).populate('items.product').populate('items.variantId');
};

module.exports = {
  createPurchase,
  generateNextPurchaseInvoiceNumber,
  queryPurchases,
  getPurchaseById,
  updatePurchaseById,
  deletePurchaseById,
  getPurchaseByDate
};
