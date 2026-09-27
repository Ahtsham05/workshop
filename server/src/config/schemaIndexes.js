const crypto = require('crypto');
const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Builds every model's indexes only when the index definitions in the code have changed.
 *
 * Mongoose's default (`autoIndex`) sends a createIndexes command for every model on every
 * new connection — about 450 commands here. On Vercel each cold start is a new connection,
 * so the first requests after one queued behind that flood (measured: +1.2 s at a 40 ms
 * database round trip, much more at real Atlas distances). Connections now open with
 * `autoIndex: false` (see MONGOOSE_CONNECT_OPTIONS) and this runs instead: a fingerprint
 * of all index definitions is compared with the one stored after the last successful build,
 * costing one read when nothing changed. After a deploy that adds or changes an index it
 * builds them exactly as autoIndex would (createIndexes — never drops anything), in the
 * background, and records the new fingerprint.
 */

const META_COLLECTION = 'schema_meta';
const META_ID = 'model-indexes';

/** Connection options that turn off the per-connection index/collection flood. */
const MONGOOSE_CONNECT_OPTIONS = { autoIndex: false, autoCreate: false };

const indexFingerprint = () => {
  const specs = Object.values(mongoose.models)
    .map((model) => [model.collection.collectionName, model.schema.indexes()])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return crypto.createHash('sha256').update(JSON.stringify(specs)).digest('hex');
};

/** A definite answer from the server (it refused the index), as opposed to not reaching it. */
const isServerRejection = (err) => !!err && err.name === 'MongoServerError' && typeof err.code === 'number';

let inFlight = null;

const ensureSchemaIndexes = () => {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const fingerprint = indexFingerprint();
    const meta = mongoose.connection.db.collection(META_COLLECTION);
    const stored = await meta.findOne({ _id: META_ID });
    if (stored && stored.fingerprint === fingerprint) return { built: false };

    const models = Object.values(mongoose.models);
    const failures = [];
    let retryable = false;
    await Promise.all(
      models.map((model) =>
        model.createIndexes().catch((err) => {
          failures.push(model.modelName);
          // The server refusing an index definition (a conflicting or unsupported spec) is
          // permanent — retrying it on every cold start would bring the flood back. Only a
          // failure to reach the server leaves the build unrecorded, to be retried.
          if (!isServerRejection(err)) retryable = true;
          logger.warn(`[schemaIndexes] ${model.modelName}: ${err.message}`);
        })
      )
    );
    if (!retryable) {
      await meta.updateOne(
        { _id: META_ID },
        { $set: { fingerprint, builtAt: new Date(), rejectedModels: failures } },
        { upsert: true }
      );
    }
    logger.info(`[schemaIndexes] Built indexes for ${models.length - failures.length}/${models.length} models`);
    return { built: true, failures, recorded: !retryable };
  })()
    .catch((err) => {
      logger.warn(`[schemaIndexes] Index check failed: ${err.message}`);
      return { built: false, error: err };
    })
    .finally(() => {
      inFlight = null; // only concurrent callers share a run
    });
  return inFlight;
};

/**
 * Runs a one-time index migration for `model` at most once per database per version of its
 * index definitions, instead of once per server instance. `migrate` returns true when it
 * fully succeeded; only then is it recorded (so a failed run is retried by the next write).
 * Returns whether the indexes are known to be in place.
 */
const runIndexMigrationOnce = async (model, key, migrate) => {
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(model.schema.indexes())).digest('hex');
  const meta = mongoose.connection.db.collection(META_COLLECTION);
  const stored = await meta.findOne({ _id: key });
  if (stored && stored.fingerprint === fingerprint) return true;
  const ok = await migrate();
  if (ok) await meta.updateOne({ _id: key }, { $set: { fingerprint, migratedAt: new Date() } }, { upsert: true });
  return ok;
};

module.exports = {
  MONGOOSE_CONNECT_OPTIONS,
  ensureSchemaIndexes,
  indexFingerprint,
  runIndexMigrationOnce,
};
