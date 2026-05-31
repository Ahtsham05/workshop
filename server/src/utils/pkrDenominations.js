const PKR_DENOMINATIONS = [
  { value: 10, kind: 'note', label: 'Rs 10' },
  { value: 20, kind: 'note', label: 'Rs 20' },
  { value: 50, kind: 'note', label: 'Rs 50' },
  { value: 100, kind: 'note', label: 'Rs 100' },
  { value: 500, kind: 'note', label: 'Rs 500' },
  { value: 1000, kind: 'note', label: 'Rs 1,000' },
  { value: 5000, kind: 'note', label: 'Rs 5,000' },
  { value: 1, kind: 'coin', label: 'Rs 1 coin' },
  { value: 2, kind: 'coin', label: 'Rs 2 coin' },
  { value: 5, kind: 'coin', label: 'Rs 5 coin' },
  { value: 10, kind: 'coin', label: 'Rs 10 coin' },
];

const denominationKey = (value, kind) => `${kind}:${value}`;

const computeTotalFromCounts = (counts = []) =>
  counts.reduce((sum, row) => sum + Number(row.value || 0) * Number(row.quantity || 0), 0);

const normalizeCounts = (counts = []) => {
  const map = new Map();
  counts.forEach((row) => {
    const value = Number(row.value);
    const kind = row.kind === 'coin' ? 'coin' : 'note';
    const quantity = Math.max(0, Math.floor(Number(row.quantity || 0)));
    if (!Number.isFinite(value) || value <= 0) return;
    const key = denominationKey(value, kind);
    map.set(key, { value, kind, quantity });
  });

  return PKR_DENOMINATIONS.map((denom) => {
    const key = denominationKey(denom.value, denom.kind);
    const existing = map.get(key);
    return {
      value: denom.value,
      kind: denom.kind,
      quantity: existing ? existing.quantity : 0,
    };
  });
};

module.exports = {
  PKR_DENOMINATIONS,
  denominationKey,
  computeTotalFromCounts,
  normalizeCounts,
};
