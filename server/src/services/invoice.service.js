const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Invoice, Product, Customer, CustomerLedger, Organization, Batch } = require('../models');
const batchService = require('./batch.service');
const ApiError = require('../utils/ApiError');
const { resolveInvoiceLedgerInvoiceType } = require('../utils/ledgerInvoiceType');
const { buildCustomerSaleLedgerEntries } = require('../utils/ledgerSettlement');
const customerLedgerService = require('./customerLedger.service');
const employeeLedgerService = require('./employeeLedger.service');
const supplierLedgerService = require('./supplierLedger.service');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const accountsSystemService = require('./accountsSystem.service');
const commissionEngineService = require('./commissionEngine.service');
const partnerProfitShareEngineService = require('./partnerProfitShareEngine.service');
const salesmanCommissionLedgerService = require('./salesmanCommissionLedger.service');
const imeiService = require('./imei.service');
const inventorySyncService = require('./inventorySync.service');
const inventoryService = require('./inventory.service');
const { normalizeBusinessType } = require('../config/businessTypes');
const { toStockQuantity, getStockQuantityFromItem } = require('../utils/inventoryUnitConversion');
const businessNotifications = require('./whatsapp/businessNotifications.service');
const { computeDiscountAmount } = require('../utils/discount');

/**
 * Resolves a raw invoice item's discount fields + net subtotal/profit from its gross
 * (quantity * unitPrice) and stock-adjusted cost. Server-side resolution (not trusting
 * a client-sent discountAmount) — same reasoning as purchaseOrder.service.js's
 * resolveOrderTotals, more robust than purchase.service.js's write-through trust.
 */
const resolveInvoiceItemDiscount = (item, grossSubtotal, costBasis) => {
  const discountType = item.discountType || 'fixed';
  const discountValue = Number(item.discountValue || 0);
  const discountAmount = computeDiscountAmount(grossSubtotal, discountType, discountValue);
  const subtotal = grossSubtotal - discountAmount;
  return {
    discountType,
    discountValue,
    discountAmount,
    subtotal,
    profit: subtotal - costBasis,
  };
};

/**
 * Normalizes a line item's batch draw into a uniform list of { batchId, batchNumber,
 * quantity } allocations — whether it's the common single-batch case (one batch covers
 * the whole line) or a split across multiple batches when no single batch had enough
 * (auto-suggested FEFO by the client, editable there; see docs/architecture/
 * universal-product-migration.md). Every validate/sell/restore call site can then just
 * loop over this list instead of branching on "is this item split or not" — a
 * single-batch item is simply a one-entry allocation.
 */
const getItemBatchAllocations = (item) => {
  if (Array.isArray(item.batchAllocations) && item.batchAllocations.length > 0) {
    return item.batchAllocations;
  }
  if (item.batchId) {
    return [{ batchId: item.batchId, batchNumber: item.batchNumber, quantity: item.stockQuantity ?? item.quantity }];
  }
  return [];
};

/**
 * Post (or re-post) the double-entry journal entries for an invoice.
 * Fire-and-forget: accounting must never block or break a sale.
 * Skips quotations/drafts (no revenue recognised yet).
 */
const postInvoiceToAccounts = (invoice) => {
  if (!invoice) return;
  const scope = {
    organizationId: invoice.organizationId,
    branchId: invoice.branchId,
    createdBy: invoice.createdBy,
  };
  const isPostable = invoice.type !== 'pending' && invoice.type !== 'quotation' && !['draft', 'cancelled'].includes(invoice.status);
  if (!isPostable) {
    accountsSystemService.removePostingsForReference(scope, 'Invoice', invoice._id).catch(() => {});
    return;
  }
  accountsSystemService.postSaleInvoice(scope, invoice).catch(() => {});
  accountsSystemService.postSaleCogs(scope, invoice).catch(() => {});
};

const getOrganizationBusinessType = async (organizationId) => {
  if (!organizationId) {
    return 'other';
  }

  const organization = await Organization.findById(organizationId).select('businessType').lean();
  return normalizeBusinessType(organization?.businessType);
};

const isValidCustomerObjectId = (value) => {
  if (!value) return false;
  return mongoose.Types.ObjectId.isValid(String(value).trim());
};

/**
 * Resolve the cash-book paymentMethod string from an invoice.
 * Wallet payments use the walletType (e.g. 'jazzcash', 'easypaisa').
 * Bank/card payments use 'bank'/'card'.
 * Cash payments use 'cash'.
 */
const resolveInvoicePaymentMethod = (invoice) => {
  const method = (invoice.paymentMethod || 'cash').toLowerCase();
  if (method === 'wallet') {
    return (invoice.walletType || '').trim().toLowerCase() || 'wallet';
  }
  if (method === 'bank') return 'bank';
  if (method === 'card') return 'card';
  return 'cash';
};

const resolveInvoiceLedgerPaymentMethod = (invoice) => {
  const legs = resolveInvoicePaymentLegs(invoice);
  if (legs.cashAmount > 0 && legs.walletAmount > 0) {
    return `Cash + Wallet (${legs.walletType})`;
  }
  if (legs.walletAmount > 0) {
    return `Wallet (${legs.walletType})`;
  }
  const method = (invoice.paymentMethod || 'cash').toLowerCase();
  if (method === 'bank') return 'Bank Transfer';
  if (method === 'card') return 'Card';
  return 'Cash';
};

/**
 * Resolve which portion of `paidAmount` is a Cash Book entry vs a Wallet Entry, and which
 * wallet, from (paymentMethod, walletType, splitPaymentMethod, splitWalletType, splitPaidAmount).
 * The split leg is always the opposite bucket from the primary leg (enforced client + Joi side),
 * so there is at most one cash-bucket amount and one wallet-bucket amount per invoice — never
 * two of the same kind that could collide on the same Cash Book/Wallet Entry reference key.
 */
const resolveInvoicePaymentLegs = (source) => {
  if (!source) return { cashAmount: 0, walletAmount: 0, walletType: '' };

  const paidAmount = Number(source.paidAmount || 0);
  const splitAmount = Math.max(0, Math.min(Number(source.splitPaidAmount || 0), paidAmount));
  const method = (source.paymentMethod || 'cash').toLowerCase();
  const isWalletPrimary = method === 'wallet' && source.walletType;
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

  // Primary is cash/bank/card (bank/card are legacy — no longer offered in the UI, but older
  // invoices may still carry them) — all non-wallet, so all of it is the Cash Book bucket.
  return { cashAmount: paidAmount, walletAmount: 0, walletType: '' };
};

/**
 * Sync Cash Book + Wallet Entry + Wallet.balance for an invoice's payment, from the resolved
 * cash/wallet legs. `previous` is a plain snapshot of the pre-update payment fields (or `null`
 * on create) — used only to compute the correct wallet-balance delta on edits; Cash Book /
 * Wallet Entry themselves are always fully re-derived via idempotent upsert/delete.
 */
