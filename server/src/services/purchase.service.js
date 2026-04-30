const httpStatus = require('http-status');
const { Purchase, Product, SupplierLedger, Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const supplierLedgerService = require('./supplierLedger.service');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const { normalizeBusinessType } = require('../config/businessTypes');
const { toStockQuantity, getStockQuantityFromItem } = require('../utils/inventoryUnitConversion');

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

const resolvePurchaseLedgerPaymentMethod = (purchase) => {
  const type = String(purchase.paymentType || 'Cash');
  if (type === 'Wallet') {
    const walletName = String(purchase.walletType || '').trim();
    return walletName ? `Wallet (${walletName})` : 'Wallet';
  }
  return type;
};

const syncPurchaseCashAndWalletEntries = async (purchase, previousPaymentType, previousWalletType, previousPaidAmount) => {
  const paidAmount = Number(purchase.paidAmount || 0);
  const paymentType = String(purchase.paymentType || 'Cash');
  const isWalletPayment = paymentType === 'Wallet' && purchase.walletType;

  if (paidAmount > 0 && !isWalletPayment) {
    await cashBookService.upsertReferenceEntry({
      organizationId: purchase.organizationId,
      branchId: purchase.branchId,
      type: 'expense',
      source: 'purchase',
      amount: paidAmount,
      paymentMethod: purchase.paymentType || 'cash',
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
  if (purchaseBody.paymentType === 'Wallet' && businessType !== 'mobile_shop') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Wallet payment is only available for mobile shop businesses');
  }

  // First, create the purchase
  const purchase = await Purchase.create(purchaseBody);

  // Now, update the stock quantity of each product in the purchase
  for (const item of purchase.items) {
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
    }
  }

  // Calculate balance if paidAmount is provided
  if (purchase.paidAmount !== undefined) {
    purchase.balance = purchase.totalAmount - purchase.paidAmount;
  }

  // Save the purchase with balance calculated
  await purchase.save();
  await syncPurchaseCashAndWalletEntries(purchase, null, null, 0);

  // Create supplier ledger entry if supplier is provided
  if (purchase.supplier) {
    try {
      const ledgerPaymentMethod = resolvePurchaseLedgerPaymentMethod(purchase);
      console.log('Creating supplier ledger entry for purchase:', {
        supplier: purchase.supplier,
        invoiceNumber: purchase.invoiceNumber,
        totalAmount: purchase.totalAmount,
        paidAmount: purchase.paidAmount,
        balance: purchase.balance
      });

      // Create purchase entry (credit - we owe supplier)
      const purchaseEntry = await supplierLedgerService.createLedgerEntry({
        organizationId: purchase.organizationId,
        branchId: purchase.branchId,
        supplier: purchase.supplier,
        transactionType: 'purchase',
        transactionDate: purchase.purchaseDate || new Date(),
        reference: purchase.invoiceNumber,
        referenceId: purchase._id,
        description: `Purchase Invoice #${purchase.invoiceNumber}`,
        debit: 0,
        credit: purchase.totalAmount,
        paymentMethod: ledgerPaymentMethod,
        notes: `Purchase of ${purchase.items.length} items`
      });
      console.log('Supplier ledger entry created for purchase:', purchase.invoiceNumber, 'Entry ID:', purchaseEntry._id);

      // If any amount is paid at the time of purchase, create payment entry (debit - we paid supplier)
      if (purchase.paidAmount && purchase.paidAmount > 0) {
        // Add 1 second to payment date so it appears after the purchase entry when sorted
        const paymentDate = new Date(purchase.purchaseDate || new Date());
        paymentDate.setSeconds(paymentDate.getSeconds() + 1);

        const paymentEntry = await supplierLedgerService.createLedgerEntry({
          organizationId: purchase.organizationId,
          branchId: purchase.branchId,
          supplier: purchase.supplier,
          transactionType: 'payment_made',
          transactionDate: paymentDate,
          reference: purchase.invoiceNumber,
          referenceId: purchase._id,
          description: `Payment made for Purchase #${purchase.invoiceNumber}${purchase.paidAmount < purchase.totalAmount ? ' (Partial)' : ''}`,
          debit: purchase.paidAmount,
          credit: 0,
          paymentMethod: ledgerPaymentMethod,
          notes: `Amount paid: Rs${purchase.paidAmount.toFixed(2)}${purchase.balance > 0 ? `, Balance: Rs${purchase.balance.toFixed(2)}` : ''}`
        });
        console.log('Payment ledger entry created for purchase:', purchase.invoiceNumber, 'Amount:', purchase.paidAmount, 'Entry ID:', paymentEntry._id);
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
  // Ensure 'populate' is set in options to include supplier and product data
  options.populate = 'supplier,items.product';
  const purchases = await Purchase.paginate(filter, options);
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
    .populate('items.product'); // Populate the 'product' field within each item in the items array
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

  if (updateBody.paymentType === 'Wallet' && businessType !== 'mobile_shop') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Wallet payment is only available for mobile shop businesses');
  }

  // Loop through the updated items and calculate the stock adjustments and price updates
  for (const updatedItem of updateBody.items || []) {

    // Find the existing purchase item
    const existingItem = purchase.items.find((item) => getPurchaseProductId(item) === updatedItem.product.toString());

    if (existingItem) {
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
      }
    }
  }

  // Handle removed items - decrease stock for items that were in original but not in update
  for (const originalItem of purchase.items) {
    const originalProductId = getPurchaseProductId(originalItem);
    const stillExists = updateBody.items?.find((item) => item.product.toString() === originalProductId);
    
    if (!stillExists) {
      // REMOVED ITEM - Subtract the quantity from stock
      const product = await Product.findById(originalItem.product);
      
      if (product) {
        // Subtract the quantity since this item was removed
        product.stockQuantity -= Number(originalItem.stockQuantity || originalItem.quantity || 0);
        
        // Save the product with updated stock
        await product.save();
      }
    }
  }

  // Now update the purchase itself
  Object.assign(purchase, updateBody); // Merge the new values into the purchase document
  await purchase.save(); // Save the updated purchase document
  await syncPurchaseCashAndWalletEntries(purchase, originalPaymentType, originalWalletType, originalPaidAmount);

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
        await supplierLedgerService.createLedgerEntry({
          organizationId: purchase.organizationId,
          branchId: purchase.branchId,
          supplier: newSupplier,
          transactionType: 'purchase',
          transactionDate: purchase.purchaseDate || new Date(),
          reference: purchase.invoiceNumber,
          referenceId: purchase._id,
          description: `Purchase Invoice #${purchase.invoiceNumber} (Updated)`,
          debit: 0,
          credit: newTotalAmount,
          paymentMethod: ledgerPaymentMethod,
          notes: `Purchase of ${purchase.items.length} items (Updated)`
        });

        if (newPaidAmount > 0) {
          const paymentDate = new Date(purchase.purchaseDate || new Date());
          paymentDate.setSeconds(paymentDate.getSeconds() + 1);

          await supplierLedgerService.createLedgerEntry({
            organizationId: purchase.organizationId,
            branchId: purchase.branchId,
            supplier: newSupplier,
            transactionType: 'payment_made',
            transactionDate: paymentDate,
            reference: purchase.invoiceNumber,
            referenceId: purchase._id,
            description: `Payment for Purchase #${purchase.invoiceNumber} (Updated)`,
            debit: newPaidAmount,
            credit: 0,
            paymentMethod: ledgerPaymentMethod,
            notes: `Amount paid: Rs${newPaidAmount.toFixed(2)}`
          });
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
          itemsCount: purchase.items.length,
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
    const product = await Product.findById(item.product);
    
    if (product) {
      // Subtract the purchased quantity from the product's stockQuantity
      product.stockQuantity -= Number(item.stockQuantity || item.quantity || 0);

      // Save the updated product stock
      await product.save();
    }
  }

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
  }).populate('items.product');
};

module.exports = {
  createPurchase,
  queryPurchases,
  getPurchaseById,
  updatePurchaseById,
  deletePurchaseById,
  getPurchaseByDate
};
