/**
 * Bank transfer details for manual payment.
 * Update these values to match your actual business bank account.
 */
const BANK_DETAILS = {
  bankName: 'HBL (Habib Bank Limited)',
  accountTitle: 'Logix Plus Solutions (Pvt) Ltd',
  accountNumber: '01234567890123',
  iban: 'PK36HABB0000001234567890',
  swiftCode: 'HABBPKKA',
  branch: 'Main Branch, Karachi',
  instructions: [
    'Transfer the exact plan amount to the bank account above.',
    'Use your Organization name as the payment reference.',
    'Take a screenshot of the payment confirmation.',
    'Fill in the payment form with your Transaction ID and upload the screenshot.',
    'Your subscription will be activated within 24 business hours after verification.',
  ],
};

module.exports = BANK_DETAILS;
