const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Purchase, Product, ProductVariant, Supplier, SupplierLedger, Organization, Category } = require('../models');
const ApiError = require('../utils/ApiError');
const { resolvePurchaseLedgerInvoiceType } = require('../utils/ledgerInvoiceType');
const { buildSupplierPurchaseLedgerEntries } = require('../utils/ledgerSettlement');
const supplierLedgerService = require('./supplierLedger.service');
const supplierPaymentService = require('./supplierPayment.service');
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
const { buildSettlementAddFieldsStage } = require('../utils/purchaseSettlement');
const { resolveTransactionTaxAndCurrency } = require('./transactionTaxSnapshot.service');
const Money = require('../utils/money');

/**
 * Resolves input tax + currency snapshot for a purchase's line items — genuinely new
 * territory, Purchase had no tax concept at all before this (see purchase-panel.tsx's old
 * "purchases have no tax" comment, now superseded). Read-only lookups (Product/
 * ProductVariant tax categories), safe to run outside any write transaction.
 *
 * `previousTax`/`baseTotalAmountOverride` exist so callers (both create and update) can
 * derive a "pre-tax" totalAmount consistently: totalAmount on this model is otherwise
 * fully client-trusted (no server-side subtotal recompute — a pre-existing, out-of-scope
 * gap), so naively adding freshly-computed tax on top of an already-tax-inclusive stored
 * totalAmount on a later update would double-count it. Subtracting out whatever tax was
 * baked in previously (0 on create) before adding the new tax avoids that regardless of
 * whether the caller resent a fresh totalAmount this time.
 */
const resolvePurchaseTaxAndCurrency = async ({
  organizationId,
  purchaseDate,
  items,
  discount,
  currency,
  existingCurrencySnapshot,
  baseTotalAmount,
  previousTax,
}) => {
  const productIds = [...new Set(items.filter((item) => item.product).map((item) => String(item.product)))];
  const variantIds = [...new Set(items.filter((item) => item.variantId).map((item) => String(item.variantId)))];
  const [productsForTax, variantsForTax] = await Promise.all([
    productIds.length ? Product.find({ _id: { $in: productIds } }).select('taxCategoryId').lean() : Promise.resolve([]),
    variantIds.length ? ProductVariant.find({ _id: { $in: variantIds } }).select('taxCategoryId').lean() : Promise.resolve([]),
  ]);
  const productTaxCategoryById = new Map(productsForTax.map((p) => [String(p._id), p.taxCategoryId ? String(p.taxCategoryId) : null]));
  const variantTaxCategoryById = new Map(variantsForTax.map((v) => [String(v._id), v.taxCategoryId ? String(v.taxCategoryId) : null]));

  const itemsForTaxCalc = items.map((item) => {
    const lineTotal = item.total != null ? Number(item.total) : Number(item.quantity || 0) * Number(item.priceAtPurchase || 0);
    const resolvedCategory =
      item.taxCategoryId ||
      (item.variantId ? variantTaxCategoryById.get(String(item.variantId)) : null) ||
      (item.product ? productTaxCategoryById.get(String(item.product)) : null) ||
      null;
    return { subtotal: lineTotal, taxCategoryId: resolvedCategory };
  });

  const taxAndCurrency = await resolveTransactionTaxAndCurrency({
    organizationId,
    customerId: null,
    asOfDate: purchaseDate || new Date(),
    items: itemsForTaxCalc,
    productTaxCategoryById: new Map(), // already resolved per-item above (incl. variant fallback)
    overallDiscount: Number(discount || 0),
    requestedCurrency: currency || null,
    existingCurrencySnapshot: existingCurrencySnapshot || null,
    fallbackTax: 0, // Purchase never had manual tax entry — 0 exactly matches prior behavior when taxSystem is unconfigured
  });

  const decimalPlaces = Money.getCurrencyMeta(taxAndCurrency.currency)?.decimalPlaces ?? Money.DEFAULT_DECIMAL_PLACES;
  const itemsWithTax = items.map((item, index) => ({
    ...item,
    taxCategoryId: taxAndCurrency.items[index]?.taxCategoryId || null,
    taxableAmount: taxAndCurrency.items[index]?.taxableAmount ?? 0,
    taxAmount: taxAndCurrency.items[index]?.taxAmount ?? 0,
  }));

  const preTaxTotalAmount = Math.max(0, Number(baseTotalAmount || 0) - Number(previousTax || 0));
  const totalAmount = Money.addMoney(preTaxTotalAmount, taxAndCurrency.tax, decimalPlaces);
  const baseDecimalPlaces = taxAndCurrency.baseCurrency
    ? Money.getCurrencyMeta(taxAndCurrency.baseCurrency)?.decimalPlaces ?? Money.DEFAULT_DECIMAL_PLACES
    : Money.DEFAULT_DECIMAL_PLACES;
  const baseCurrencyTotal = taxAndCurrency.baseCurrency
    ? Money.convertMoney(totalAmount, taxAndCurrency.exchangeRate || 1, baseDecimalPlaces)
    : totalAmount;

  return {
    items: itemsWithTax,
    tax: taxAndCurrency.tax,
    taxLines: taxAndCurrency.taxLines,
    taxSystem: taxAndCurrency.taxSystem,
    taxInclusive: taxAndCurrency.taxInclusive,
    currency: taxAndCurrency.currency,
    baseCurrency: taxAndCurrency.baseCurrency,
    exchangeRate: taxAndCurrency.exchangeRate,
    exchangeRateDate: taxAndCurrency.exchangeRateDate,
    totalAmount,
    baseCurrencyTotal,
  };
};

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
 *
 * Same trailing-digit-suffix scan as before, but computed inside MongoDB via
 * aggregation instead of pulling every Purchase document across the wire and
 * looping in JS — this runs on every create attempt (up to 3x on a collision
 * retry) and every time the New Purchase panel previews the next number, so it
 * scaled directly with total purchase count. $regexFind mirrors the same
 * /(\d+)$/ pattern used by parsePurchaseInvoiceSequence.
 */
