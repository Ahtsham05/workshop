const installmentService = require('../../installment.service');
const { buildFilter } = require('./shared');

async function getInstallmentsSummary(args, ctx) {
  return installmentService.getInstallmentSummary(buildFilter(ctx));
}

const declarations = [
  {
    name: 'get_installments_summary',
    description:
      'Get installment plan counts and outstanding amounts broken down by status (active, completed, defaulted, cancelled), plus how many are currently overdue and total collected. Use for "installment plans", "overdue installments", "how much is outstanding on installments".',
    permission: 'viewInstallments',
    parameters: { type: 'object', properties: {} },
    handler: getInstallmentsSummary,
  },
];

module.exports = { declarations };