const syncInvoiceCashAndWalletEntries = async (invoice, previous) => {
  const current = resolveInvoicePaymentLegs(invoice);
  const prior = resolveInvoicePaymentLegs(previous);

  // Cash book: any non-wallet receipt (cash / bank / card / cheque) — wallet payments
  // live in the Wallet module only. The Invoice module is the single source of
  // truth for invoice cashbook lines so the customer ledger doesn't double-count.
  if (current.cashAmount > 0) {
    // A split leg's cash-book bucket is always plain cash (the new UI only offers cash/wallet
    // as split buckets); otherwise preserve the original cash/bank/card tag for legacy invoices.
    const cashBookPaymentMethod = current.walletAmount > 0 ? 'cash' : resolveInvoicePaymentMethod(invoice);
    await cashBookService.upsertReferenceEntry({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      type: 'income',
      source: 'sale',
      amount: current.cashAmount,
      paymentMethod: cashBookPaymentMethod,
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      description: `Sale payment for Invoice #${invoice.invoiceNumber}`,
      date: invoice.invoiceDate || invoice.createdAt || new Date(),
      createdBy: invoice.createdBy,
    });
  } else {
    await cashBookService.deleteEntriesByReference(invoice._id, 'Invoice');
  }

  // Wallet ledger: invoice wallet receipts should live in Wallet entries, not CashBook.
  if (current.walletAmount > 0 && current.walletType) {
    await walletEntryService.upsertReferenceEntry({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      walletType: current.walletType,
      type: 'in',
      amount: current.walletAmount,
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      description: `Wallet payment received for Invoice #${invoice.invoiceNumber}`,
      date: invoice.invoiceDate || invoice.createdAt || new Date(),
      createdBy: invoice.createdBy,
      updatedBy: invoice.updatedBy,
    });
  } else {
    await walletEntryService.deleteEntriesByReference(invoice._id, 'Invoice');
  }

  // Wallet.balance direct adjustment — delta-aware against whatever the wallet leg was before.
  if (current.walletAmount > 0 && current.walletType) {
    if (prior.walletAmount > 0 && prior.walletType === current.walletType) {
      const delta = current.walletAmount - prior.walletAmount;
      if (delta !== 0) {
        await walletService.adjustWalletBalance({
          organizationId: invoice.organizationId,
          branchId: invoice.branchId,
          type: current.walletType,
          amount: Math.abs(delta),
          operation: delta > 0 ? 'add' : 'deduct',
          userId: invoice.updatedBy || invoice.createdBy,
        });
      }
      return;
    }

    if (prior.walletAmount > 0 && prior.walletType) {
      await walletService.adjustWalletBalance({
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        type: prior.walletType,
        amount: prior.walletAmount,
        operation: 'deduct',
        userId: invoice.updatedBy || invoice.createdBy,
      });
    }

    await walletService.adjustWalletBalance({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      type: current.walletType,
      amount: current.walletAmount,
      operation: 'add',
      userId: invoice.updatedBy || invoice.createdBy,
    });
  } else if (prior.walletAmount > 0 && prior.walletType) {
    await walletService.adjustWalletBalance({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      type: prior.walletType,
      amount: prior.walletAmount,
      operation: 'deduct',
      userId: invoice.updatedBy || invoice.createdBy,
    });
  }
};

// Legacy wrapper for the create path (no previous payment info)
const syncWalkInInvoiceCashEntry = (invoice) =>
  syncInvoiceCashAndWalletEntries(invoice, null);

