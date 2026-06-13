const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Invoice, Product, Customer, CustomerLedger, Organization } = require('../models');
const ApiError = require('../utils/ApiError');
const { resolveInvoiceLedgerInvoiceType } = require('../utils/ledgerInvoiceType');
const { buildCustomerSaleLedgerEntries } = require('../utils/ledgerSettlement');
const customerLedgerService = require('./customerLedger.service');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const accountsSystemService = require('./accountsSystem.service');
const { normalizeBusinessType } = require('../config/businessTypes');
const { toStockQuantity, getStockQuantityFromItem } = require('../utils/inventoryUnitConversion');

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
  const method = (invoice.paymentMethod || 'cash').toLowerCase();
  if (method === 'wallet') {
    const walletName = (invoice.walletType || '').trim();
    return walletName ? `Wallet (${walletName})` : 'Wallet';
  }
  if (method === 'bank') return 'Bank Transfer';
  if (method === 'card') return 'Card';
  return 'Cash';
};

const syncInvoiceCashAndWalletEntries = async (invoice, previousPaymentMethod, previousWalletType, previousPaidAmount) => {
  const paidAmount = Number(invoice.paidAmount || 0);
  const isWalkIn = !invoice.customerId || invoice.customerId === 'walk-in';
  const method = (invoice.paymentMethod || 'cash').toLowerCase();
  const isWalletPayment = method === 'wallet' && invoice.walletType;

  // Cash book: any non-wallet receipt (cash / bank / card / cheque) — wallet payments
  // live in the Wallet module only. The Invoice module is the single source of
  // truth for invoice cashbook lines so the customer ledger doesn't double-count.
  const shouldCreateCashBookEntry = paidAmount > 0 && !isWalletPayment;

  if (!shouldCreateCashBookEntry || paidAmount <= 0) {
    await cashBookService.deleteEntriesByReference(invoice._id, 'Invoice');
  } else {
    const cashBookPaymentMethod = resolveInvoicePaymentMethod(invoice);
    await cashBookService.upsertReferenceEntry({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      type: 'income',
      source: 'sale',
      amount: paidAmount,
      paymentMethod: cashBookPaymentMethod,
      referenceId: invoice._id,
      referenceModel: 'Invoice',
      description: `Sale payment for Invoice #${invoice.invoiceNumber}`,
      date: invoice.invoiceDate || invoice.createdAt || new Date(),
      createdBy: invoice.createdBy,
    });
  }

  // Wallet ledger: invoice wallet receipts should live in Wallet entries, not CashBook.
  if (isWalletPayment && paidAmount > 0) {
    await walletEntryService.upsertReferenceEntry({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      walletType: invoice.walletType.trim(),
      type: 'in',
      amount: paidAmount,
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

  // --- Wallet balance adjustment ---
  if (isWalletPayment) {
    const walletTypeName = invoice.walletType.trim();
    const prevMethod = (previousPaymentMethod || 'cash').toLowerCase();
    const prevPaid = Number(previousPaidAmount || 0);

    // Reverse previous wallet credit if the invoice had a different wallet payment before
    if (prevMethod === 'wallet' && previousWalletType && prevPaid > 0) {
      const prevWalletName = previousWalletType.trim();
      if (prevWalletName !== walletTypeName || prevPaid !== paidAmount) {
        // Deduct the old amount from the old wallet (if same wallet, we'll net below)
        if (prevWalletName !== walletTypeName) {
          await walletService.adjustWalletBalance({
            organizationId: invoice.organizationId,
            branchId: invoice.branchId,
            type: prevWalletName,
            amount: prevPaid,
            operation: 'deduct',
            userId: invoice.updatedBy || invoice.createdBy,
          });
        } else {
          // Same wallet, different amount — adjust the delta
          const delta = paidAmount - prevPaid;
          if (delta !== 0) {
            await walletService.adjustWalletBalance({
              organizationId: invoice.organizationId,
              branchId: invoice.branchId,
              type: walletTypeName,
              amount: Math.abs(delta),
              operation: delta > 0 ? 'add' : 'deduct',
              userId: invoice.updatedBy || invoice.createdBy,
            });
          }
          return; // Done
        }
      } else {
        return; // No change
      }
    }

    // Credit the new wallet with the paid amount
    if (paidAmount > 0) {
      await walletService.adjustWalletBalance({
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        type: walletTypeName,
        amount: paidAmount,
        operation: 'add',
        userId: invoice.updatedBy || invoice.createdBy,
      });
    }
  } else if (previousPaymentMethod === 'wallet' && previousWalletType && Number(previousPaidAmount || 0) > 0) {
    // Payment method changed away from wallet — deduct from old wallet
    await walletService.adjustWalletBalance({
      organizationId: invoice.organizationId,
      branchId: invoice.branchId,
      type: previousWalletType.trim(),
      amount: Number(previousPaidAmount),
      operation: 'deduct',
      userId: invoice.updatedBy || invoice.createdBy,
    });
  }
};

// Legacy wrapper for the create path (no previous payment info)
const syncWalkInInvoiceCashEntry = (invoice) =>
  syncInvoiceCashAndWalletEntries(invoice, null, null, 0);

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

  // Validate products and calculate totals
  const validatedItems = [];
  for (const item of invoiceBody.items) {
    if (!item.productId) {
      console.error('Missing productId for item:', item);
      throw new ApiError(httpStatus.BAD_REQUEST, 'Product ID is required for all items');
    }

    const product = await Product.findById(item.productId);
    if (!product) {
      console.error('Product not found:', item.productId);
      throw new ApiError(httpStatus.BAD_REQUEST, `Product with ID ${item.productId} not found`);
    }

    const conversion = toStockQuantity({ product, item, businessType });

    // Check stock availability (quotations do not reserve stock)
    if (!isQuotation && product.stockQuantity < conversion.stockQuantity) {
      console.error('Insufficient stock:', {
        product: product.name,
        available: product.stockQuantity,
        requested: conversion.stockQuantity
      });
      throw new ApiError(
        httpStatus.BAD_REQUEST, 
        `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${conversion.stockQuantity}`
      );
    }

    // Prepare validated item
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
      cost: item.cost || product.cost,
      subtotal: item.quantity * item.unitPrice,
      profit: (item.quantity * item.unitPrice) - (conversion.stockQuantity * (item.cost || product.cost)),
      isManualEntry: item.isManualEntry || false
    };

    validatedItems.push(validatedItem);
  }

  // Create invoice
  const invoice = new Invoice({
    ...invoiceBody,
    items: validatedItems,
    createdBy: userId,
    updatedBy: userId
  });

  // Calculate totals
  invoice.calculateTotals();

  // Auto-finalize cash invoices
  if (invoice.type === 'cash') {
    invoice.finalize();
  }

  // Save with retry for duplicate invoice number race condition (E11000)
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await invoice.save();
      break;
    } catch (err) {
      if (err.code === 11000 && err.keyPattern && err.keyPattern.invoiceNumber && attempt < MAX_RETRIES - 1) {
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

  // Create customer ledger entry for non-walk-in customers
  if (invoice.customerId && invoice.customerId !== 'walk-in' && invoice.type !== 'pending' && invoice.type !== 'quotation') {
    try {
      const ledgerPaymentMethod = resolveInvoiceLedgerPaymentMethod(invoice);
      const customer = await Customer.findById(invoice.customerId).select('balance organizationId branchId createdAt');
      const hasExistingLedger = await CustomerLedger.exists({ customer: invoice.customerId });

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

  // Update product stock quantities (quotations do not affect stock until converted)
  if (!isQuotation) {
    console.log('Updating stock quantities for invoice type:', invoice.type);
    for (const item of validatedItems) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: -item.stockQuantity } },
        { new: true }
      );
      console.log(`Stock reduced for product ${item.productId}: -${item.stockQuantity}`);
    }
  }

  // Populate references conditionally
  const populateOptions = [
    { path: 'items.productId', select: 'name nameUrdu barcode category' },
    { path: 'createdBy', select: 'name email' }
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
  const invoices = await Invoice.paginate(filter, options);

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
    { path: 'createdBy updatedBy', select: 'name email' }
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
  const originalPaymentMethod = invoice.paymentMethod || 'cash';
  const originalWalletType = invoice.walletType || null;
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
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stockQuantity: Number(item.stockQuantity || item.quantity || 0) } },
          { new: true }
        );
      }
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

      const conversion = getStockQuantityFromItem({ product, item, businessType });

      if (!willRemainQuotation && product.stockQuantity < conversion.stockQuantity) {
        throw new ApiError(
          httpStatus.BAD_REQUEST, 
          `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Requested: ${conversion.stockQuantity}`
        );
      }

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
        cost: item.cost || product.cost,
        subtotal: item.quantity * item.unitPrice,
        profit: (item.quantity * item.unitPrice) - (conversion.stockQuantity * (item.cost || product.cost)),
        isManualEntry: item.isManualEntry || false
      };

      validatedItems.push(validatedItem);
    }

    updateBody.items = validatedItems;

    // Update stock quantities for new items (quotations do not affect stock)
    if (!willRemainQuotation) {
      for (const item of validatedItems) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stockQuantity: -item.stockQuantity } },
          { new: true }
        );
      }
    }
  }

  console.log('Updating invoice:', invoiceId);
  console.log('Update fields:', Object.keys(updateBody));
  
  Object.assign(invoice, updateBody);
  invoice.updatedBy = userId;
  
  // Recalculate totals only if items were updated
  if (updateBody.items) {
    invoice.calculateTotals();
  }

  if (invoice.type === 'cash') {
    invoice.paidAmount = invoice.total;
    invoice.balance = 0;
    invoice.status = 'paid';
  }

  await invoice.save();
  console.log('Invoice updated successfully');
  await syncInvoiceCashAndWalletEntries(invoice, originalPaymentMethod, originalWalletType, originalPaidAmount);
  postInvoiceToAccounts(invoice);

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
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stockQuantity: Number(item.stockQuantity || item.quantity || 0) } },
        { new: true }
      );
    }
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

  await cashBookService.deleteEntriesByReference(invoice._id, 'Invoice');
  await walletEntryService.deleteEntriesByReference(invoice._id, 'Invoice');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: invoice.organizationId, branchId: invoice.branchId },
      'Invoice',
      invoice._id
    )
    .catch(() => {});

  // Reverse wallet balance if invoice was paid via wallet
  if (invoice.paymentMethod === 'wallet' && invoice.walletType && Number(invoice.paidAmount || 0) > 0) {
    try {
      await walletService.adjustWalletBalance({
        organizationId: invoice.organizationId,
        branchId: invoice.branchId,
        type: invoice.walletType.trim(),
        amount: Number(invoice.paidAmount),
        operation: 'deduct',
        userId: invoice.updatedBy || invoice.createdBy,
      });
    } catch (err) {
      console.error('Failed to reverse wallet balance on invoice delete:', err);
    }
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
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Product not found for item ${item.name}`);
    }
    const stockQty = getStockQuantityFromItem(item);
    if (product.stockQuantity < stockQty) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Insufficient stock for ${product.name}. Available: ${product.stockQuantity}, Required: ${stockQty}`,
      );
    }
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
  await syncInvoiceCashAndWalletEntries(invoice, 'cash', '', 0);
  postInvoiceToAccounts(invoice);

  for (const item of invoice.items) {
    const stockQty = getStockQuantityFromItem(item);
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { stockQuantity: -stockQty } },
      { new: true },
    );
  }

  if (invoice.customerId && invoice.customerId !== 'walk-in') {
    try {
      const ledgerPaymentMethod = resolveInvoiceLedgerPaymentMethod(invoice);
      const customer = await Customer.findById(invoice.customerId).select('balance organizationId branchId createdAt');
      const hasExistingLedger = await CustomerLedger.exists({ customer: invoice.customerId });

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
  getCustomerProductHistory,
  convertQuotationToInvoice,
};
