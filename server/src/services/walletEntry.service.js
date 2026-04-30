const { WalletEntry } = require('../models');

const upsertReferenceEntry = async (entryBody) => {
  return WalletEntry.findOneAndUpdate(
    {
      referenceId: entryBody.referenceId,
      referenceModel: entryBody.referenceModel,
      type: entryBody.type || 'in',
    },
    {
      ...entryBody,
      type: entryBody.type || 'in',
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

const deleteEntriesByReference = async (referenceId, referenceModel) => {
  return WalletEntry.deleteMany({ referenceId, referenceModel });
};

module.exports = {
  upsertReferenceEntry,
  deleteEntriesByReference,
};