/**
 * Create an invoice
 * @param {Object} invoiceBody
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const createInvoice = async (invoiceBody, userId) => {
  console.log('=== Creating Invoice ===');
  console.log('Invoice type:', invoiceBody.type);
  console.log('Number of items:', invoiceBody.items?.length);
  console.log('Customer ID:', invoiceBody.customerId);
  const businessType = await getOrganizationBusinessType(invoiceBody.organizationId);
  
  // Validate required fields
  if (!invoiceBody.items || invoiceBody.items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invoice must have at least one item');
  }

  // Validate customer if provided (but not for walk-in customers)
  if (invoiceBody.customerId && invoiceBody.customerId !== 'walk-in') {
    const customer = await Customer.findById(invoiceBody.customerId);
    if (!customer) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
    }
    console.log('Customer validated:', customer.name);
  }

  const isQuotation = invoiceBody.type === 'quotation';

  // Batch-fetch every product/batch/inventory the items reference up front instead of
  // one round trip per item — this collapses what used to be O(N) to 2N sequential
  // queries into a fixed 3 parallel queries regardless of invoice size.
  const productIds = [...new Set(invoiceBody.items.filter((i) => i.productId).map((i) => String(i.productId)))];
  const batchIds = !isQuotation
    ? [...new Set(invoiceBody.items.filter((i) => i.variantId).flatMap((i) => getItemBatchAllocations(i).map((a) => String(a.batchId))))]
    : [];

  const [productsList, batchesList] = await Promise.all([
    productIds.length ? Product.find({ _id: { $in: productIds } }) : Promise.resolve([]),
    batchIds.length ? Batch.find({ _id: { $in: batchIds } }) : Promise.resolve([]),
  ]);

  const productById = new Map(productsList.map((p) => [String(p._id), p]));
  const batchById = new Map(batchesList.map((b) => [String(b._id), b]));

  // Validate products and calculate totals
  const validatedItems = [];
  for (const item of invoiceBody.items) {
    if (!item.productId) {
      console.error('Missing productId for item:', item);
      throw new ApiError(httpStatus.BAD_REQUEST, 'Product ID is required for all items');
    }

    const product = productById.get(String(item.productId));
    if (!product) {
      console.error('Product not found:', item.productId);
      throw new ApiError(httpStatus.BAD_REQUEST, `Product with ID ${item.productId} not found`);
    }

    // Real-variant line item — stock lives on Inventory.quantity for that specific
    // variant, not the legacy Product.stockQuantity fallback. No unit-conversion
    // support for variants yet (matches the same scope limit as Purchase's variant
    // items), so quantity is used as-is.
    if (item.variantId) {
      const allocations = getItemBatchAllocations(item);
      if (!isQuotation) {
        // A picked batch (or, since a single batch can run short, a client-suggested
        // FEFO split across several) must have enough across its allocations — no
        // server-side auto-splitting; the client always sends the exact breakdown.
        if (allocations.length > 0) {
          const allocatedTotal = allocations.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
          if (allocatedTotal !== item.quantity) {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Batch allocation for ${item.name || product.name} totals ${allocatedTotal}, but the line quantity is ${item.quantity}`
            );
          }
          // Overselling into negative stock is allowed (same policy as plain products —
          // a purchase entry brings the balance back up). Still block selling from a
          // batch that isn't active (depleted/expired/inactive).
          for (const alloc of allocations) {
            const batch = batchById.get(String(alloc.batchId));
            if (!batch || batch.status !== 'active') {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Batch ${batch?.batchNumber || alloc.batchNumber || ''} for ${item.name || product.name} is not active`
              );
            }
          }
        }
      }

      {
        // item.cost is absent when the requesting role can't see purchase cost (it's
        // stripped from the catalog API — see product.controller.js's
        // COST_VIEW_PERMISSIONS). Fall back to the picked batch's actual cost, then the
        // product's, same as the non-variant branch below — never trust a missing/zero
        // client value as "free".
        const primaryBatch = allocations.length > 0 ? batchById.get(String(allocations[0].batchId)) : undefined;
        const itemCost = item.cost ?? primaryBatch?.costPerUnit ?? product.cost ?? 0;
        const gross = item.quantity * item.unitPrice;
        const discount = resolveInvoiceItemDiscount(item, gross, item.quantity * itemCost);
        // A split keeps the first allocation as the display-only batchId/batchNumber
        // (populate, print, legacy readers) while the real per-batch breakdown lives in
        // batchAllocations — only stored when there genuinely are 2+ batches involved,
        // so a plain single-batch line looks exactly as it always has.
        const isSplit = allocations.length > 1;
        validatedItems.push({
          productId: item.productId,
          variantId: item.variantId,
          batchId: isSplit ? allocations[0].batchId : item.batchId,
          batchNumber: isSplit ? allocations[0].batchNumber : item.batchNumber,
          batchAllocations: isSplit ? allocations.map((a) => ({ batchId: a.batchId, batchNumber: a.batchNumber, quantity: a.quantity })) : undefined,
          name: item.name || product.name,
          nameUrdu: item.nameUrdu || product.nameUrdu || '',
          image: item.image || product.image,
          quantity: item.quantity,
          unit: item.unit || product.unit,
          conversionFactor: 1,
          stockQuantity: item.quantity,
          unitPrice: item.unitPrice,
          cost: itemCost,
          subtotal: discount.subtotal,
          profit: discount.profit,
          discountType: discount.discountType,
          discountValue: discount.discountValue,
          discountAmount: discount.discountAmount,
          isManualEntry: item.isManualEntry || false,
          imeis: item.imeis || [],
        });
      }
      continue;
    }

    const conversion = toStockQuantity({ product, item, businessType });
    // Simple (non-variant, non-batch) products are allowed to sell into negative
    // stock — a purchase entry brings the balance back up. Batch/variant items
    // still enforce availability above since a specific unit either exists or not.

    // Prepare validated item
    const itemCost = item.cost || product.cost;
    const itemGross = item.quantity * item.unitPrice;
    const itemDiscount = resolveInvoiceItemDiscount(item, itemGross, conversion.stockQuantity * itemCost);
    const validatedItem = {
      productId: item.productId,
      name: item.name || product.name,
      nameUrdu: item.nameUrdu != null && item.nameUrdu !== '' ? item.nameUrdu : product.nameUrdu || '',
      image: item.image || product.image,
      quantity: item.quantity,
      unit: conversion.lineUnit,
      conversionFactor: conversion.conversionFactor,
      stockQuantity: conversion.stockQuantity,
      unitPrice: item.unitPrice,
      cost: itemCost,
      subtotal: itemDiscount.subtotal,
      profit: itemDiscount.profit,
      discountType: itemDiscount.discountType,
      discountValue: itemDiscount.discountValue,
      discountAmount: itemDiscount.discountAmount,
      isManualEntry: item.isManualEntry || false,
      imeis: item.imeis || [],
    };

    validatedItems.push(validatedItem);
  }

  // Make sure every selected IMEI is still in stock before committing the sale
  if (!isQuotation) {
    await imeiService.validateImeisAvailable({
      items: validatedItems,
      organizationId: invoiceBody.organizationId,
      branchId: invoiceBody.branchId,
    });
  }

  // Resolve the overall invoice-level discount server-side from discountType/discountValue
  // against the net-of-item-discount subtotal. Backward-compat fallback: callers that only
  // send a flat `discount` (e.g. Fast Billing) still resolve to the same amount, since a
  // 'fixed' discountValue derived from it clamps to the identical Rs figure.
  const netSubtotalSum = validatedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const overallDiscountType = invoiceBody.discountType || 'fixed';
  const overallDiscountValue = invoiceBody.discountValue !== undefined
    ? Number(invoiceBody.discountValue)
    : Number(invoiceBody.discount || 0);
  const overallDiscount = computeDiscountAmount(netSubtotalSum, overallDiscountType, overallDiscountValue);

  // Create invoice
  const invoice = new Invoice({
    ...invoiceBody,
    items: validatedItems,
    discountType: overallDiscountType,
    discountValue: overallDiscountValue,
    discount: overallDiscount,
    // '' from "no salesman selected" would fail the ObjectId cast — normalize to null.
    salesmanId: invoiceBody.salesmanId || null,
    createdBy: userId,
    updatedBy: userId
  });

  // Calculate totals
  invoice.calculateTotals();

  // Auto-finalize cash invoices
  if (invoice.type === 'cash') {
    invoice.finalize();
  }

  // Save with retry for duplicate invoice number race condition (E11000) — but only when
  // the number was auto-generated. A manually-typed override (see invoiceNumber input in
  // the New Invoice form) that collides gets a clear error instead of being silently
  // swapped out for a different auto-generated number the user never asked for.
  const hasManualInvoiceNumber = Boolean(invoiceBody.invoiceNumber && String(invoiceBody.invoiceNumber).trim());
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await invoice.save();
      break;
    } catch (err) {
      const isDuplicateInvoiceNumber = err.code === 11000 && err.keyPattern && err.keyPattern.invoiceNumber;
      if (isDuplicateInvoiceNumber && hasManualInvoiceNumber) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Invoice number "${invoiceBody.invoiceNumber}" is already in use`);
      }
      if (isDuplicateInvoiceNumber && attempt < MAX_RETRIES - 1) {
        // Duplicate invoice number - regenerate and retry
        invoice.invoiceNumber = undefined;
        invoice.isNew = true;
      } else {
        throw err;
      }
    }
  }
  console.log('Invoice saved with ID:', invoice._id);
  await syncWalkInInvoiceCashEntry(invoice);
  postInvoiceToAccounts(invoice);
  commissionEngineService.syncCommissionForInvoice(invoice, userId).catch(() => {});
  partnerProfitShareEngineService.syncPartnerShareForInvoice(invoice, userId).catch(() => {});

  // Create customer ledger entry for non-walk-in customers
  if (invoice.customerId && invoice.customerId !== 'walk-in' && invoice.type !== 'pending' && invoice.type !== 'quotation') {
    try {
      const ledgerPaymentMethod = resolveInvoiceLedgerPaymentMethod(invoice);
      const [customer, hasExistingLedger] = await Promise.all([
        Customer.findById(invoice.customerId).select('balance organizationId branchId createdAt'),
        CustomerLedger.exists({ customer: invoice.customerId }),
      ]);

      // Backward compatibility: preserve legacy opening balances that were saved on customer
      // but never written as opening_balance ledger transactions.
      if (customer && !hasExistingLedger && Number(customer.balance || 0) !== 0) {
        await customerLedgerService.syncOpeningBalanceEntry({
          customerId: invoice.customerId,
          amount: customer.balance,
          organizationId: invoice.organizationId,
          branchId: invoice.branchId,
          transactionDate: customer.createdAt,
        });
      }

      // Determine reference and description based on whether this is a converted pending invoice with bill number
      const displayReference = invoice.billNumber ? `Bill #${invoice.billNumber}` : invoice.invoiceNumber;
      const description = invoice.billNumber 
        ? `Bill sent to party - Bill #${invoice.billNumber}` 
        : `Sale Invoice #${invoice.invoiceNumber}`;
      
      const ledgerInvoiceType = resolveInvoiceLedgerInvoiceType(invoice);
      const ledgerEntries = buildCustomerSaleLedgerEntries({
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        customerId: invoice.customerId,
        referenceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        displayReference,
        description,
        transactionDate: invoice.invoiceDate || new Date(),
        total: invoice.total,
        paidAmount: invoice.paidAmount,
        invoiceType: ledgerInvoiceType,
        paymentMethod: ledgerPaymentMethod,
        notes: invoice.notes || `Invoice for ${validatedItems.length} items`,
        balance: invoice.balance,
      });

      for (const entry of ledgerEntries) {
        await customerLedgerService.createLedgerEntry(entry);
      }
      console.log('Customer ledger entries created for invoice:', displayReference);
    } catch (error) {
      console.error('Failed to create customer ledger entry:', error);
      // Don't fail the invoice creation if ledger entry fails
    }
  }

  // If this was sold to an employee's shadow customer account, mirror the
  // unpaid balance into their salary ledger.
  try {
    await employeeLedgerService.syncPurchaseFromInvoice(invoice);
  } catch (error) {
    console.error('Failed to sync employee ledger for invoice:', error);
  }

  // Same, but for a supplier's shadow customer account — nets the unpaid
  // balance against what the business owes that supplier.
  try {
    await supplierLedgerService.syncPurchaseFromInvoice(invoice);
  } catch (error) {
    console.error('Failed to sync supplier ledger for invoice:', error);
  }

  // Update product stock quantities (quotations do not affect stock until converted).
  // Real-variant line items bypass the legacy Product.stockQuantity path entirely —
  // that field is a fallback-only display value once a product hasVariants, see
  // docs/architecture/universal-product-migration.md. A picked batch (or a client-
  // suggested FEFO split across several, when one batch didn't have enough) deducts
  // from each of those specific Batches; without any, this just decrements the
  // variant's total Inventory.quantity.
  if (!isQuotation) {
    // Each line item touches its own product/batch/variant, so the stock writes are
    // independent of one another — run them concurrently instead of one at a time.
    await Promise.all(validatedItems.map(async (item) => {
      const allocations = getItemBatchAllocations(item);
      if (item.variantId && allocations.length > 0) {
        for (const alloc of allocations) {
          await batchService.sellFromBatch(alloc.batchId, alloc.quantity, {
            refType: 'Invoice',
            refId: invoice._id,
            userId,
          });
        }
        return;
      }
      if (item.variantId) {
        await inventoryService.adjustInventory(item.variantId, {
          quantityDelta: -item.stockQuantity,
          type: 'sale',
          refType: 'Invoice',
          refId: invoice._id,
          userId,
        });
        return;
      }

      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: -item.stockQuantity } },
        { new: true }
      );

      await inventorySyncService.recordStockChange({
        organizationId: invoice.organizationId,
        productId: item.productId,
        quantityDelta: -item.stockQuantity,
        type: 'sale',
        refType: 'Invoice',
        refId: invoice._id,
        unitCost: item.cost,
        createdBy: userId,
      });
    }));

    await imeiService.markImeisSoldForInvoice({
      invoiceId: invoice._id,
      items: validatedItems,
      customerId: invoice.customerId,
      customerName: invoice.customerName || invoice.walkInCustomerName || '',
      saleDate: invoice.invoiceDate || new Date(),
      updatedBy: userId,
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
    });
  }

  // Populate references conditionally
  const populateOptions = [
    { path: 'items.productId', select: 'name nameUrdu barcode category' },
    { path: 'items.variantId' },
    { path: 'createdBy', select: 'name email' },
    { path: 'salesmanId', select: 'name salesmanCode' }
  ];

  // Only populate customer if it's not a walk-in customer
  if (isValidCustomerObjectId(invoice.customerId)) {
    populateOptions.unshift({ path: 'customerId', select: 'name nameUrdu phone whatsapp email' });
  }

  await invoice.populate(populateOptions);

  // Add customerName for consistency
  const invoiceObj = invoice.toObject();
  console.log("invoiceObj.customerId after population:", invoiceObj.customerId);
  
  if (isValidCustomerObjectId(invoice.customerId)) {
    // Get the customer data directly from the database if population didn't work
    if (invoiceObj.customerId && typeof invoiceObj.customerId === 'object' && invoiceObj.customerId.name) {
      invoiceObj.customerName = invoiceObj.customerId.name;
    } else {
      // Fallback: fetch customer directly
      const customer = await Customer.findById(String(invoice.customerId).trim()).select('name nameUrdu');
      if (customer) {
        invoiceObj.customerName = customer.name;
        invoiceObj.customerId = customer; // Also set the populated customer object
      } else {
        invoiceObj.customerName = 'Unknown Customer';
      }
    }
  } else {
    invoiceObj.customerName = 'Walk-in Customer';
  }

  if (isValidCustomerObjectId(invoice.customerId) && invoice.type !== 'pending' && invoice.type !== 'quotation') {
    businessNotifications.fireAndForget(businessNotifications.sendInvoiceOnCreate(invoice._id), 'sendInvoiceOnCreate');
  }

  return invoiceObj;
};

/**
 * Query for invoices
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryInvoices = async (filter, options) => {
  // Get invoices with pagination
  const opts = {
    ...options,
    populate: [
      { path: 'createdBy', select: 'name email' },
      { path: 'salesmanId', select: 'name salesmanCode' },
    ],
  };
  const invoices = await Invoice.paginate(filter, opts);

  // Manually populate customer data for each invoice
  if (invoices.results && invoices.results.length > 0) {
    const customerIds = invoices.results
      .map((invoice) => String(invoice.customerId || '').trim())
      .filter((id) => isValidCustomerObjectId(id));
    const customerObjectIds = customerIds.map((id) => new mongoose.Types.ObjectId(id));

    if (customerObjectIds.length > 0) {
      // Fetch all customers in one query
      const customers = await Customer.find({ _id: { $in: customerObjectIds } }).select('name nameUrdu phone whatsapp email');
      const customerMap = new Map();
      customers.forEach(customer => {
        customerMap.set(customer._id.toString(), customer);
      });

      // Add customer data to invoices
      invoices.results = invoices.results.map(invoice => {
        const invoiceObj = invoice.toObject ? invoice.toObject() : invoice;
        
        if (isValidCustomerObjectId(invoiceObj.customerId)) {
          const customer = customerMap.get(String(invoiceObj.customerId).trim());
          if (customer) {
            invoiceObj.customer = customer;
            invoiceObj.customerName = customer.name;
          } else {
            invoiceObj.customerName = 'Unknown Customer';
          }
        } else {
          invoiceObj.customerName = 'Walk-in Customer';
        }
        
        return invoiceObj;
      });
    } else {
      // If no customer IDs to populate, still add customerName for walk-in customers
      invoices.results = invoices.results.map(invoice => {
        const invoiceObj = invoice.toObject ? invoice.toObject() : invoice;
        invoiceObj.customerName = 'Walk-in Customer';
        return invoiceObj;
      });
    }
  }

  return invoices;
};

/**
 * Get invoice by id
 * @param {ObjectId} id
 * @returns {Promise<Invoice>}
 */
