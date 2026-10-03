/**
 * One-off migration: legacy single-tenant "asim" database -> a new "Asim Weaving"
 * organization in the multi-tenant app database.
 *
 *   SRC_MONGODB_URL=<legacy uri> node scripts/migrate-asim-to-org.js            # dry run (default, writes nothing)
 *   SRC_MONGODB_URL=<legacy uri> node scripts/migrate-asim-to-org.js --apply    # perform the migration
 *   node scripts/migrate-asim-to-org.js --rollback <organizationId>             # remove everything it created
 *
 * Target = MONGODB_URL from server/.env. The source is only ever read.
 *
 * Design:
 *  - Source _ids are preserved, so every cross-reference (invoice->customer/product, ledger->party,
 *    purchase->supplier/product) stays valid without remapping.
 *  - Documents are inserted straight into the collections (no service layer), so nothing is
 *    double-posted to ledgers / cash book / stock. Every doc is validated against the real
 *    Mongoose model first and must not be mutated by its validation hooks.
 *  - Everything is scoped by organizationId, which is what makes --rollback exact.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const models = require('../src/models');
const planService = require('../src/services/billing/plan.service');
const { addDays, legacyMirror } = require('../src/services/billing/subscriptionState');

const ORG_NAME = 'Asim Weaving';
const OWNER_EMAIL = 'asim@gmail.com';
const { Organization, Branch, Membership, User, Role, Product, Customer, Supplier, Invoice, Purchase, CustomerLedger, SupplierLedger } = models;

// Rollback order does not matter (all deleted by organizationId).
const SCOPED = [Product, Customer, Supplier, Invoice, Purchase, CustomerLedger, SupplierLedger, Membership, Branch];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const rollbackIdx = args.indexOf('--rollback');

const oid = (v) => (v ? new mongoose.Types.ObjectId(String(v)) : undefined);
const strip = (src) => {
  const { __v, ...rest } = src;
  Object.keys(rest).forEach((k) => rest[k] === null && delete rest[k]);
  return rest;
};

const rollback = async (orgIdStr) => {
  const organizationId = oid(orgIdStr);
  const org = await Organization.findById(organizationId).lean();
  if (!org || org.name !== ORG_NAME) throw new Error(`Refusing: ${orgIdStr} is not the "${ORG_NAME}" organization`);
  for (const M of SCOPED) {
    const r = await M.collection.deleteMany({ organizationId });
    console.log(`  deleted ${r.deletedCount} from ${M.collection.name}`);
  }
  await User.collection.deleteMany({ organizationId, email: OWNER_EMAIL });
  await Organization.collection.deleteOne({ _id: organizationId });
  console.log('Rollback complete.');
};

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log(`Target DB: ${mongoose.connection.name} | mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  if (rollbackIdx !== -1) return rollback(args[rollbackIdx + 1]);

  if (!process.env.SRC_MONGODB_URL) throw new Error('SRC_MONGODB_URL is required');
  const srcConn = await mongoose.createConnection(process.env.SRC_MONGODB_URL).asPromise();
  const src = (n) => srcConn.db.collection(n).find({}).toArray();

  // ---------- pre-flight guards ----------
  if (await Organization.findOne({ name: ORG_NAME })) throw new Error(`Organization "${ORG_NAME}" already exists - roll it back first`);
  if (await User.findOne({ email: OWNER_EMAIL })) throw new Error(`User ${OWNER_EMAIL} already exists in target`);
  const adminRole = await Role.findOne({ name: 'Admin', isSystemRole: true });
  if (!adminRole) throw new Error('System Admin role not found in target');

  const [sUsers, sCompanies, sProducts, sCustomers, sSuppliers, sInvoices, sPurchases, sCL, sSL] = await Promise.all(
    ['users', 'companies', 'products', 'customers', 'suppliers', 'invoices', 'purchases', 'customerledgers', 'supplierledgers'].map(src)
  );
  if (sUsers.length !== 1) throw new Error(`Expected exactly 1 source user, found ${sUsers.length}`);
  const sUser = sUsers[0];
  const company = sCompanies[0] || {};

  // Pre-generated ids so every doc can reference org/branch/user before anything is written.
  const organizationId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  const userId = sUser._id;
  const scope = { organizationId, branchId };

  // _id collision check against the live target (ObjectIds are globally unique, but verify).
  const collisions = [];
  for (const [M, rows] of [[Product, sProducts], [Customer, sCustomers], [Supplier, sSuppliers], [Invoice, sInvoices], [Purchase, sPurchases], [CustomerLedger, sCL], [SupplierLedger, sSL], [User, sUsers]]) {
    const n = await M.collection.countDocuments({ _id: { $in: rows.map((r) => r._id) } });
    if (n) collisions.push(`${M.collection.name}: ${n}`);
  }
  if (collisions.length) throw new Error(`_id collisions in target: ${collisions.join(', ')}`);

  // ---------- transforms ----------
  const report = { quarantined: {}, notes: [], validationErrors: [] };
  const quarantine = (key, row, why) => {
    (report.quarantined[key] = report.quarantined[key] || []).push({ why, row });
  };

  const seenSku = new Set();
  let skuCleared = 0;
  const products = sProducts.map((p) => {
    const d = { ...strip(p), ...scope, createdBy: userId, schemaVersion: 1, categories: [] };
    delete d.category;
    if (d.sku) {
      if (seenSku.has(d.sku)) { delete d.sku; skuCleared++; } else seenSku.add(d.sku);
    }
    return d;
  });
  if (skuCleared) report.notes.push(`${skuCleared} products had a duplicate SKU (e.g. placeholder "SKU001"); SKU kept on first product only, cleared on the rest (target enforces unique SKU per branch).`);

  const customers = sCustomers.map((c) => ({ ...strip(c), ...scope, createdBy: userId }));
  const suppliers = sSuppliers.map((s) => ({ ...strip(s), ...scope, createdBy: userId }));
  const customerIds = new Set(sCustomers.map((c) => String(c._id)));
  const supplierIds = new Set(sSuppliers.map((s) => String(s._id)));

  // Legacy invoices are all status "draft", but in the current app draft = unposted/not a sale.
  // They are real credit sales (each has a matching 'sale' ledger row), so map to the status the
  // app itself would assign: paid when nothing is owed, otherwise finalized.
  const invoices = sInvoices.map((i) => ({
    ...strip(i), ...scope, createdBy: userId, updatedBy: userId,
    status: (i.balance || 0) <= 0 ? 'paid' : 'finalized',
  }));
  report.notes.push(`${invoices.length} invoices: legacy status "draft" mapped to paid/finalized by balance.`);

  const purchases = sPurchases.map((p) => {
    const credit = (p.balance || 0) > 0;
    return { ...strip(p), ...scope, createdBy: userId, type: credit ? 'credit' : 'cash', paymentMethod: 'cash', paymentType: credit ? 'Credit' : 'Cash' };
  });

  const customerLedgers = [];
  sCL.forEach((l) => {
    if (!customerIds.has(String(l.customer))) return quarantine('customerledgers', l, 'customer no longer exists');
    const d = { ...strip(l), ...scope };
    if (d.paymentMethod === '') delete d.paymentMethod;
    customerLedgers.push(d);
  });
  const supplierLedgers = [];
  sSL.forEach((l) => {
    if (!supplierIds.has(String(l.supplier))) return quarantine('supplierledgers', l, 'supplier no longer exists');
    const d = { ...strip(l), ...scope };
    if (d.paymentMethod === '') delete d.paymentMethod;
    supplierLedgers.push(d);
  });

  // ---------- validate every doc against the real models ----------
  const prepared = {};
  const prepare = async (key, M, docs) => {
    const out = [];
    for (const d of docs) {
      const doc = new M(d);
      try {
        await doc.validate();
      } catch (e) {
        report.validationErrors.push(`${key} ${d._id}: ${e.message}`);
        continue;
      }
      const obj = doc.toObject({ depopulate: true });
      for (const f of ['total', 'balance', 'paidAmount', 'totalAmount', 'price', 'cost', 'stockQuantity', 'debit', 'credit']) {
        if (d[f] !== undefined && obj[f] !== d[f]) report.validationErrors.push(`${key} ${d._id}: validation hooks changed ${f} (${d[f]} -> ${obj[f]})`);
      }
      out.push(obj);
    }
    prepared[key] = { M, docs: out };
  };
  await prepare('products', Product, products);
  await prepare('customers', Customer, customers);
  await prepare('suppliers', Supplier, suppliers);
  await prepare('invoices', Invoice, invoices);
  await prepare('purchases', Purchase, purchases);
  await prepare('customerledgers', CustomerLedger, customerLedgers);
  await prepare('supplierledgers', SupplierLedger, supplierLedgers);

  // ---------- summary ----------
  console.log('\nPlanned inserts:');
  Object.entries(prepared).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v.docs.length}`));
  Object.entries(report.quarantined).forEach(([k, v]) => console.log(`  quarantined ${k}: ${v.length} (${v[0].why})`));
  report.notes.forEach((n) => console.log(`  note: ${n}`));
  if (report.validationErrors.length) {
    console.log(`\n${report.validationErrors.length} validation error(s):`);
    report.validationErrors.slice(0, 20).forEach((e) => console.log('  ' + e));
  }

  const reportPath = path.join(__dirname, '../asim-migration-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport (incl. quarantined rows) written to ${reportPath}`);

  if (!APPLY) { console.log('\nDRY RUN - nothing written. Re-run with --apply.'); return srcConn.close(); }
  if (report.validationErrors.length) throw new Error('Refusing to apply with validation errors');

  // ---------- apply ----------
  const now = new Date();
  const trialPlan = await planService.getPlan('trial');
  const trialEnd = addDays(now, trialPlan?.trialDays ?? 14);
  try {
    await User.collection.insertOne(new User({
      _id: userId, name: sUser.name, email: sUser.email, password: sUser.password,
      isEmailVerified: true, isActive: true, role: adminRole._id, organizationId,
      businessType: 'wholesale_retail', systemRole: 'superAdmin', onboardingComplete: true,
      createdAt: sUser.createdAt,
    }).toObject());
    await Organization.collection.insertOne(new Organization({
      _id: organizationId, name: ORG_NAME, businessType: 'wholesale_retail', owner: userId,
      email: company.email, phone: company.phone, address: company.address, city: company.city, country: company.country,
      subscription: {
        planType: 'trial', status: 'trialing', paymentSource: null,
        currentPeriodStart: now, currentPeriodEnd: trialEnd, statusChangedAt: now,
        ...legacyMirror('trial', trialPlan, now, trialEnd, 'trialing'),
      },
      createdAt: now, updatedAt: now,
    }).toObject());
    await Branch.collection.insertOne(new Branch({
      _id: branchId, organizationId, name: `${ORG_NAME} - Main Branch`,
      location: { address: company.address, city: company.city, country: company.country },
      phone: company.phone, email: company.email, isDefault: true, isActive: true,
    }).toObject());
    await Membership.collection.insertOne(new Membership({ userId, organizationId, branchId, role: 'superAdmin', isActive: true }).toObject());
    for (const [key, { M, docs }] of Object.entries(prepared)) {
      for (let i = 0; i < docs.length; i += 500) await M.collection.insertMany(docs.slice(i, i + 500), { ordered: true });
      console.log(`  inserted ${docs.length} ${key}`);
    }
  } catch (e) {
    console.error('FAILED mid-way, rolling back:', e.message);
    await rollback(String(organizationId));
    throw e;
  }
  console.log(`\nDONE. organizationId=${organizationId} branchId=${branchId} userId=${userId}`);
  await srcConn.close();
};

main().then(() => mongoose.disconnect()).catch(async (e) => { console.error('ERROR:', e.message); await mongoose.disconnect(); process.exit(1); });
