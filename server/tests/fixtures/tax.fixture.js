const mongoose = require('mongoose');
const {
  Organization,
  Branch,
  Product,
  Customer,
  TaxCategory,
  TaxRate,
  TaxJurisdiction,
  TaxExemption,
} = require('../../src/models');

/**
 * Plain Mongoose-model fixtures for tax-engine tests — deliberately NOT HTTP/supertest
 * fixtures (no Role/JWT/auth needed): every test in this suite calls services directly
 * (taxCalculator.service.js, or higher-level services like purchaseOrder.service.js),
 * bypassing Express entirely. See tests/README-style comment in
 * taxCalculator.service.test.js for why.
 */

const insertOrganization = async (overrides = {}) =>
  Organization.create({
    name: 'Test Org',
    owner: new mongoose.Types.ObjectId(),
    taxSystem: 'NONE',
    baseCurrency: 'PKR',
    ...overrides,
  });

const insertBranch = async (organizationId, overrides = {}) =>
  Branch.create({
    organizationId,
    name: 'Main Branch',
    ...overrides,
  });

const insertProduct = async (organizationId, branchId, overrides = {}) =>
  Product.create({
    organizationId,
    branchId,
    name: 'Test Product',
    price: 100,
    cost: 50,
    stockQuantity: 100,
    ...overrides,
  });

const insertCustomer = async (organizationId, branchId, overrides = {}) =>
  Customer.create({
    organizationId,
    branchId,
    name: 'Test Customer',
    ...overrides,
  });

const insertTaxCategory = async (organizationId, overrides = {}) =>
  TaxCategory.create({
    organizationId,
    name: 'Standard',
    isDefault: false,
    status: 'active',
    ...overrides,
  });

const insertTaxRate = async (organizationId, taxCategoryId, overrides = {}) =>
  TaxRate.create({
    organizationId,
    taxCategoryId,
    name: 'Standard Rate',
    rateType: 'PERCENTAGE',
    rate: 20,
    isCompound: false,
    priority: 0,
    effectiveFrom: new Date('2020-01-01'),
    status: 'active',
    ...overrides,
  });

const insertTaxJurisdiction = async (organizationId, overrides = {}) =>
  TaxJurisdiction.create({
    organizationId,
    name: 'Test Jurisdiction',
    level: 'STATE',
    status: 'active',
    ...overrides,
  });

const insertTaxExemption = async (organizationId, customerId, overrides = {}) =>
  TaxExemption.create({
    organizationId,
    customerId,
    status: 'active',
    validFrom: new Date('2020-01-01'),
    ...overrides,
  });

/** Sets a TaxCategory as an org's default and mirrors the denormalized pointer, exactly
 * matching what taxCategory.service.js does on a real create/update — needed since these
 * tests call the model directly rather than going through that service. */
const setDefaultTaxCategory = async (organizationId, taxCategoryId) => {
  await TaxCategory.updateOne({ _id: taxCategoryId }, { isDefault: true });
  await Organization.updateOne({ _id: organizationId }, { defaultTaxCategoryId: taxCategoryId });
};

module.exports = {
  insertOrganization,
  insertBranch,
  insertProduct,
  insertCustomer,
  insertTaxCategory,
  insertTaxRate,
  insertTaxJurisdiction,
  insertTaxExemption,
  setDefaultTaxCategory,
};
