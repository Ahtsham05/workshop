/**
 * Run `task` only after every earlier task queued under the same key has settled.
 *
 * In-process only (one Node instance) — enough to stop a double-submitted edit from
 * running two delete-then-recreate syncs over each other, which is how a Cash Management
 * record ended up with every one of its Cash Book lines written twice.
 */
const tails = new Map();

const withKeyedLock = async (key, task) => {
  const lockKey = String(key);
  const previous = tails.get(lockKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  tails.set(lockKey, tail);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (tails.get(lockKey) === tail) tails.delete(lockKey);
  }
};

module.exports = { withKeyedLock };
