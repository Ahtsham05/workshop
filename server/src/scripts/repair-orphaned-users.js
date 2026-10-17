/**
 * Find and relink user accounts whose organizationId points at an organization that no
 * longer exists.
 *
 * Nothing in the app produces these — deleting an organization sets its users'
 * organizationId to null (organization.service.js#deleteOrganization) and the users API
 * cannot change organizationId. They come from outside the app: a database copy/merge or a
 * manual move that relinked the owner to a new organization but left staff behind.
 *
 * Such an account can still sign in, but everything is scoped by organizationId, so it sees
 * no branches, no data and — the visible symptom — a private one-person "All branches" team
 * chat that nobody else ever reads. The admin cannot see the account in Users either, and
 * re-adding it fails with "Email already taken".
 *
 * Usage:
 *   node src/scripts/repair-orphaned-users.js
 *       Report only: every orphaned account, the organization its role belongs to (the
 *       strongest hint where it really belongs), that organization's branches, and any
 *       chat threads left behind on missing organizations.
 *
 *   node src/scripts/repair-orphaned-users.js --user=<email|id> --org=<orgId> --branch=<branchId>
 *       Dry run of one relink: prints exactly what would change.
 *
 *   ... same flags plus --apply
 *       Relinks the account: organizationId + businessType, an active staff Membership on
 *       the branch, and its messages from the dead "All branches" thread moved into the real
 *       one (in time order). Dead chat threads are removed once no account still points at
 *       that missing organization. The person should sign out and back in afterwards.
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const { User, Organization, Branch, Membership, Role, ChatConversation, ChatMessage, ChatReadState } = require('../models');
const { normalizeBusinessType } = require('../config/businessTypes');

const flag = (name) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : null;
};
const apply = process.argv.includes('--apply');
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v)) && String(v).length === 24;

async function findOrphans() {
  return User.aggregate([
    { $match: { organizationId: { $type: 'objectId' } } },
    { $lookup: { from: 'organizations', localField: 'organizationId', foreignField: '_id', as: 'org' } },
    { $match: { org: { $size: 0 } } },
    { $project: { name: 1, email: 1, systemRole: 1, role: 1, organizationId: 1, isActive: 1, createdAt: 1 } },
    { $sort: { organizationId: 1, createdAt: 1 } },
  ]);
}

async function report() {
  const orphans = await findOrphans();
  if (!orphans.length) {
    console.log('No orphaned accounts: every user points at an organization that exists.');
  } else {
    console.log(`${orphans.length} account(s) point at an organization that no longer exists:\n`);
  }
  for (const u of orphans) {
    const role = u.role ? await Role.findById(u.role).select('name organizationId').lean() : null;
    const hintOrg = role?.organizationId ? await Organization.findById(role.organizationId).select('name').lean() : null;
    console.log(`• ${u.name} <${u.email}>  id=${u._id}  systemRole=${u.systemRole || '-'}  active=${u.isActive !== false}`);
    console.log(`    missing organization: ${u.organizationId}`);
    if (hintOrg) {
      const branches = await Branch.find({ organizationId: hintOrg._id }).select('name isDefault').lean();
      console.log(`    role "${role.name}" belongs to: ${hintOrg.name}  org=${hintOrg._id}`);
      branches.forEach((b) => console.log(`      branch ${b._id}  ${b.name}${b.isDefault ? '  (default)' : ''}`));
      const suggested = branches.find((b) => b.isDefault) || branches[0];
      if (suggested) {
        console.log(
          `    → node src/scripts/repair-orphaned-users.js --user=${u.email} --org=${hintOrg._id} --branch=${suggested._id}`
        );
      }
    } else {
      console.log('    no hint from the role — pick the organization and branch by hand');
    }
    console.log('');
  }

  const deadThreads = await ChatConversation.aggregate([
    { $lookup: { from: 'organizations', localField: 'organizationId', foreignField: '_id', as: 'org' } },
    { $match: { org: { $size: 0 } } },
    { $project: { type: 1, name: 1, organizationId: 1, messageCount: 1 } },
  ]);
  if (deadThreads.length) {
    console.log(`${deadThreads.length} chat thread(s) belong to missing organizations:`);
    deadThreads.forEach((c) => console.log(`  ${c._id}  ${c.type} "${c.name}"  org=${c.organizationId}  messages=${c.messageCount}`));
  }
}

async function relink(userRef, orgId, branchId) {
  if (!isId(orgId) || !isId(branchId)) throw new Error('--org and --branch must be ids');
  const user = await User.findOne(isId(userRef) ? { _id: userRef } : { email: String(userRef).toLowerCase() });
  if (!user) throw new Error(`No user ${userRef}`);
  if (user.organizationId && (await Organization.exists({ _id: user.organizationId }))) {
    throw new Error(`${user.email} already belongs to an existing organization (${user.organizationId}) — refusing to move it`);
  }
  const org = await Organization.findById(orgId).select('name businessType').lean();
  if (!org) throw new Error(`Organization ${orgId} does not exist`);
  const branch = await Branch.findOne({ _id: branchId, organizationId: org._id }).select('name').lean();
  if (!branch) throw new Error(`Branch ${branchId} is not in ${org.name}`);
  if (user.role) {
    const role = await Role.findById(user.role).select('name organizationId').lean();
    if (role?.organizationId && String(role.organizationId) !== String(org._id)) {
      console.warn(`! Warning: role "${role.name}" belongs to organization ${role.organizationId}, not ${org.name}. Fix the role in Users after relinking.`);
    }
  }

  const deadOrgId = user.organizationId;
  const deadThreads = deadOrgId ? await ChatConversation.find({ organizationId: deadOrgId }).select('_id type name').lean() : [];
  const deadOrgThread = deadThreads.find((c) => c.type === 'organization');
  const strayMessages = deadOrgThread
    ? await ChatMessage.countDocuments({ conversationId: deadOrgThread._id, senderId: user._id, kind: { $ne: 'system' } })
    : 0;
  const othersStillOnDeadOrg = deadOrgId ? await User.countDocuments({ organizationId: deadOrgId, _id: { $ne: user._id } }) : 0;
  const membership = await Membership.findOne({ userId: user._id, branchId: branch._id }).lean();

  console.log(`${apply ? 'APPLYING' : 'DRY RUN'} — relink ${user.name} <${user.email}>`);
  console.log(`  organization: ${deadOrgId || 'none'} (missing) → ${org.name} ${org._id}`);
  console.log(`  branch: ${membership?.isActive ? 'already a member of' : 'add as staff of'} ${branch.name}`);
  console.log(`  chat: move ${strayMessages} message(s) from the dead "All branches" into ${org.name}'s`);
  console.log(
    othersStillOnDeadOrg
      ? `  chat: keep the dead threads — ${othersStillOnDeadOrg} other account(s) still point at ${deadOrgId}`
      : `  chat: delete ${deadThreads.length} dead thread(s) of ${deadOrgId}`
  );
  if (!apply) {
    console.log('\nNothing written. Re-run with --apply to make these changes.');
    return;
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { organizationId: org._id, businessType: normalizeBusinessType(org.businessType), onboardingComplete: true } }
  );
  await Membership.updateOne(
    { userId: user._id, branchId: branch._id },
    { $set: { organizationId: org._id, isActive: true }, $setOnInsert: { role: 'staff' } },
    { upsert: true }
  );

  if (strayMessages) {
    const live = await ChatConversation.findOneAndUpdate(
      { organizationId: org._id, type: 'organization', branchId: null },
      { $setOnInsert: { organizationId: org._id, type: 'organization', branchId: null, name: 'All branches' } },
      { upsert: true, new: true }
    );
    await ChatMessage.updateMany(
      { conversationId: deadOrgThread._id, senderId: user._id, kind: { $ne: 'system' } },
      { $set: { conversationId: live._id, organizationId: org._id } }
    );
    // The moved messages may now be the thread's newest — refresh its preview and count.
    const [newest, count] = await Promise.all([
      ChatMessage.findOne({ conversationId: live._id, deletedAt: null }).sort({ createdAt: -1 }).lean(),
      ChatMessage.countDocuments({ conversationId: live._id }),
    ]);
    if (newest) {
      await ChatConversation.updateOne(
        { _id: live._id },
        {
          $set: {
            lastMessage: {
              text: String(newest.text || '').slice(0, 160),
              kind: newest.kind,
              senderId: newest.senderId,
              senderName: newest.senderName,
              at: newest.createdAt,
            },
            lastMessageAt: newest.createdAt,
            messageCount: count,
          },
        }
      );
    }
  }

  if (!othersStillOnDeadOrg && deadThreads.length) {
    const ids = deadThreads.map((c) => c._id);
    await Promise.all([
      ChatMessage.deleteMany({ conversationId: { $in: ids } }),
      ChatReadState.deleteMany({ conversationId: { $in: ids } }),
      ChatConversation.deleteMany({ _id: { $in: ids } }),
    ]);
  }
  console.log('\nDone. Ask the person to sign out and sign back in.');
}

async function run() {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  try {
    const userRef = flag('user');
    if (userRef) await relink(userRef, flag('org'), flag('branch'));
    else await report();
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