const generateNextPurchaseInvoiceNumber = async () => {
  const [result] = await Purchase.aggregate([
    { $match: { invoiceNumber: { $regex: /(\d+)$/ } } },
    {
      $project: {
        seq: {
          $let: {
            vars: { m: { $regexFind: { input: '$invoiceNumber', regex: /(\d+)$/ } } },
            in: { $toInt: { $arrayElemAt: ['$$m.captures', 0] } },
          },
        },
      },
    },
    { $group: { _id: null, maxSeq: { $max: '$seq' } } },
  ]);

  const maxSeq = Math.max(DEFAULT_PURCHASE_INVOICE_SEQ, result?.maxSeq ?? DEFAULT_PURCHASE_INVOICE_SEQ);
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
  // Independent pre-checks — the duplicate-bill guard doesn't need the business type
  // (and vice versa) — so run them concurrently instead of one after another.
  const [, businessType] = await Promise.all([
    assertVendorBillNumberAvailable({
      organizationId: purchaseBody.organizationId,
      supplier: purchaseBody.supplier,
      vendorBillNumber: purchaseBody.vendorBillNumber,
    }),
    getOrganizationBusinessType(purchaseBody.organizationId),
  ]);

  const taxAndCurrency = await resolvePurchaseTaxAndCurrency({
    organizationId: purchaseBody.organizationId,
    purchaseDate: purchaseBody.purchaseDate,
    items: purchaseBody.items || [],
    discount: purchaseBody.discount,
    currency: purchaseBody.currency,
    baseTotalAmount: purchaseBody.totalAmount,
    previousTax: 0,
  });

  const normalizedBody = {
    ...purchaseBody,
    items: taxAndCurrency.items,
    type: purchaseBody.type || 'cash',
    paymentMethod: purchaseBody.paymentMethod || 'cash',
    tax: taxAndCurrency.tax,
    taxLines: taxAndCurrency.taxLines,
    taxSystem: taxAndCurrency.taxSystem,
    taxInclusive: taxAndCurrency.taxInclusive,
    currency: taxAndCurrency.currency,
    baseCurrency: taxAndCurrency.baseCurrency,
    exchangeRate: taxAndCurrency.exchangeRate,
    exchangeRateDate: taxAndCurrency.exchangeRateDate,
    totalAmount: taxAndCurrency.totalAmount,
    baseCurrencyTotal: taxAndCurrency.baseCurrencyTotal,
    balance:
      purchaseBody.paidAmount !== undefined
        ? resolvePurchaseInvoiceBalance(taxAndCurrency.totalAmount, purchaseBody.paidAmount)
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

      // Batch-fetch every product/variant the items reference up front instead of one
      // round trip per item (same fix already applied to invoice.service.js's createInvoice
      // item loop). Sequential, not Promise.all, since a ClientSession can't run concurrent
      // operations. Variants are read-only here so a shared Map is safe; products are
      // mutated + saved per item below, and reusing the same fetched document across
      // repeated saves (when two lines reference the same product) applies the exact same
      // increments in the exact same order as separate per-item fetches would have.
      const productIds = [...new Set(purchase.items.filter((i) => !i.variantId && i.product).map((i) => String(i.product)))];
      const variantIds = [...new Set(purchase.items.filter((i) => i.variantId).map((i) => String(i.variantId)))];
      const productsList = productIds.length ? await Product.find({ _id: { $in: productIds } }).session(session) : [];
      const variantsList = variantIds.length ? await ProductVariant.find({ _id: { $in: variantIds } }).session(session) : [];
      const productById = new Map(productsList.map((p) => [String(p._id), p]));
      const variantById = new Map(variantsList.map((v) => [String(v._id), v]));

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
          const variant = variantById.get(String(item.variantId));
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

        const product = productById.get(String(item.product));

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

  // Recompute tax/currency only when something that actually affects the taxable base or
  // the stored total is part of this update — an edit that only touches e.g. `notes` or
  // `paidAmount` must not re-trigger a tax recompute (paidAmount-only edits already get
  // their balance re-resolved below against the EXISTING totalAmount, unchanged here).
  const touchesAmounts = ['items', 'discount', 'discountValue', 'discountType', 'totalAmount', 'currency'].some(
    (key) => updateBody[key] !== undefined
  );
  // Captured before any reassignment below — items were explicitly part of THIS update
  // request only when the caller actually sent them.
  const itemsWereExplicitlyProvided = updateBody.items !== undefined;
  if (touchesAmounts) {
    const itemsForTax = (updateBody.items || purchase.items).map((item) => (item.toObject ? item.toObject() : item));
    const taxAndCurrency = await resolvePurchaseTaxAndCurrency({
      organizationId: purchase.organizationId,
      purchaseDate: purchase.purchaseDate,
      items: itemsForTax,
      discount: updateDiscount,
      currency: updateBody.currency,
      existingCurrencySnapshot: purchase.currency
        ? {
            currency: purchase.currency,
            baseCurrency: purchase.baseCurrency,
            exchangeRate: purchase.exchangeRate,
            exchangeRateDate: purchase.exchangeRateDate,
          }
        : null,
      baseTotalAmount: updateBody.totalAmount !== undefined ? updateBody.totalAmount : purchase.totalAmount,
      previousTax: purchase.tax || 0,
    });
    if (itemsWereExplicitlyProvided) {
      // A genuine item edit — updateBody.items must carry the tax-augmented items so the
      // stock-adjustment/IMEI-resync loop below (which only runs off updateBody.items)
      // still processes the real changes.
      updateBody.items = taxAndCurrency.items;
    } else {
      // No item change in this request — write the recomputed per-item tax fields
      // directly onto the existing subdocuments instead of populating updateBody.items,
      // which would otherwise make the loop below treat this as an item edit and rerun
      // stock/IMEI adjustment logic for a 0-quantity-delta no-op.
      taxAndCurrency.items.forEach((itemWithTax, index) => {
        const target = purchase.items[index];
        if (!target) return;
        target.taxCategoryId = itemWithTax.taxCategoryId || null;
        target.taxableAmount = itemWithTax.taxableAmount || 0;
        target.taxAmount = itemWithTax.taxAmount || 0;
      });
    }
    updateBody.tax = taxAndCurrency.tax;
    updateBody.taxLines = taxAndCurrency.taxLines;
    updateBody.taxSystem = taxAndCurrency.taxSystem;
    updateBody.taxInclusive = taxAndCurrency.taxInclusive;
    updateBody.currency = taxAndCurrency.currency;
    updateBody.baseCurrency = taxAndCurrency.baseCurrency;
    updateBody.exchangeRate = taxAndCurrency.exchangeRate;
    updateBody.exchangeRateDate = taxAndCurrency.exchangeRateDate;
    updateBody.totalAmount = taxAndCurrency.totalAmount;
    updateBody.baseCurrencyTotal = taxAndCurrency.baseCurrencyTotal;
  }

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

  // Any supplier payment money that had been applied to this invoice goes back to that
  // payment's unapplied credit — see supplierPayment.service.js's detachPurchaseAllocations.
  await supplierPaymentService.detachPurchaseAllocations(purchase._id).catch((error) => {
    console.error('Failed to detach supplier payment allocations:', error.message);
  });

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

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id);

// Same "unit key" convention as productService.getPurchasableCatalog / purchaseSuggestions.service:
// a real variant is keyed by its own variantId, never rolled up into its parent product,
// so a 128GB/Black iPhone's price history is never blended with a 256GB/Blue one.
const priceComparisonKey = (productId, variantId) => (variantId ? String(variantId) : String(productId));

/**
 * Bulk "last purchase price" lookup for many product/variant keys at once — the data
 * source behind Purchase Invoice's price-change indicator. Always exactly ONE Purchase
 * aggregation regardless of how many items are requested (no per-product query — see
 * supplierScoring.service.js's computeSupplierPricesForProduct for the single-product
 * analog this is modeled on, extended to bulk + "most recent" instead of "average").
 *
 * Finds, per (product, variantId) key: the most recent purchase overall (any supplier),
 * and — only when `supplierId` is given — the most recent purchase from that specific
 * supplier. Both come out of one aggregation via $facet sharing the same $match/$sort,
 * so asking for supplier-aware pricing never costs a second round trip.
 *
 * @param {Object} params
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} [params.branchId] - omitted (not filtered) for an org-wide superAdmin
 *   read, same convention as applyBranchFilter/getPurchasableCatalog.
 * @param {{productId: string, variantId?: string}[]} params.items
 * @param {string} [params.supplierId]
 * @returns {Promise<Object>} map of key -> comparison entry, one per requested item
 */
const getBulkPriceComparison = async ({ organizationId, branchId, items, supplierId }) => {
  const productIds = [...new Set(items.map((item) => String(item.productId)))].map(toObjectId);
  if (productIds.length === 0) return {};

  const supplierObjectId =
    supplierId && mongoose.Types.ObjectId.isValid(supplierId) ? toObjectId(supplierId) : null;

  const matchStage = { 'items.product': { $in: productIds } };
  if (organizationId) matchStage.organizationId = toObjectId(organizationId);
  if (branchId) matchStage.branchId = toObjectId(branchId);

  const facetStages = {
    overall: [
      {
        $group: {
          _id: { product: '$items.product', variantId: '$items.variantId' },
          lastPurchasePrice: { $first: '$items.priceAtPurchase' },
          lastPurchaseDate: { $first: '$purchaseDate' },
          lastPurchaseSupplierId: { $first: '$supplier' },
        },
      },
    ],
  };
  if (supplierObjectId) {
    facetStages.bySupplier = [
      { $match: { supplier: supplierObjectId } },
      {
        $group: {
          _id: { product: '$items.product', variantId: '$items.variantId' },
          lastPurchasePrice: { $first: '$items.priceAtPurchase' },
          lastPurchaseDate: { $first: '$purchaseDate' },
        },
      },
    ];
  }

  const [facetResult] = await Purchase.aggregate([
    { $match: matchStage },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    // Most recent first, so $first inside each $group below picks the latest purchase
    // per key — the standard Mongo "top-N per group" pattern, one pass, no per-key query.
    { $sort: { purchaseDate: -1, createdAt: -1 } },
    { $facet: facetStages },
  ]);

  const overallRows = facetResult?.overall || [];
  const supplierRows = facetResult?.bySupplier || [];

  const supplierIds = [...new Set(overallRows.map((r) => r.lastPurchaseSupplierId).filter(Boolean).map(String))];
  const suppliers = supplierIds.length
    ? await Supplier.find({ _id: { $in: supplierIds } }).select('name').lean()
    : [];
  const supplierNameById = new Map(suppliers.map((s) => [String(s._id), s.name]));

  const overallByKey = new Map(overallRows.map((r) => [priceComparisonKey(r._id.product, r._id.variantId), r]));
  const supplierByKey = new Map(supplierRows.map((r) => [priceComparisonKey(r._id.product, r._id.variantId), r]));

  const result = {};
  for (const { productId, variantId } of items) {
    const key = priceComparisonKey(productId, variantId);
    const overall = overallByKey.get(key);
    const supplierRow = supplierObjectId ? supplierByKey.get(key) : null;

    result[key] = {
      hasHistory: !!overall,
      lastPurchasePrice: overall ? overall.lastPurchasePrice : null,
      lastPurchaseDate: overall ? overall.lastPurchaseDate : null,
      lastPurchaseSupplierId: overall?.lastPurchaseSupplierId ? String(overall.lastPurchaseSupplierId) : null,
      lastPurchaseSupplierName: overall?.lastPurchaseSupplierId
        ? supplierNameById.get(String(overall.lastPurchaseSupplierId)) || null
        : null,
      supplierPrice: supplierObjectId
        ? {
            hasHistory: !!supplierRow,
            lastPurchasePrice: supplierRow ? supplierRow.lastPurchasePrice : null,
            lastPurchaseDate: supplierRow ? supplierRow.lastPurchaseDate : null,
          }
        : null,
    };
  }
  return result;
};


/* ------------------------------------------------------------------------------------
 * Purchase list: filtering, sorting and totals
 *
 * The list screen filters and sorts on settlement (paid / partial / outstanding /
 * overdue), which is DERIVED from totalAmount vs paidAmount + allocatedAmount rather than
 * stored (see utils/purchaseSettlement.js for why). Mongoose's `find` can't sort on a
 * derived value, so the list runs as an aggregation that computes settlement, filters and
 * paginates — then re-reads that page through `find().populate()` so callers keep getting
 * fully-populated Mongoose documents, exactly like queryPurchases always returned.
 * ---------------------------------------------------------------------------------- */

/** Sort keys the client may ask for → the field the pipeline actually sorts on. */
const PURCHASE_SORT_FIELDS = {
  invoiceNumber: 'invoiceNumber',
  amount: 'totalAmount',
  totalAmount: 'totalAmount',
  supplier: 'supplierName',
  supplierName: 'supplierName',
  purchaseDate: 'purchaseDate',
  date: 'purchaseDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  dueDate: 'dueSortKey',
  paymentDue: 'dueSortKey',
  remainingAmount: 'remainingAmount',
  paidAmount: 'settledAmount',
  settledAmount: 'settledAmount',
  items: 'itemsCount',
};

const escapeRegexLiteral = (raw) => String(raw).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toFilterObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(String(value)) : value;

const toIdArray = (value) =>
  (Array.isArray(value) ? value : String(value).split(','))
    .map((entry) => String(entry).trim())
    .filter(Boolean);

/**
 * Products matching a free-text term or belonging to a category — purchases reference
 * products by id, so "search by product" and "filter by category" both have to resolve to a
 * product id set first, the same way supplier search already does in listSearchFilter.js.
 */
const resolveProductIds = async ({ organizationId, branchId, term, categoryId }) => {
  const productFilter = {};
  if (organizationId) productFilter.organizationId = toFilterObjectId(organizationId);
  if (branchId) productFilter.branchId = toFilterObjectId(branchId);

  if (term) {
    const escaped = escapeRegexLiteral(term);
    productFilter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { nameUrdu: { $regex: escaped, $options: 'i' } },
      { barcode: { $regex: escaped, $options: 'i' } },
      { sku: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (categoryId) {
    // Products carry the newer multi-category refs (`categories[]._id`) AND a legacy
    // free-text `category` name — a filter that only checks one of them silently misses
    // every product saved under the other, so resolve the category's name and match both.
    const categoryConditions = [];
    if (mongoose.Types.ObjectId.isValid(categoryId)) {
      categoryConditions.push({ 'categories._id': toFilterObjectId(categoryId) });
      const category = await Category.findById(categoryId).select('name').lean();
      if (category?.name) {
        categoryConditions.push({ category: { $regex: `^${escapeRegexLiteral(category.name)}$`, $options: 'i' } });
        categoryConditions.push({ 'categories.name': { $regex: `^${escapeRegexLiteral(category.name)}$`, $options: 'i' } });
      }
    } else {
      const escapedName = escapeRegexLiteral(categoryId);
      categoryConditions.push({ category: { $regex: `^${escapedName}$`, $options: 'i' } });
      categoryConditions.push({ 'categories.name': { $regex: `^${escapedName}$`, $options: 'i' } });
    }
    productFilter.$and = [...(productFilter.$and || []), { $or: categoryConditions }];
  }

  const products = await Product.find(productFilter).select('_id').limit(5000).lean();
  return products.map((product) => product._id);
};

/** Suppliers whose name/urdu name/phone matches a free-text term. */
const resolveSupplierIdsByTerm = async ({ organizationId, branchId, term }) => {
  const escaped = escapeRegexLiteral(term);
  const supplierFilter = {
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { nameUrdu: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ],
  };
  if (organizationId) supplierFilter.organizationId = toFilterObjectId(organizationId);
  if (branchId) supplierFilter.branchId = toFilterObjectId(branchId);
  const suppliers = await Supplier.find(supplierFilter).select('_id').lean();
  return suppliers.map((supplier) => supplier._id);
};

/**
 * Turn the list screen's filter payload into the document-level `$match` that runs BEFORE
 * settlement is computed (cheap, index-friendly). Settlement-dependent filters
 * (paymentStatus / dueStatus / remaining-amount) are applied afterwards by
 * buildSettlementMatch.
 */
const buildPurchaseListMatch = async (filter = {}, options = {}) => {
  const match = {};
  const { organizationId, branchId } = filter;
  if (organizationId) match.organizationId = toFilterObjectId(organizationId);
  if (branchId) match.branchId = toFilterObjectId(branchId);

  // "Warehouse" in the UI is this app's Branch — only meaningful for an org-wide viewer
  // whose request didn't pin a branch already.
  if (options.branch) match.branchId = toFilterObjectId(options.branch);

  if (options.supplier) {
    const supplierIds = toIdArray(options.supplier).map(toFilterObjectId);
    match.supplier = supplierIds.length > 1 ? { $in: supplierIds } : supplierIds[0];
  }
  if (options.createdBy) {
    const userIds = toIdArray(options.createdBy).map(toFilterObjectId);
    match.createdBy = userIds.length > 1 ? { $in: userIds } : userIds[0];
  }

  // Payment type: `type` is the settlement terms (cash vs credit) and `paymentMethod` is the
  // account the money moved through — "wallet" is a method, not a term, so it matches on the
  // other field. Both are accepted as one filter because that's how the badge reads.
  if (options.paymentType) {
    const types = toIdArray(options.paymentType).map((value) => value.toLowerCase());
    const conditions = [];
    if (types.includes('cash')) conditions.push({ type: 'cash', paymentMethod: { $ne: 'wallet' } });
    if (types.includes('credit')) conditions.push({ type: 'credit' });
    if (types.includes('wallet')) conditions.push({ paymentMethod: 'wallet' });
    if (conditions.length === 1) Object.assign(match, conditions[0]);
    else if (conditions.length > 1) match.$and = [...(match.$and || []), { $or: conditions }];
  }

  if (options.invoiceStatus) {
    const statuses = toIdArray(options.invoiceStatus).map((value) => value.toLowerCase());
    if (statuses.length === 1) match.status = statuses[0] === 'completed';
  }

  // Exact-day filter carried over from the previous list API (?purchaseDate=YYYY-MM-DD).
  if (options.purchaseDate && !options.startDate && !options.endDate) {
    const day = new Date(options.purchaseDate);
    match.purchaseDate = {
      $gte: new Date(new Date(day).setHours(0, 0, 0, 0)),
      $lte: new Date(new Date(day).setHours(23, 59, 59, 999)),
    };
  }

  if (options.startDate || options.endDate) {
    match.purchaseDate = {};
    if (options.startDate) match.purchaseDate.$gte = new Date(new Date(options.startDate).setHours(0, 0, 0, 0));
    if (options.endDate) match.purchaseDate.$lte = new Date(new Date(options.endDate).setHours(23, 59, 59, 999));
  }

  if (options.minAmount !== undefined || options.maxAmount !== undefined) {
    match.totalAmount = {};
    if (options.minAmount !== undefined && options.minAmount !== '') match.totalAmount.$gte = Number(options.minAmount);
    if (options.maxAmount !== undefined && options.maxAmount !== '') match.totalAmount.$lte = Number(options.maxAmount);
    if (Object.keys(match.totalAmount).length === 0) delete match.totalAmount;
  }

  if (options.category) {
    const productIds = await resolveProductIds({ organizationId, branchId, categoryId: options.category });
    match['items.product'] = { $in: productIds };
  }

  const term = options.search ? String(options.search).trim() : '';
  if (term) {
    const escaped = escapeRegexLiteral(term);
    const searchBy = String(options.searchBy || 'all').toLowerCase();
    const byField = {
      invoice: () => [{ invoiceNumber: { $regex: escaped, $options: 'i' } }],
      vendorbill: () => [{ vendorBillNumber: { $regex: escaped, $options: 'i' } }],
      notes: () => [{ notes: { $regex: escaped, $options: 'i' } }],
      // "Reference" covers whatever else identifies the document on paper: our own number,
      // the supplier's bill number, or the purchase order it came from.
      reference: () => [
        { invoiceNumber: { $regex: escaped, $options: 'i' } },
        { vendorBillNumber: { $regex: escaped, $options: 'i' } },
      ],
    };

    let conditions = byField[searchBy] ? byField[searchBy]() : [];

    if (searchBy === 'supplier' || searchBy === 'all') {
      const supplierIds = await resolveSupplierIdsByTerm({ organizationId, branchId, term });
      if (supplierIds.length > 0) conditions.push({ supplier: { $in: supplierIds } });
      else if (searchBy === 'supplier') conditions.push({ supplier: null });
    }
    if (searchBy === 'product' || searchBy === 'all') {
      const productIds = await resolveProductIds({ organizationId, branchId, term });
      if (productIds.length > 0) conditions.push({ 'items.product': { $in: productIds } });
      else if (searchBy === 'product') conditions.push({ 'items.product': null });
    }
    if (searchBy === 'all') {
      conditions = conditions.concat([
        { invoiceNumber: { $regex: escaped, $options: 'i' } },
        { vendorBillNumber: { $regex: escaped, $options: 'i' } },
        { notes: { $regex: escaped, $options: 'i' } },
      ]);
    }

    match.$and = [...(match.$and || []), { $or: conditions.length > 0 ? conditions : [{ _id: null }] }];
  }

  return match;
};

/** Filters that can only be evaluated once settlement has been computed. */
const buildSettlementMatch = (options = {}) => {
  const conditions = {};

  if (options.paymentStatus) {
    const statuses = toIdArray(options.paymentStatus).map((value) => value.toLowerCase());
    // "outstanding" is the everyday word for "still owes something" — unpaid OR partial.
    const expanded = statuses.flatMap((status) => (status === 'outstanding' ? ['unpaid', 'partial'] : [status]));
    if (expanded.length > 0) conditions.settlementStatus = { $in: expanded };
  }

  if (options.dueStatus) {
    const dueStatuses = toIdArray(options.dueStatus).map((value) => value.toLowerCase());
    if (dueStatuses.length > 0) conditions.dueStatus = { $in: dueStatuses };
  }

  return conditions;
};

/** Supplier name is needed for both "sort by supplier" and the list's own display copy. */
const SUPPLIER_LOOKUP_STAGES = [
  { $lookup: { from: 'suppliers', localField: 'supplier', foreignField: '_id', as: '_supplierDoc' } },
  { $addFields: { supplierName: { $ifNull: [{ $arrayElemAt: ['$_supplierDoc.name', 0] }, ''] } } },
  { $project: { _supplierDoc: 0 } },
];

const buildPurchaseListPipeline = async (filter, options) => {
  const match = await buildPurchaseListMatch(filter, options);
  const settlementMatch = buildSettlementMatch(options);

  const pipeline = [
    { $match: match },
    ...SUPPLIER_LOOKUP_STAGES,
    buildSettlementAddFieldsStage(),
    {
      $addFields: {
        dueSortKey: { $ifNull: ['$dueDate', new Date('9999-12-31')] },
        itemsCount: { $size: { $ifNull: ['$items', []] } },
      },
    },
  ];

  if (Object.keys(settlementMatch).length > 0) {
    pipeline.push({ $match: settlementMatch });
  }

  return pipeline;
};

/**
 * Paginated purchase list with every list-screen filter, sorted on any column including the
 * derived settlement ones.
 *
 * @param {Object} filter organizationId/branchId scope (from applyBranchFilter)
 * @param {Object} options filters + `sortBy` ("field:asc|desc") + page/limit
 */
const queryPurchaseList = async (filter, options = {}) => {
  const limit = Math.max(1, parseInt(options.limit, 10) || 10);
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const [rawSortKey, rawSortOrder] = String(options.sortBy || 'purchaseDate:desc').split(':');
  const sortField = PURCHASE_SORT_FIELDS[rawSortKey] || 'purchaseDate';
  const sortDirection = String(rawSortOrder).toLowerCase() === 'asc' ? 1 : -1;

  const pipeline = await buildPurchaseListPipeline(filter, options);
  const [result] = await Purchase.aggregate([
    ...pipeline,
    {
      $facet: {
        // `_id` is appended as a tiebreaker so a page boundary can never drop or repeat a
        // row when several purchases share the same sort value (same day, same amount, ...).
        rows: [
          { $sort: { [sortField]: sortDirection, _id: sortDirection } },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              settledAmount: 1,
              remainingAmount: 1,
              settlementStatus: 1,
              dueStatus: 1,
              itemsCount: 1,
            },
          },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ]);

  const rows = result?.rows || [];
  const totalResults = result?.total?.[0]?.count || 0;
  const ids = rows.map((row) => row._id);

  // Re-read the page as real documents so callers keep the populated shape they had before
  // (aggregation can't run Mongoose populate), then restore the aggregation's order.
  const documents = await Purchase.find({ _id: { $in: ids } })
    .populate('supplier')
    .populate('items.product')
    .populate('items.variantId')
    .populate('createdBy', 'name email');

  const documentById = new Map(documents.map((document) => [String(document._id), document]));
  const results = rows
    .map((row) => {
      const document = documentById.get(String(row._id));
      if (!document) return null;
      // Settlement rides along as plain extra keys on the serialized document — derived, so
      // it is never persisted back.
      return {
        ...document.toJSON(),
        settledAmount: row.settledAmount,
        remainingAmount: row.remainingAmount,
        settlementStatus: row.settlementStatus,
        dueStatus: row.dueStatus,
        itemsCount: row.itemsCount,
      };
    })
    .filter(Boolean);

  return {
    results,
    page,
    limit,
    totalPages: Math.ceil(totalResults / limit) || 0,
    totalResults,
  };
};

/**
 * Headline totals for the list screen's stat cards, computed over the SAME filter set as the
 * table below them — so narrowing the filters narrows the cards, which is the whole point of
 * having them there.
 */
const getPurchaseListSummary = async (filter, options = {}) => {
  const pipeline = await buildPurchaseListPipeline(filter, options);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [result] = await Purchase.aggregate([
    ...pipeline,
    {
      $group: {
        _id: null,
        purchaseCount: { $sum: 1 },
        totalValue: { $sum: { $ifNull: ['$totalAmount', 0] } },
        totalSettled: { $sum: '$settledAmount' },
        totalOutstanding: { $sum: { $cond: [{ $gt: ['$remainingAmount', 0] }, '$remainingAmount', 0] } },
        overdueCount: { $sum: { $cond: [{ $eq: ['$dueStatus', 'overdue'] }, 1, 0] } },
        overdueAmount: { $sum: { $cond: [{ $eq: ['$dueStatus', 'overdue'] }, '$remainingAmount', 0] } },
        paidCount: { $sum: { $cond: [{ $eq: ['$settlementStatus', 'paid'] }, 1, 0] } },
        partialCount: { $sum: { $cond: [{ $eq: ['$settlementStatus', 'partial'] }, 1, 0] } },
        unpaidCount: { $sum: { $cond: [{ $eq: ['$settlementStatus', 'unpaid'] }, 1, 0] } },
        thisMonthValue: {
          $sum: { $cond: [{ $gte: ['$purchaseDate', startOfMonth] }, { $ifNull: ['$totalAmount', 0] }, 0] },
        },
        suppliers: { $addToSet: '$supplier' },
      },
    },
    { $addFields: { supplierCount: { $size: '$suppliers' } } },
    { $project: { _id: 0, suppliers: 0 } },
  ]).option({ allowDiskUse: true });

  return {
    purchaseCount: result?.purchaseCount || 0,
    supplierCount: result?.supplierCount || 0,
    totalValue: Money.roundMoney(result?.totalValue || 0),
    totalSettled: Money.roundMoney(result?.totalSettled || 0),
    totalOutstanding: Money.roundMoney(result?.totalOutstanding || 0),
    overdueCount: result?.overdueCount || 0,
    overdueAmount: Money.roundMoney(result?.overdueAmount || 0),
    paidCount: result?.paidCount || 0,
    partialCount: result?.partialCount || 0,
    unpaidCount: result?.unpaidCount || 0,
    thisMonthValue: Money.roundMoney(result?.thisMonthValue || 0),
  };
};

/**
 * Every purchase matching the filter, flattened for CSV/PDF export — no pagination, but
 * capped so a mis-clicked "export everything" can't try to serialize a whole year of data
 * into one response.
 */
const EXPORT_ROW_LIMIT = 5000;

const getPurchaseListForExport = async (filter, options = {}) => {
  const pipeline = await buildPurchaseListPipeline(filter, options);
  const [rawSortKey, rawSortOrder] = String(options.sortBy || 'purchaseDate:desc').split(':');
  const sortField = PURCHASE_SORT_FIELDS[rawSortKey] || 'purchaseDate';
  const sortDirection = String(rawSortOrder).toLowerCase() === 'asc' ? 1 : -1;

  const rows = await Purchase.aggregate([
    ...pipeline,
    { $sort: { [sortField]: sortDirection, _id: sortDirection } },
    { $limit: EXPORT_ROW_LIMIT },
    { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: '_createdByDoc' } },
    {
      $project: {
        _id: 0,
        invoiceNumber: 1,
        vendorBillNumber: 1,
        supplierName: 1,
        itemsCount: 1,
        purchaseDate: 1,
        dueDate: 1,
        type: 1,
        paymentType: 1,
        totalAmount: 1,
        settledAmount: 1,
        remainingAmount: 1,
        settlementStatus: 1,
        dueStatus: 1,
        notes: 1,
        updatedAt: 1,
        createdByName: { $ifNull: [{ $arrayElemAt: ['$_createdByDoc.name', 0] }, ''] },
      },
    },
  ]).option({ allowDiskUse: true });

  return { results: rows, limit: EXPORT_ROW_LIMIT, truncated: rows.length >= EXPORT_ROW_LIMIT };
};

/**
 * Append a comment to a purchase. Comments are a plain embedded thread (see
 * purchase.model.js) — no edit, because an audit-relevant note that can be rewritten in
 * place is worth less than one that can't.
 */
const addPurchaseComment = async (purchaseId, { message }, user) => {
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  purchase.comments.push({
    author: user?.id || user?._id,
    authorName: user?.name || user?.email,
    message: String(message).trim(),
    createdAt: new Date(),
  });
  await purchase.save();
  return purchase.comments[purchase.comments.length - 1];
};

const deletePurchaseComment = async (purchaseId, commentId) => {
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  const comment = purchase.comments.id(commentId);
  if (!comment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Comment not found');
  }
  comment.deleteOne();
  await purchase.save();
  return purchase.comments;
};

module.exports = {
  createPurchase,
  generateNextPurchaseInvoiceNumber,
  queryPurchases,
  queryPurchaseList,
  getPurchaseListSummary,
  getPurchaseListForExport,
  addPurchaseComment,
  deletePurchaseComment,
  getPurchaseById,
  updatePurchaseById,
  deletePurchaseById,
  getPurchaseByDate,
  getBulkPriceComparison,
};
