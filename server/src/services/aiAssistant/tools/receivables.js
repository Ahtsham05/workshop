const customerLedgerService = require('../../customerLedger.service');
const supplierLedgerService = require('../../supplierLedger.service');
const { buildFilter } = require('./shared');

async function getUnpaidCustomers(args, ctx) {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const customers = await customerLedgerService.getAllCustomersWithBalances(buildFilter(ctx));
  const unpaid = customers.filter((c) => (c.balance || 0) > 0).sort((a, b) => b.balance - a.balance);

  return {
    totalOutstanding: unpaid.reduce((s, c) => s + c.balance, 0),
    customerCount: unpaid.length,
    customers: unpaid.slice(0, limit).map((c) => ({
      name: c.name,
      phone: c.phone,
      balance: c.balance,
      lastTransactionDate: c.lastTransactionDate,
    })),
  };
}

async function getPayablesToSuppliers(args, ctx) {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const suppliers = await supplierLedgerService.getAllSuppliersWithBalances(buildFilter(ctx));
  const payable = suppliers.filter((s) => (s.balance || 0) > 0).sort((a, b) => b.balance - a.balance);

  return {
    totalPayable: payable.reduce((s, x) => s + x.balance, 0),
    supplierCount: payable.length,
    suppliers: payable.slice(0, limit).map((s) => ({ name: s.name, phone: s.phone, balance: s.balance })),
  };
}

const declarations = [
  {
    name: 'get_unpaid_customers',
    description:
      'List customers who currently owe the business money (positive ledger balance), sorted by amount owed, descending. Use for "unpaid customers", "who owes me money", "outstanding receivables".',
    permission: 'viewCustomers',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max customers to return, default 10' } },
    },
    handler: getUnpaidCustomers,
  },
  {
    name: 'get_payables_to_suppliers',
    description:
      'List suppliers the business currently owes money to, sorted by amount owed, descending. Use for "who do I owe", "supplier payables".',
    permission: 'viewSuppliers',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max suppliers to return, default 10' } },
    },
    handler: getPayablesToSuppliers,
  },
];

module.exports = { declarations };
