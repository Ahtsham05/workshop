/**
 * Backfill student portal logins for existing students.
 *
 * For every student it:
 *   1. Ensures a numeric studentUserId (100001, 100002 …)
 *   2. Creates / refreshes a portal login account:
 *        Login ID : studentUserId
 *        Password : guardian phone number (digits only)
 *        Role     : student (sees only their own record)
 *
 * Run from the server directory:
 *   node src/scripts/backfill-student-user-ids.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URL || process.env.MONGO_URI;

async function run() {
  if (!MONGO_URI) {
    console.error('Missing MONGODB_URL (or MONGO_URI) in .env');
    process.exit(1);
  }

  console.log('Connecting to MongoDB…');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const { Student } = require('../models');
  const { createStudentPortalUser, ensureStudentUserId } = require('../services/student.service');

  const students = await Student.find({});
  console.log(`Processing ${students.length} student(s)…`);

  let idsAssigned = 0;
  let accountsReady = 0;
  let skippedNoPhone = 0;

  for (const student of students) {
    if (!student.studentUserId) {
      await ensureStudentUserId(student._id, {
        organizationId: student.organizationId,
        branchId: student.branchId,
      });
      idsAssigned += 1;
    }

    if (!student.parent?.phone) {
      skippedNoPhone += 1;
      continue;
    }

    // Re-fetch so the freshly assigned studentUserId is present
    const fresh = await Student.findById(student._id);
    const account = await createStudentPortalUser(fresh);
    if (account) accountsReady += 1;
  }

  console.log('─────────────────────────────────────────────');
  console.log(`User IDs newly assigned : ${idsAssigned}`);
  console.log(`Portal accounts ready   : ${accountsReady}`);
  console.log(`Skipped (no phone)      : ${skippedNoPhone}`);
  console.log('─────────────────────────────────────────────');
  console.log('Students log in with their User ID and guardian phone number.');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