const getInvoiceById = async (id) => {
  const invoice = await Invoice.findById(id);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }

  // Populate references conditionally
  const populateOptions = [
    { path: 'items.productId', select: 'name nameUrdu barcode category description' },
    { path: 'items.variantId' },
    { path: 'items.batchId', select: 'batchNumber expiryDate' },
    { path: 'createdBy updatedBy', select: 'name email' },
    { path: 'salesmanId', select: 'name salesmanCode' }
  ];

  // Only populate customer if it's not a walk-in customer
  if (invoice.customerId && invoice.customerId !== 'walk-in') {
    populateOptions.unshift({ path: 'customerId', select: 'name nameUrdu phone whatsapp email address' });
  }

  await invoice.populate(populateOptions);
  
  // Add customerName for consistency with query results
  const invoiceObj = invoice.toObject();
  if (invoiceObj.customerId && invoiceObj.customerId !== 'walk-in' && invoiceObj.customerId.name) {
    invoiceObj.customerName = invoiceObj.customerId.name;
  } else {
    invoiceObj.customerName = 'Walk-in Customer';
  }
  
  return invoiceObj;
};

/**
 * Update invoice by id
 * @param {ObjectId} invoiceId
 * @param {Object} updateBody
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const updateInvoiceById = async (invoiceId, updateBody, userId) => {
  // Get the actual Mongoose document, not the plain object
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  
  // Store original values for ledger and wallet update
  const originalTotal = invoice.total;
  const originalPaidAmount = invoice.paidAmount || 0;
  const originalCustomerId = invoice.customerId;
  const originalType = invoice.type;
  // Snapshot of every payment-leg field, for delta-aware Cash Book/Wallet resync below.
  const previousPaymentLegSnapshot = {
    paymentMethod: invoice.paymentMethod,
    walletType: invoice.walletType,
    splitPaymentMethod: invoice.splitPaymentMethod,
    splitWalletType: invoice.splitWalletType,
    paidAmount: invoice.paidAmount,
    splitPaidAmount: invoice.splitPaidAmount,
  };
  const businessType = await getOrganizationBusinessType(invoice.organizationId);
  
  // Prevent updating finalized invoices unless specifically allowed
  // if (invoice.status === 'finalized' || invoice.status === 'paid') {
  //   if (!updateBody.allowUpdateFinalized) {
  //     throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot update finalized or paid invoice');
  //   }
  // }

  // If updating items, validate stock again
  if (updateBody.items) {
    // Restore original stock quantities (quotations never deducted stock)
    if (originalType !== 'quotation') {
      for (const item of invoice.items) {
        const restoredQuantity = Number(item.stockQuantity || item.quantity || 0);
        const allocations = getItemBatchAllocations(item);
        if (item.variantId && allocations.length > 0) {
          for (const alloc of allocations) {
            await batchService.restoreToBatch(alloc.batchId, alloc.quantity, {
              refType: 'Invoice',
              refId: invoice._id,
              userId,
            });
          }
          continue;
        }
        if (item.variantId) {
          await inventoryService.adjustInventory(item.variantId, {
            quantityDelta: restoredQuantity,
            type: 'return_in',
            refType: 'Invoice',
            refId: invoice._id,
            userId,
          });
          continue;
        }
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stockQuantity: restoredQuantity } },
          { new: true }
        );
        await inventorySyncService.recordStockChange({
          organizationId: invoice.organizationId,
          productId: item.productId,
          quantityDelta: restoredQuantity,
          type: 'return_in',
          refType: 'Invoice',
          refId: invoice._id,
          unitCost: item.cost,
          createdBy: userId,
        });
      }
      // Put back any IMEIs sold on this invoice — they'll be re-marked sold below for whatever's still selected
      await imeiService.releaseImeisForInvoice(invoice._id);
    }

    // Validate new items and stock
    const validatedItems = [];
    const willRemainQuotation =
      originalType === 'quotation' && (updateBody.type === undefined || updateBody.type === 'quotation');

    for (const item of updateBody.items) {
      if (!item.productId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Product ID is required for all items');
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Product with ID ${item.productId} not found`);
      }

      if (item.variantId) {
        const allocations = getItemBatchAllocations(item);
        if (!willRemainQuotation) {
          if (allocations.length > 0) {
            const allocatedTotal = allocations.reduce((sum, a) => sum + Number(a.quantity || 0), 0);
            if (allocatedTotal !== item.quantity) {
              throw new ApiError(
                httpStatus.BAD_REQUEST,
                `Batch allocation for ${item.name || product.name} totals ${allocatedTotal}, but the line quantity is ${item.quantity}`
              );
            }
            // Overselling into negative stock is allowed (same policy as plain products
            // — a purchase entry brings the balance back up). Still block selling from a
            // batch that isn't active (depleted/expired/inactive).
            for (const alloc of allocations) {
              const batch = await Batch.findById(alloc.batchId);
              if (!batch || batch.status !== 'active') {
                throw new ApiError(
                  httpStatus.BAD_REQUEST,
                  `Batch ${batch?.batchNumber || alloc.batchNumber || ''} for ${item.name || product.name} is not active`
                );
              }
            }
          }
        }
        // item.cost is absent when the requesting role can't see purchase cost (it's
        // stripped from the catalog API — see product.controller.js's
        // COST_VIEW_PERMISSIONS). Fall back to the picked batch's actual cost, then the
        // product's, same as the non-variant branch below and createInvoice's identical
        // branch above — never trust a missing/zero client value as "free".
        const primaryBatchId = allocations.length > 0 ? allocations[0].batchId : undefined;
        const primaryBatch = primaryBatchId ? await Batch.findById(primaryBatchId).select('costPerUnit').lean() : undefined;
        const itemCost = item.cost ?? primaryBatch?.costPerUnit ?? product.cost ?? 0;
        const gross = item.quantity * item.unitPrice;
        const discount = resolveInvoiceItemDiscount(item, gross, item.quantity * itemCost);
        const isSplit = allocations.length > 1;
        validatedItems.push({
          productId: item.productId,
          variantId: item.variantId,
          batchId: isSplit ? allocations[0].batchId : item.batchId,
          batchNumber: isSplit ? allocations[0].batchNumber : item.batchNumber,
          batchAllocations: isSplit ? allocations.map((a) => ({ batchId: a.batchId, batchNumber: a.batchNumber, quantity: a.quantity })) : undefined,
          name: item.name || product.name,
          nameUrdu: item.nameUrdu || product.nameUrdu || '',
          image: item.image || product.image,
          quantity: item.quantity,
          unit: item.unit || product.unit,
          conversionFactor: 1,
          stockQuantity: item.quantity,
          unitPrice: item.unitPrice,
          cost: itemCost,
          subtotal: discount.subtotal,
          profit: discount.profit,
          discountType: discount.discountType,
          discountValue: discount.discountValue,
          discountAmount: discount.discountAmount,
          isManualEntry: item.isManualEntry || false,
          imeis: item.imeis || [],
        });
        continue;
      }

      const conversion = getStockQuantityFromItem({ product, item, businessType });
      // Simple products may go negative on sale — see createInvoice for rationale.

      const itemCost = item.cost || product.cost;
      const itemGross = item.quantity * item.unitPrice;
      const itemDiscount = resolveInvoiceItemDiscount(item, itemGross, conversion.stockQuantity * itemCost);
      const validatedItem = {
        productId: item.productId,
        name: item.name || product.name,
        nameUrdu: item.nameUrdu != null && item.nameUrdu !== '' ? item.nameUrdu : product.nameUrdu || '',
        image: item.image || product.image,
        quantity: item.quantity,
        unit: conversion.lineUnit,
        conversionFactor: conversion.conversionFactor,
        stockQuantity: conversion.stockQuantity,
        unitPrice: item.unitPrice,
        cost: itemCost,
        subtotal: itemDiscount.subtotal,
        profit: itemDiscount.profit,
        discountType: itemDiscount.discountType,
        discountValue: itemDiscount.discountValue,
        discountAmount: itemDiscount.discountAmount,
        isManualEntry: item.isManualEntry || false,
        imeis: item.imeis || [],
      };

      validatedItems.push(validatedItem);
    }

    if (!willRemainQuotation) {
      await imeiService.validateImeisAvailable({
        items: validatedItems,
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
      });
    }

    updateBody.items = validatedItems;

    // Update stock quantities for new items (quotations do not affect stock)
    if (!willRemainQuotation) {
      for (const item of validatedItems) {
        const allocations = getItemBatchAllocations(item);
        if (item.variantId && allocations.length > 0) {
          for (const alloc of allocations) {
            await batchService.sellFromBatch(alloc.batchId, alloc.quantity, {
              refType: 'Invoice',
              refId: invoice._id,
              userId,
            });
          }
          continue;
        }
        if (item.variantId) {
          await inventoryService.adjustInventory(item.variantId, {
            quantityDelta: -item.stockQuantity,
            type: 'sale',
            refType: 'Invoice',
            refId: invoice._id,
            userId,
          });
          continue;
        }
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stockQuantity: -item.stockQuantity } },
          { new: true }
        );
        await inventorySyncService.recordStockChange({
          organizationId: invoice.organizationId,
          productId: item.productId,
          quantityDelta: -item.stockQuantity,
          type: 'sale',
          refType: 'Invoice',
          refId: invoice._id,
          unitCost: item.cost,
          createdBy: userId,
        });
      }

      await imeiService.markImeisSoldForInvoice({
        invoiceId: invoice._id,
        items: validatedItems,
        customerId: updateBody.customerId !== undefined ? updateBody.customerId : invoice.customerId,
        customerName: (updateBody.customerName ?? invoice.customerName) || (updateBody.walkInCustomerName ?? invoice.walkInCustomerName) || '',
        saleDate: invoice.invoiceDate || new Date(),
        updatedBy: userId,
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
      });
    }
  }

  console.log('Updating invoice:', invoiceId);
  console.log('Update fields:', Object.keys(updateBody));

  // Resolve the overall discount server-side, same as createInvoice — falls back to the
  // existing document's values when the update doesn't touch discount, and to the
  // just-rebuilt items' net subtotal (or the existing stored subtotal when items weren't
  // touched) as the base it's applied against.
  const overallDiscountType = updateBody.discountType !== undefined
    ? updateBody.discountType
    : (invoice.discountType || 'fixed');
  const overallDiscountValue = updateBody.discountValue !== undefined
    ? Number(updateBody.discountValue)
    : updateBody.discount !== undefined
      ? Number(updateBody.discount)
      : Number(invoice.discountValue || 0);
  const overallNetSubtotal = updateBody.items
    ? updateBody.items.reduce((sum, item) => sum + item.subtotal, 0)
    : invoice.subtotal;
  updateBody.discountType = overallDiscountType;
  updateBody.discountValue = overallDiscountValue;
  updateBody.discount = computeDiscountAmount(overallNetSubtotal, overallDiscountType, overallDiscountValue);
  // '' from "cleared the salesman" would fail the ObjectId cast — normalize to null.
  if ('salesmanId' in updateBody) {
    updateBody.salesmanId = updateBody.salesmanId || null;
  }

  Object.assign(invoice, updateBody);
  invoice.updatedBy = userId;

  // Recalculate totals on every update — a discount-only edit (no item changes) must
  // still re-resolve total/balance, not just item edits.
  invoice.calculateTotals();

  if (invoice.type === 'cash' && !invoice.splitPaymentMethod) {
    // Skipped when a split payment leg is active — see the matching comment on
    // Invoice.finalize() in invoice.model.js. `calculateTotals()` above already set
    // `balance = total - paidAmount` from the (possibly partial, split-across-two-legs)
    // paidAmount the client sent; forcing paidAmount back to `total` here would silently
    // invalidate the cash/wallet split resolved from it in resolveInvoicePaymentLegs.
    invoice.paidAmount = invoice.total;
    invoice.balance = 0;
    invoice.status = 'paid';
  } else if (invoice.type === 'cash') {
    invoice.status = invoice.balance <= 0 ? 'paid' : 'finalized';
  }

  await invoice.save();
  console.log('Invoice updated successfully');
  await syncInvoiceCashAndWalletEntries(invoice, previousPaymentLegSnapshot);
  postInvoiceToAccounts(invoice);
  commissionEngineService.syncCommissionForInvoice(invoice, userId).catch(() => {});
  partnerProfitShareEngineService.syncPartnerShareForInvoice(invoice, userId).catch(() => {});

  const newCustomerId = invoice.customerId;
  const isConvertedPending =
    invoice.type === 'pending' && Boolean(invoice.isConvertedToBill);

  if (isConvertedPending && originalCustomerId && originalCustomerId !== 'walk-in') {
    try {
      await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);
      console.log('Removed ledger entries for converted pending invoice:', invoice.invoiceNumber);
    } catch (error) {
      console.error('Failed to remove ledger for converted pending invoice:', error);
    }
  }

  // Pending invoices never post to ledger; only credit/cash (and converted bills) do.
  const newTotal = invoice.total;
  const newPaidAmount = invoice.paidAmount || 0;
  const hasLedgerEntries = await CustomerLedger.exists({ referenceId: invoice._id });

  if (
    !isConvertedPending &&
    invoice.type !== 'pending' &&
    invoice.type !== 'quotation' &&
    originalCustomerId &&
    originalCustomerId !== 'walk-in' &&
    (originalTotal !== newTotal ||
      originalPaidAmount !== newPaidAmount ||
      originalCustomerId !== newCustomerId ||
      originalType !== invoice.type ||
      !hasLedgerEntries)
  ) {
    try {
      const ledgerPaymentMethod = resolveInvoiceLedgerPaymentMethod(invoice);
      console.log('Updating customer ledger entries for invoice:', {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        originalTotal: originalTotal,
        newTotal: newTotal,
        originalPaid: originalPaidAmount,
        newPaid: newPaidAmount,
        customerChanged: originalCustomerId !== newCustomerId
      });

      // If customer changed, delete old entries and create new ones
      if (originalCustomerId !== newCustomerId) {
        // Delete old ledger entries for the original customer
        await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);
        
        // Create new entries for new customer (if not walk-in)
        if (newCustomerId !== 'walk-in') {
          const invType = resolveInvoiceLedgerInvoiceType(invoice);
          const displayReference = invoice.billNumber ? `Bill #${invoice.billNumber}` : invoice.invoiceNumber;
          const description = invoice.billNumber
            ? `Bill sent to party - Bill #${invoice.billNumber}`
            : `Sale Invoice #${invoice.invoiceNumber} (Updated)`;

          const ledgerEntries = buildCustomerSaleLedgerEntries({
            organizationId: invoice.organizationId,
            branchId: invoice.branchId,
            customerId: newCustomerId,
            referenceId: invoice._id,
            invoiceNumber: invoice.invoiceNumber,
            displayReference,
            description,
            transactionDate: invoice.invoiceDate || new Date(),
            total: newTotal,
            paidAmount: newPaidAmount,
            invoiceType: invType,
            paymentMethod: ledgerPaymentMethod,
            notes: invoice.notes || 'Invoice updated',
            balance: invoice.balance,
            suffix: ' (Updated)',
          });

          for (const entry of ledgerEntries) {
            await customerLedgerService.createLedgerEntry(entry);
          }
        }
      } else {
        // Same customer - update existing entries
        const displayReference = invoice.billNumber ? `Bill #${invoice.billNumber}` : invoice.invoiceNumber;
        const description = invoice.billNumber
          ? `Bill sent to party - Bill #${invoice.billNumber}`
          : `Sale Invoice #${invoice.invoiceNumber}`;

        await customerLedgerService.updateLedgerEntriesByReference(invoice._id, {
          organizationId: invoice.organizationId,
          branchId: invoice.branchId,
          customerId: newCustomerId,
          total: newTotal,
          paidAmount: newPaidAmount,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          paymentMethod: ledgerPaymentMethod,
          invoiceType: invoice.type,
          notes: invoice.notes,
          displayReference,
          description,
          balance: invoice.balance,
        });
      }

      console.log('Customer ledger entries updated successfully');
    } catch (error) {
      console.error('Failed to update customer ledger entries:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      // Don't fail the invoice update if ledger update fails
    }
  }

  // Keep the employee ledger mirror (if any) in sync with the latest balance.
  try {
    await employeeLedgerService.syncPurchaseFromInvoice(invoice);
  } catch (error) {
    console.error('Failed to sync employee ledger for invoice:', error);
  }

  // Keep the supplier ledger mirror (if any) in sync with the latest balance.
  try {
    await supplierLedgerService.syncPurchaseFromInvoice(invoice);
  } catch (error) {
    console.error('Failed to sync supplier ledger for invoice:', error);
  }

  // Return populated invoice with customerName
  return getInvoiceById(invoiceId);
};

/**
 * Delete invoice by id
 * @param {ObjectId} invoiceId
 * @returns {Promise<Invoice>}
 */
