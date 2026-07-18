const { Customer, Supplier, Student } = require('../models');
const { normalizePhone } = require('./whatsappPhone');

/**
 * Batched phone -> saved-contact-name lookup, matching the last 10 digits against
 * Customer/Supplier (phone or whatsapp) and Student.parent.phone — the recipients SMS/
 * WhatsApp sends actually target. Used so message logs show the name the business saved
 * for a contact, rather than whatever the contact set as their own WhatsApp display name.
 */
async function resolveContactNamesByPhone(organizationId, branchId, phones) {
  const last10s = [...new Set(phones.map((p) => normalizePhone(p)?.slice(-10)).filter(Boolean))];
  const map = new Map();
  if (!last10s.length) return map;

  const patterns = last10s.map((digits) => new RegExp(`${digits}$`));
  const scope = { organizationId };
  if (branchId) scope.branchId = branchId;

  const [customers, suppliers, students] = await Promise.all([
    Customer.find({ ...scope, $or: [{ phone: { $in: patterns } }, { whatsapp: { $in: patterns } }] })
      .select('name phone whatsapp')
      .lean(),
    Supplier.find({ ...scope, $or: [{ phone: { $in: patterns } }, { whatsapp: { $in: patterns } }] })
      .select('name phone whatsapp')
      .lean(),
    Student.find({ ...scope, 'parent.phone': { $in: patterns } })
      .select('parent.fatherName parent.motherName parent.guardianName parent.phone')
      .lean(),
  ]);

  for (const c of customers) {
    const key = normalizePhone(c.phone)?.slice(-10) || normalizePhone(c.whatsapp)?.slice(-10);
    if (key && !map.has(key)) map.set(key, c.name);
  }
  for (const s of suppliers) {
    const key = normalizePhone(s.phone)?.slice(-10) || normalizePhone(s.whatsapp)?.slice(-10);
    if (key && !map.has(key)) map.set(key, s.name);
  }
  for (const s of students) {
    const key = normalizePhone(s.parent?.phone)?.slice(-10);
    const name = s.parent?.fatherName || s.parent?.motherName || s.parent?.guardianName;
    if (key && name && !map.has(key)) map.set(key, name);
  }

  return map;
}

module.exports = { resolveContactNamesByPhone };
