/**
 * Bank transfer details for manual payment.
 * Update these values to match your actual business bank account.
 */
const BANK_DETAILS = {
  bankName: 'ABL (Allied Bank Limited)',
  accountTitle: 'Ahtsham Ali',
  accountNumber: '06650010102824970014',
  iban: 'PK90ABPA0010102824970014',
  swiftCode: 'ABPAPKKA',
  branch: 'Main Branch, Faisalabad',
  instructions: [
    'Transfer the exact plan amount to the bank account above.',
    'Use your Organization name as the payment reference.',
    'Take a screenshot of the payment confirmation.',
    'Fill in the payment form with your Transaction ID and upload the screenshot.',
    'Your subscription will be activated within 24 business hours after verification.',
  ],
};

module.exports = BANK_DETAILS;