const deleteInvoiceById = async (invoiceId) => {
  // Get the actual Mongoose document, not the plain object
  const invoice = await Invoice.findById(invoiceId);
  
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  
  // Restore stock quantities (quotations never deducted stock)
  if (invoice.type !== 'quotation') {
    for (const item of invoice.items) {
      const restoredQuantity = Number(item.stockQuantity || item.quantity || 0);
      const allocations = getItemBatchAllocations(item);
      if (item.variantId && allocations.length > 0) {
        for (const alloc of allocations) {
          await batchService.restoreToBatch(alloc.batchId, alloc.quantity, {
            refType: 'Invoice',
            refId: invoice._id,
          });
        }
        continue;
      }
      if (item.variantId) {
        await inventoryService.adjustInventory(item.variantId, {
          quantityDelta: restoredQuantity,
          type: 'return_in',
          refType: 'Invoice',
          refId: invoice._id,
        });
        continue;
      }
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: restoredQuantity } },
        { new: true }
      );
      await inventorySyncService.recordStockChange({
        organizationId: invoice.organizationId,
        productId: item.productId,
        quantityDelta: restoredQuantity,
        type: 'return_in',
        refType: 'Invoice',
        refId: invoice._id,
      });
    }
    await imeiService.releaseImeisForInvoice(invoice._id);
  }

  // Delete related customer ledger entries
  if (invoice.customerId && invoice.customerId !== 'walk-in') {
    try {
      console.log('Deleting customer ledger entries for invoice:', invoice.invoiceNumber);
      await customerLedgerService.deleteLedgerEntriesByReference(invoice._id);
    } catch (error) {
      console.error('Failed to delete customer ledger entries:', error);
      // Don't fail the invoice deletion if ledger deletion fails
    }
  }

  try {
    await employeeLedgerService.deletePurchaseAdvanceForInvoice(invoice._id);
  } catch (error) {
    console.error('Failed to delete employee ledger entry for invoice:', error);
  }

  try {
    await supplierLedgerService.deleteCustomerSaleOffsetForInvoice(invoice._id);
  } catch (error) {
    console.error('Failed to delete supplier ledger entry for invoice:', error);
  }

  await cashBookService.deleteEntriesByReference(invoice._id, 'Invoice');
  await walletEntryService.deleteEntriesByReference(invoice._id, 'Invoice');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: invoice.organizationId, branchId: invoice.branchId },
      'Invoice',
      invoice._id
    )
    .catch(() => {});

  // Reverse wallet balance if invoice was paid (in full or via a split) through a wallet
  const deletedLegs = resolveInvoicePaymentLegs(invoice);
  if (deletedLegs.walletAmount > 0 && deletedLegs.walletType) {
    try {
      await walletService.adjustWalletBalance({
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        type: deletedLegs.walletType,
        amount: deletedLegs.walletAmount,
        operation: 'deduct',
        userId: invoice.updatedBy || invoice.createdBy,
      });
    } catch (err) {
      console.error('Failed to reverse wallet balance on invoice delete:', err);
    }
  }

  // Reverse any commission earned on this invoice — the sale no longer exists.
  try {
    await salesmanCommissionLedgerService.reverseCommissionForReference({
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      salesmanId: invoice.salesmanId,
      reason: 'Invoice deleted',
      userId: invoice.updatedBy || invoice.createdBy,
    });
  } catch (err) {
    console.error('Failed to reverse commission on invoice delete:', err);
  }

  await invoice.deleteOne();
  return invoice;
};

