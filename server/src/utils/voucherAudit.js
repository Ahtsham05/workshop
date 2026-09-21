/**
 * How a Payment / Receipt Voucher is written into the audit trail.
 *
 * The trail diffs values by JSON equality and the UI shows each changed field as "before → after",
 * so a voucher is flattened to plain, human-readable values: the bank account by NAME (its id
 * means nothing to a person reading the history) and the lines as one "Party: amount (note)" entry
 * each, joined with "; " (a nested array of line objects would render as a blob on any screen
 * that doesn't special-case it).
 *
 * `partyField` is the line's display-name field: `payeeName` on a payment voucher, `payerName` on a
 * receipt voucher.
 */
const lineText = (line, partyField) =>
  `${line[partyField]}: ${line.amount}${line.description ? ` (${line.description})` : ''}`;

const voucherAuditSnapshot = (voucher, partyField) => ({
  date: voucher.date,
  bankAccountName: voucher.bankAccountName,
  totalAmount: voucher.totalAmount,
  reference: voucher.reference || '',
  notes: voucher.notes || '',
  lines: voucher.lines.map((line) => lineText(line, partyField)).join('; '),
});

/**
 * The fields worth recording when a voucher is first created. A reference/notes that was left
 * blank is not logged at all — otherwise every creation would carry an empty "change".
 */
const voucherCreateAuditFields = (voucher) => [
  'date',
  'bankAccountName',
  'totalAmount',
  'lines',
  ...(voucher.reference ? ['reference'] : []),
  ...(voucher.notes ? ['notes'] : []),
];

module.exports = { voucherAuditSnapshot, voucherCreateAuditFields };
