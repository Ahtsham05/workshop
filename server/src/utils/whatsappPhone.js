function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    digits = `92${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    digits = `92${digits}`;
  }
  return digits || null;
}

function formatDisplayPhone(phone) {
  const digits = normalizePhone(phone);
  if (!digits) return phone || '';
  return `+${digits}`;
}

module.exports = { normalizePhone, formatDisplayPhone };