/**
 * Convert a quotation to a cash or credit invoice.
 * Assigns a new INV number, deducts stock, and posts ledger/accounts.
 */
const convertQuotationToInvoice = async (invoiceId, convertBody, userId) => {
  const invoice = await Invoice.findById(invoiceId);

  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  if (invoice.type !== 'quotation') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only quotation invoices can be converted');
  }
  if (invoice.status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cancelled quotations cannot be converted');
  }

  const { targetType, paidAmount, dueDate, paymentMethod, walletType, notes } = convertBody;

  if (targetType === 'credit' && (!invoice.customerId || invoice.customerId === 'walk-in')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Credit invoices require a registered customer');
  }

  for (const item of invoice.items) {
    if (item.variantId) {
      const allocations = getItemBatchAllocations(item);
      // Overselling into negative stock is allowed (same policy as plain products — a
      // purchase entry brings the balance back up). Still block selling from a batch
      // that isn't active (depleted/expired/inactive).
      if (allocations.length > 0) {
        for (const alloc of allocations) {
          const batch = await Batch.findById(alloc.batchId);
          if (!batch || batch.status !== 'active') {
            throw new ApiError(
              httpStatus.BAD_REQUEST,
              `Batch ${batch?.batchNumber || alloc.batchNumber || ''} for ${item.name} is not active`,
            );
          }
        }
      }
      continue;
    }
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Product not found for item ${item.name}`);
    }
    // Simple products may go negative on sale — see createInvoice for rationale.
  }

  const previousQuotationNumber = invoice.invoiceNumber;
  invoice.type = targetType;
  invoice.invoiceNumber = await Invoice.generateNextDocumentNumber('INV');
  invoice.updatedBy = userId;
  invoice.convertedBy = userId;
  invoice.convertedAt = new Date();

  if (dueDate) {
    invoice.dueDate = dueDate;
  }
  if (paymentMethod) {
    invoice.paymentMethod = paymentMethod;
  }
  if (walletType) {
    invoice.walletType = walletType;
  }

  const conversionNote = `Converted from quotation ${previousQuotationNumber}`;
  if (notes) {
    invoice.notes = invoice.notes
      ? `${conversionNote}\n${notes}\n${invoice.notes}`
      : `${conversionNote}\n${notes}`;
  } else {
    invoice.notes = invoice.notes ? `${conversionNote}\n${invoice.notes}` : conversionNote;
  }

  if (targetType === 'cash') {
    invoice.paidAmount = paidAmount !== undefined ? paidAmount : invoice.total;
    invoice.balance = Math.max(0, invoice.total - invoice.paidAmount);
    invoice.finalize();
  } else {
    invoice.paidAmount = paidAmount !== undefined ? paidAmount : 0;
    invoice.balance = invoice.total - invoice.paidAmount;
    invoice.finalize();
  }

  await invoice.save();
  await syncInvoiceCashAndWalletEntries(invoice, null);
  postInvoiceToAccounts(invoice);
  commissionEngineService.syncCommissionForInvoice(invoice, userId).catch(() => {});
  partnerProfitShareEngineService.syncPartnerShareForInvoice(invoice, userId).catch(() => {});

  for (const item of invoice.items) {
    const stockQty = getStockQuantityFromItem(item);
    const allocations = getItemBatchAllocations(item);
    if (item.variantId && allocations.length > 0) {
      for (const alloc of allocations) {
        await batchService.sellFromBatch(alloc.batchId, alloc.quantity, {
          refType: 'Invoice',
          refId: invoice._id,
          userId,
        });
      }
      continue;
    }
    if (item.variantId) {
      await inventoryService.adjustInventory(item.variantId, {
        quantityDelta: -stockQty,
        type: 'sale',
        refType: 'Invoice',
        refId: invoice._id,
        userId,
      });
      continue;
    }
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stockQuantity: -stockQty } },
      { new: true },
    );
    await inventorySyncService.recordStockChange({
      organizationId: invoice.organizationId,
      productId: item.productId,
      quantityDelta: -stockQty,
      type: 'sale',
      refType: 'Invoice',
      refId: invoice._id,
      unitCost: item.cost,
      createdBy: userId,
    });
  }

  if (invoice.customerId && invoice.customerId !== 'walk-in') {
    try {
      const ledgerPaymentMethod = resolveInvoiceLedgerPaymentMethod(invoice);
      const [customer, hasExistingLedger] = await Promise.all([
        Customer.findById(invoice.customerId).select('balance organizationId branchId createdAt'),
        CustomerLedger.exists({ customer: invoice.customerId }),
      ]);

      if (customer && !hasExistingLedger && Number(customer.balance || 0) !== 0) {
        await customerLedgerService.syncOpeningBalanceEntry({
          customerId: invoice.customerId,
          amount: customer.balance,
          organizationId: invoice.organizationId,
          branchId: invoice.branchId,
          transactionDate: customer.createdAt,
        });
      }

      const ledgerInvoiceType = resolveInvoiceLedgerInvoiceType(invoice);
      const ledgerEntries = buildCustomerSaleLedgerEntries({
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        customerId: invoice.customerId,
        referenceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        displayReference: invoice.invoiceNumber,
        description: `Sale Invoice #${invoice.invoiceNumber}`,
        transactionDate: invoice.invoiceDate || new Date(),
        total: invoice.total,
        paidAmount: invoice.paidAmount,
        invoiceType: ledgerInvoiceType,
        paymentMethod: ledgerPaymentMethod,
        notes: invoice.notes,
        balance: invoice.balance,
      });

      for (const entry of ledgerEntries) {
        await customerLedgerService.createLedgerEntry(entry);
      }
    } catch (error) {
      console.error('Failed to create customer ledger entry on quotation conversion:', error);
    }
  }

  try {
    await employeeLedgerService.syncPurchaseFromInvoice(invoice);
  } catch (error) {
    console.error('Failed to sync employee ledger on quotation conversion:', error);
  }

  try {
    await supplierLedgerService.syncPurchaseFromInvoice(invoice);
  } catch (error) {
    console.error('Failed to sync supplier ledger on quotation conversion:', error);
  }

  return getInvoiceById(invoice._id);
};

