const { Wallet } = require('../../../models');
const walletService = require('../../wallet.service');
const { buildFilter } = require('./shared');

async function getCashAndBankSummary(args, ctx) {
  const [accounts, cashInHand] = await Promise.all([
    Wallet.find({ ...buildFilter(ctx), isActive: { $ne: false }, accountType: { $ne: 'cash' } }),
    walletService.resolveCashInHandBalance(ctx.organizationId, ctx.branchId),
  ]);

  const bankAccountsTotal = accounts.reduce((s, a) => s + (a.balance || 0), 0);

  return {
    cashInHand,
    bankAccountsTotal,
    grandTotal: cashInHand + bankAccountsTotal,
    accounts: accounts.map((a) => ({ name: a.type, type: a.accountType, bankName: a.bankName, balance: a.balance })),
  };
}

const declarations = [
  {
    name: 'get_cash_and_bank_summary',
    description:
      'Get current cash-in-hand balance plus every bank/mobile-wallet account balance and their total. Use for "how much cash do I have", "bank balance", "cash and bank position".',
    permission: 'viewCashBook',
    parameters: { type: 'object', properties: {} },
    handler: getCashAndBankSummary,
  },
];

module.exports = { declarations };
