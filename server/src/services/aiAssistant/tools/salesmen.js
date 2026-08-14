const salesmanProfileService = require('../../salesmanProfile.service');
const salesmanCommissionLedgerService = require('../../salesmanCommissionLedger.service');
const { buildFilter } = require('./shared');

async function getSalesmanCommissionsSummary(args, ctx) {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
  const profiles = await salesmanProfileService.getAllSalesmanProfiles(buildFilter(ctx));

  const balances = await Promise.all(
    profiles.map(async (p) => ({
      name: p.userId?.name || 'Unknown',
      balance: await salesmanCommissionLedgerService.getCurrentBalance(p.userId?._id || p.userId, ctx.organizationId),
    })),
  );

  const owed = balances.filter((b) => (b.balance || 0) > 0).sort((a, b) => b.balance - a.balance);

  return {
    totalPayable: owed.reduce((s, b) => s + b.balance, 0),
    salesmanCount: owed.length,
    salesmen: owed.slice(0, limit),
  };
}

const declarations = [
  {
    name: 'get_salesman_commissions_summary',
    description:
      'List salesmen and how much commission the business currently owes each of them, sorted highest first. Use for "salesman commission payable", "how much do I owe my salesmen".',
    permission: 'viewCommissionLedger',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'number', description: 'Max salesmen to return, default 10' } },
    },
    handler: getSalesmanCommissionsSummary,
  },
];

module.exports = { declarations };