/**
 * Finalize invoice
 * @param {ObjectId} invoiceId
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const finalizeInvoice = async (invoiceId, userId) => {
  const invoice = await getInvoiceById(invoiceId);
  
  if (invoice.status !== 'draft') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only draft invoices can be finalized');
  }

  invoice.finalize();
  invoice.updatedBy = userId;
  await invoice.save();
  postInvoiceToAccounts(invoice);
  commissionEngineService.syncCommissionForInvoice(invoice, userId).catch(() => {});
  partnerProfitShareEngineService.syncPartnerShareForInvoice(invoice, userId).catch(() => {});

  return invoice;
};

/**
 * Process payment for invoice
 * @param {ObjectId} invoiceId
 * @param {Object} paymentData
 * @param {string} userId
 * @returns {Promise<Invoice>}
 */
const processPayment = async (invoiceId, paymentData, userId) => {
  const { amount, method = 'cash', reference } = paymentData;
  
  const invoice = await getInvoiceById(invoiceId);
  
  if (amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than 0');
  }
  
  if (amount > invoice.balance) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount cannot exceed balance');
  }

  invoice.markAsPaid(amount, method, reference);
  invoice.updatedBy = userId;
  await invoice.save();
  await syncWalkInInvoiceCashEntry(invoice);
  postInvoiceToAccounts(invoice);
  commissionEngineService.syncCommissionForInvoice(invoice, userId).catch(() => {});
  partnerProfitShareEngineService.syncPartnerShareForInvoice(invoice, userId).catch(() => {});

  return invoice;
};

