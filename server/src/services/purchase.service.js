const httpStatus = require('http-status');
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

const resolvePurchaseLedgerPaymentMethod = (purchase) => {
  const type = String(purchase.paymentType || 'Cash');
  if (type === 'Wallet') {
    const walletName = String(purchase.walletType || '').trim();
    return walletName ? `Wallet (${walletName})` : 'Wallet';
  }
  return type;
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

const syncPurchaseCashAndWalletEntries = async (purchase, previousPaymentType, previousWalletType, previousPaidAmount) => {
  const paidAmount = Number(purchase.paidAmount || 0);
  const paymentType = String(purchase.paymentType || 'Cash');
  const isWalletPayment = paymentType === 'Wallet' && purchase.walletType;

  const isCashPayment = cashBookService.isCashPaymentMethod(paymentType);

  if (paidAmount > 0 && isCashPayment) {
    await cashBookService.upsertReferenceEntry({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: 'expense',
      source: 'purchase',
      amount: paidAmount,
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

  if (isWalletPayment && paidAmount > 0) {
    await walletEntryService.upsertReferenceEntry({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      walletType: purchase.walletType.trim(),
      type: 'out',
      amount: paidAmount,
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

  if (isWalletPayment) {
    const walletType = purchase.walletType.trim();
    const prevType = String(previousPaymentType || 'Cash');
    const prevPaid = Number(previousPaidAmount || 0);

    if (prevType === 'Wallet' && previousWalletType && prevPaid > 0) {
      const previousWallet = previousWalletType.trim();
      if (previousWallet === walletType) {
        const delta = paidAmount - prevPaid;
        if (delta !== 0) {
          await walletService.adjustWalletBalance({
            organizationId: purchase.organizationId,
            branchId: purchase.branchId,
            type: walletType,
            amount: Math.abs(delta),
            operation: delta > 0 ? 'deduct' : 'add',
            userId: purchase.updatedBy || purchase.createdBy,
          });
        }
        return;
      }

      await walletService.adjustWalletBalance({
        organizationId: purchase.organizationId,
        branchId: purchase.branchId,
        type: previousWallet,
        amount: prevPaid,
        operation: 'add',
        userId: purchase.updatedBy || purchase.createdBy,
      });
    }

    if (paidAmount > 0) {
      await walletService.adjustWalletBalance({
        organizationId: purchase.organizationId,
        branchId: purchase.branchId,
        type: walletType,
        amount: paidAmount,
        operation: 'deduct',
        userId: purchase.updatedBy || purchase.createdBy,
      });
    }
  } else if (String(previousPaymentType || 'Cash') === 'Wallet' && previousWalletType && Number(previousPaidAmount || 0) > 0) {
    await walletService.adjustWalletBalance({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: previousWalletType.trim(),
      amount: Number(previousPaidAmount),
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
  const businessType = await getOrganizationBusinessType(purchaseBody.organizationId);

  // First, create the purchase
  const normalizedBody = {
    ...purchaseBody,
    balance:
      purchaseBody.paidAmount !== undefined
        ? resolvePurchaseInvoiceBalance(purchaseBody.totalAmount, purchaseBody.paidAmount)
        : purchaseBody.balance,
  };
  const purchase = await Purchase.create(normalizedBody);

  const supplierDoc = purchase.supplier ? await Supplier.findById(purchase.supplier).select('name') : null;

  // Now, update the stock quantity of each product in the purchase
  for (const item of purchase.items) {
    // Real-variant line item — bypasses the legacy Product.stockQuantity path entirely
    // (that field is a fallback-only display value once a product hasVariants; it must
    // never be mutated by variant-specific purchasing). Batch/expiry-tracked variants
    // create a Batch (the new primary source of batches, see
    // docs/architecture/universal-product-migration.md); other real variants get a
    // plain inventory increment via inventory.service.js.
    if (item.variantId) {
      const variant = await ProductVariant.findById(item.variantId);
      if (variant) {
        const quantityDelta = Number(item.quantity || 0);
        item.stockQuantity = quantityDelta;

        if ((variant.trackBatch || variant.trackExpiry) && item.batchNumber) {
          await batchService.createBatch(variant._id, {
            batchNumber: item.batchNumber,
            quantity: quantityDelta,
            costPerUnit: item.priceAtPurchase,
            sellingPrice: item.sellingPriceAtPurchase,
            expiryDate: item.expiryDate,
            purchaseId: purchase._id,
            createdBy: purchase.createdBy,
          });
        } else {
          await inventoryService.adjustInventory(variant._id, {
            quantityDelta,
            reason: 'Purchase',
            userId: purchase.createdBy,
          });
        }
      }
      continue;
    }

    const product = await Product.findById(item.product);

    if (product) {
      const conversion = toStockQuantity({ product, item, businessType });
      item.unit = conversion.lineUnit;
      item.conversionFactor = conversion.conversionFactor;
      item.stockQuantity = conversion.stockQuantity;

      // Increase stock in product stock unit (typically pcs)
      product.stockQuantity += conversion.stockQuantity;

      // Update the product's cost price to the latest purchase price
      if (item.priceAtPurchase > 0) {
        product.cost = item.priceAtPurchase;
      }

      // Update the product's selling price if provided
      if (item.sellingPriceAtPurchase > 0) {
        product.price = item.sellingPriceAtPurchase;
      }

      // Save the updated product
      await product.save();

      await inventorySyncService.recordStockChange({
        organizationId: purchase.organizationId,
        productId: product._id,
        quantityDelta: conversion.stockQuantity,
        type: 'purchase',
        refType: 'Purchase',
        refId: purchase._id,
        unitCost: item.priceAtPurchase,
        createdBy: purchase.createdBy,
      });

      // Track per-unit IMEI/serial numbers for products that require it (mobile phones)
      if (product.trackImei && item.imeis && item.imeis.length > 0) {
        await imeiService.syncImeisForPurchaseItem({
          purchaseId: purchase._id,
          productId: product._id,
          productName: product.name,
          imeis: item.imeis,
          purchasePrice: item.priceAtPurchase,
          supplierId: purchase.supplier || null,
          supplierName: supplierDoc?.name || '',
          purchaseDate: purchase.purchaseDate,
          organizationId: purchase.organizationId,
          branchId: purchase.branchId,
          createdBy: purchase.createdBy,
        });
      }
    }
  }

  // Calculate balance if paidAmount is provided
  if (purchase.paidAmount !== undefined) {
    purchase.balance = resolvePurchaseInvoiceBalance(purchase.totalAmount, purchase.paidAmount);
  }

  // Save the purchase with balance calculated
  await purchase.save();
  await syncPurchaseCashAndWalletEntries(purchase, null, null, 0);
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
    documentFields: ['invoiceNumber', 'notes'],
  });
  // Array form, not a comma-joined string — the paginate plugin's string parser
  // converts each dotted path into a nested {path,populate} shorthand via
  // reverse+reduce, and two of those sharing the same top-level "items" path silently
  // overwrite each other's nested populate instead of merging. Passing an array calls
  // .populate() with each entry as-is, so flat dotted strings like 'items.variantId'
  // work the same way getPurchaseById already does it successfully.
  opts.populate = ['supplier', 'items.product', 'items.variantId'];
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
    .populate('items.variantId'); // Real-variant line items — lets views show "Toshiba — 12" not just "Toshiba"
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
  const originalWalletType = purchase.walletType || null;
  const businessType = await getOrganizationBusinessType(purchase.organizationId);
  const supplierIdForUpdate = updateBody.supplier || originalSupplier;
  const supplierDocForUpdate = supplierIdForUpdate ? await Supplier.findById(supplierIdForUpdate).select('name') : null;

  // Loop through the updated items and calculate the stock adjustments and price updates
  for (const updatedItem of updateBody.items || []) {
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

          if (quantityDifference !== 0) {
            if ((variant.trackBatch || variant.trackExpiry) && updatedItem.batchNumber) {
              await batchService.adjustBatchQuantity(variant._id, {
                batchNumber: updatedItem.batchNumber,
                quantityDelta: quantityDifference,
                createdBy: purchase.createdBy,
              });
            } else {
              await inventoryService.adjustInventory(variant._id, {
                quantityDelta: quantityDifference,
                reason: 'Purchase edit',
                userId: purchase.createdBy,
              });
            }
          }
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

        // Update the product's cost price to the latest purchase price
        if (updatedItem.priceAtPurchase > 0) {
          product.cost = updatedItem.priceAtPurchase;
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
          unitCost: updatedItem.priceAtPurchase,
          createdBy: purchase.createdBy,
        });

        if (product.trackImei) {
          await imeiService.syncImeisForPurchaseItem({
            purchaseId: purchase._id,
            productId: product._id,
            productName: product.name,
            imeis: updatedItem.imeis || [],
            purchasePrice: updatedItem.priceAtPurchase,
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

        if ((variant.trackBatch || variant.trackExpiry) && updatedItem.batchNumber) {
          await batchService.createBatch(variant._id, {
            batchNumber: updatedItem.batchNumber,
            quantity: quantityDelta,
            costPerUnit: updatedItem.priceAtPurchase,
            sellingPrice: updatedItem.sellingPriceAtPurchase,
            expiryDate: updatedItem.expiryDate,
            purchaseId: purchase._id,
            createdBy: purchase.createdBy,
          });
        } else {
          await inventoryService.adjustInventory(variant._id, {
            quantityDelta,
            reason: 'Purchase edit (new item)',
            userId: purchase.createdBy,
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

        // Update the product's cost price to the latest purchase price
        if (updatedItem.priceAtPurchase > 0) {
          product.cost = updatedItem.priceAtPurchase;
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
          unitCost: updatedItem.priceAtPurchase,
          createdBy: purchase.createdBy,
        });

        if (product.trackImei && updatedItem.imeis && updatedItem.imeis.length > 0) {
          await imeiService.syncImeisForPurchaseItem({
            purchaseId: purchase._id,
            productId: product._id,
            productName: product.name,
            imeis: updatedItem.imeis,
            purchasePrice: updatedItem.priceAtPurchase,
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

        if (product.trackImei) {
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
  if (purchase.paidAmount !== undefined) {
    purchase.balance = resolvePurchaseInvoiceBalance(purchase.totalAmount, purchase.paidAmount);
  }
  await purchase.save();
  await syncPurchaseCashAndWalletEntries(purchase, originalPaymentType, originalWalletType, originalPaidAmount);
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

  if (purchase.paymentType === 'Wallet' && purchase.walletType && Number(purchase.paidAmount || 0) > 0) {
    await walletService.adjustWalletBalance({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: purchase.walletType.trim(),
      amount: Number(purchase.paidAmount),
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
