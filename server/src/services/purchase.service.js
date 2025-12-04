const httpStatus = require('http-status');
const { Purchase, Product } = require('../models');
const ApiError = require('../utils/ApiError');
const supplierLedgerService = require('./supplierLedger.service');

/**
 * Create a purchase record
 * @param {Object} purchaseBody
 * @returns {Promise<Purchase>}
 */
const createPurchase = async (purchaseBody) => {
  // First, create the purchase
  const purchase = await Purchase.create(purchaseBody);

  // Now, update the stock quantity of each product in the purchase
  for (const item of purchase.items) {
    const product = await Product.findById(item.product);

    if (product) {
      // Increase stock quantity based on the purchased quantity
      product.stockQuantity += item.quantity;

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

  // Create supplier ledger entry if supplier is provided
  if (purchase.supplier) {
    try {
      console.log('Creating supplier ledger entry for purchase:', {
        supplier: purchase.supplier,
        invoiceNumber: purchase.invoiceNumber,
        totalAmount: purchase.totalAmount,
        paidAmount: purchase.paidAmount,
        balance: purchase.balance
      });

      // Create purchase entry (credit - we owe supplier)
      const purchaseEntry = await supplierLedgerService.createLedgerEntry({
        supplier: purchase.supplier,
        transactionType: 'purchase',
        transactionDate: purchase.purchaseDate || new Date(),
        reference: purchase.invoiceNumber,
        referenceId: purchase._id,
        description: `Purchase Invoice #${purchase.invoiceNumber}`,
        debit: 0,
        credit: purchase.totalAmount,
        paymentMethod: purchase.paymentType,
        notes: `Purchase of ${purchase.items.length} items`
      });
      console.log('Supplier ledger entry created for purchase:', purchase.invoiceNumber, 'Entry ID:', purchaseEntry._id);

      // If any amount is paid at the time of purchase, create payment entry (debit - we paid supplier)
      if (purchase.paidAmount && purchase.paidAmount > 0) {
        // Add 1 second to payment date so it appears after the purchase entry when sorted
        const paymentDate = new Date(purchase.purchaseDate || new Date());
        paymentDate.setSeconds(paymentDate.getSeconds() + 1);

        const paymentEntry = await supplierLedgerService.createLedgerEntry({
          supplier: purchase.supplier,
          transactionType: 'payment_made',
          transactionDate: paymentDate,
          reference: purchase.invoiceNumber,
          referenceId: purchase._id,
          description: `Payment made for Purchase #${purchase.invoiceNumber}${purchase.paidAmount < purchase.totalAmount ? ' (Partial)' : ''}`,
          debit: purchase.paidAmount,
          credit: 0,
          paymentMethod: purchase.paymentType,
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

  // Loop through the updated items and calculate the stock adjustments and price updates
  for (const updatedItem of updateBody.items || []) {

    // Find the existing purchase item
    const existingItem = purchase.items.find(item => item.product._id.toString() === updatedItem.product.toString());

    if (existingItem) {
      // EXISTING ITEM - Calculate the difference and adjust stock
      const product = await Product.findById(updatedItem.product);

      if (product) {
        // Subtract the previous quantity and add the updated quantity
        const previousQuantity = existingItem.quantity;
        const quantityDifference = updatedItem.quantity - previousQuantity;

        // Update the stock quantity
        product.stockQuantity += quantityDifference;

        // Update the product price with the new price
        product.price = updatedItem.priceAtPurchase;

        // Save the product with updated stock and price
        await product.save();
      }
    } else {
      // NEW ITEM - Add the full quantity to stock (wasn't in original purchase)
      const product = await Product.findById(updatedItem.product);

      if (product) {
        // Add the full quantity since this is a new item
        product.stockQuantity += updatedItem.quantity;

        // Update the product price with the new price
        product.price = updatedItem.priceAtPurchase;

        // Save the product with updated stock and price
        await product.save();
      }
    }
  }

  // Handle removed items - decrease stock for items that were in original but not in update
  for (const originalItem of purchase.items) {
    const stillExists = updateBody.items?.find(item => item.product.toString() === originalItem.product._id.toString());
    
    if (!stillExists) {
      // REMOVED ITEM - Subtract the quantity from stock
      const product = await Product.findById(originalItem.product);
      
      if (product) {
        // Subtract the quantity since this item was removed
        product.stockQuantity -= originalItem.quantity;
        
        // Save the product with updated stock
        await product.save();
      }
    }
  }

  // Now update the purchase itself
  Object.assign(purchase, updateBody); // Merge the new values into the purchase document
  await purchase.save(); // Save the updated purchase document

  // Update supplier ledger entries if amounts or supplier changed
  const newSupplier = purchase.supplier?._id || purchase.supplier;
  const newTotalAmount = purchase.totalAmount;
  const newPaidAmount = purchase.paidAmount || 0;

  if (originalSupplier && (
    originalTotalAmount !== newTotalAmount || 
    originalPaidAmount !== newPaidAmount ||
    originalSupplier.toString() !== newSupplier.toString()
  )) {
    try {
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
          supplier: newSupplier,
          transactionType: 'purchase',
          transactionDate: purchase.purchaseDate || new Date(),
          reference: purchase.invoiceNumber,
          referenceId: purchase._id,
          description: `Purchase Invoice #${purchase.invoiceNumber} (Updated)`,
          debit: 0,
          credit: newTotalAmount,
          paymentMethod: purchase.paymentType,
          notes: `Purchase of ${purchase.items.length} items (Updated)`
        });

        if (newPaidAmount > 0) {
          const paymentDate = new Date(purchase.purchaseDate || new Date());
          paymentDate.setSeconds(paymentDate.getSeconds() + 1);

          await supplierLedgerService.createLedgerEntry({
            supplier: newSupplier,
            transactionType: 'payment_made',
            transactionDate: paymentDate,
            reference: purchase.invoiceNumber,
            referenceId: purchase._id,
            description: `Payment for Purchase #${purchase.invoiceNumber} (Updated)`,
            debit: newPaidAmount,
            credit: 0,
            paymentMethod: purchase.paymentType,
            notes: `Amount paid: Rs${newPaidAmount.toFixed(2)}`
          });
        }
      } else {
        // Same supplier - update existing entries
        await supplierLedgerService.updateLedgerEntriesByReference(purchase._id, {
          totalAmount: newTotalAmount,
          paidAmount: newPaidAmount,
          invoiceNumber: purchase.invoiceNumber,
          purchaseDate: purchase.purchaseDate,
          paymentMethod: purchase.paymentType,
          itemsCount: purchase.items.length
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
      product.stockQuantity -= item.quantity;

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

  // Remove the purchase after adjusting stock quantities
  await purchase.remove();

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