/**
 * Get invoice statistics
 * @param {Object} filter
 * @returns {Promise<Object>}
 */
const getInvoiceStatistics = async (filter = {}) => {
  const { dateFrom, dateTo, customerId, type } = filter;
  
  return await Invoice.getStatistics(dateFrom, dateTo);
};

/**
 * Get daily sales report
 * @param {Date} date
 * @returns {Promise<Object>}
 */
const getDailySalesReport = async (date = new Date()) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const invoices = await Invoice.find({
    invoiceDate: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['finalized', 'paid'] }
  });

  // Manually populate items.productId and conditionally populate customerId
  const populatedInvoices = [];
  for (const invoice of invoices) {
    const populateOptions = [{ path: 'items.productId' }];
    
    // Only populate customer if it's not a walk-in customer
    if (invoice.customerId && invoice.customerId !== 'walk-in') {
      populateOptions.push({ path: 'customerId' });
    }
    
    await invoice.populate(populateOptions);
    populatedInvoices.push(invoice);
  }
  
  const report = {
    date: date.toISOString().split('T')[0],
    totalInvoices: populatedInvoices.length,
    totalSales: 0,
    totalProfit: 0,
    totalCost: 0,
    cashSales: 0,
    creditSales: 0,
    topProducts: {},
    customerBreakdown: {}
  };
  
  populatedInvoices.forEach(invoice => {
    report.totalSales += invoice.total;
    report.totalProfit += invoice.totalProfit;
    report.totalCost += invoice.totalCost;
    
    if (invoice.type === 'cash') {
      report.cashSales += invoice.total;
    } else {
      report.creditSales += invoice.total;
    }
    
    // Top products
    invoice.items.forEach(item => {
      const productName = item.name;
      if (!report.topProducts[productName]) {
        report.topProducts[productName] = { quantity: 0, sales: 0 };
      }
      report.topProducts[productName].quantity += item.quantity;
      report.topProducts[productName].sales += item.subtotal;
    });
    
    // Customer breakdown
    if (invoice.customerId) {
      const customerName = invoice.customerId.name;
      if (!report.customerBreakdown[customerName]) {
        report.customerBreakdown[customerName] = { invoices: 0, sales: 0 };
      }
      report.customerBreakdown[customerName].invoices += 1;
      report.customerBreakdown[customerName].sales += invoice.total;
    }
  });
  
  return report;
};

/**
 * Generate unique bill number
 * @returns {Promise<string>}
 */
const generateBillNumber = async () => {
  return await Invoice.generateBillNumber();
};

/**
 * Preview the invoice number the next save would receive — same sequence
 * `generateNextDocumentNumber` assigns in the pre-save hook, just surfaced ahead of time
 * so the New Invoice form can show it before the invoice actually exists. Not reserved:
 * two concurrent previews can return the same value, same as generateBillNumber above —
 * the invoiceNumber unique index is still the real guard at save time.
 * @param {string} type - invoice type ('quotation' gets the QUO- prefix, everything else INV-)
 * @returns {Promise<string>}
 */
const previewNextInvoiceNumber = async (type) => {
  const prefix = type === 'quotation' ? 'QUO' : 'INV';
  return await Invoice.generateNextDocumentNumber(prefix);
};

/**
 * Get customer's product purchase history
 * @param {string} customerId
 * @param {string} productId
 * @returns {Promise<Object>}
 */
const getCustomerProductHistory = async (customerId, productId) => {
  // Find all invoices for this customer that contain this product
  const invoices = await Invoice.find({
    customerId,
    'items.productId': productId,
    status: { $ne: 'cancelled' } // Exclude cancelled invoices
  })
    .select('invoiceNumber items type createdAt invoiceDate')
    .sort({ createdAt: -1 }) // Most recent first
    .lean();

  // Extract product-specific data from each invoice
  const history = invoices.map(invoice => {
    const item = invoice.items.find(i => i.productId.toString() === productId);
    return {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.invoiceDate || invoice.createdAt,
      type: invoice.type,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal
    };
  });

  // Calculate statistics
  const stats = {
    history,
    totalQuantity: history.reduce((sum, item) => sum + item.quantity, 0),
    lastPrice: history.length > 0 ? history[0].unitPrice : null,
    avgPrice: history.length > 0 
      ? history.reduce((sum, item) => sum + item.unitPrice, 0) / history.length 
      : null,
    minPrice: history.length > 0 
      ? Math.min(...history.map(item => item.unitPrice)) 
      : null,
    maxPrice: history.length > 0 
      ? Math.max(...history.map(item => item.unitPrice)) 
      : null
  };

  return stats;
};

module.exports = {
  createInvoice,
  queryInvoices,
  getInvoiceById,
  updateInvoiceById,
  deleteInvoiceById,
  finalizeInvoice,
  processPayment,
  getInvoiceStatistics,
  getDailySalesReport,
  generateBillNumber,
  previewNextInvoiceNumber,
  getCustomerProductHistory,
  convertQuotationToInvoice,
};
