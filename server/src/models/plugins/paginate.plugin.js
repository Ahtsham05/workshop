/* eslint-disable no-param-reassign */
const { applyTokenSearch, parseFields, scoreDocument } = require('../../utils/searchQuery');

// A ranked search scores matching documents in memory; past this many matches the query is too
// broad to be worth ranking, so it falls back to the normal sort.
const RELEVANCE_CANDIDATE_CAP = 3000;

const readField = (doc, path) => {
  const value = path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), doc);
  return Array.isArray(value) ? value.join(' ') : value;
};

const paginate = (schema) => {
  /**
   * @typedef {Object} QueryResult
   * @property {Document[]} results - Results found
   * @property {number} page - Current page
   * @property {number} limit - Maximum number of results per page
   * @property {number} totalPages - Total number of pages
   * @property {number} totalResults - Total number of documents
   */
  /**
   * Query for documents with pagination
   * @param {Object} [filter] - Mongo filter
   * @param {Object} [options] - Query options
   * @param {string} [options.sortBy] - Sorting criteria using the format: sortField:(desc|asc). Multiple sorting criteria should be separated by commas (,)
   * @param {string} [options.populate] - Populate data fields. Hierarchy of fields should be separated by (.). Multiple populating criteria should be separated by commas (,)
   * @param {number} [options.limit] - Maximum number of results per page (default = 10)
   * @param {number} [options.page] - Current page (default = 1)
   * @param {string} [options.search] - Search query
   * @param {string} [options.fieldName] - Field name to search
   * @returns {Promise<QueryResult>}
   */
  schema.statics.paginate = async function (filter, options) {
    const wantsRelevance = !!(options.search && options.fieldName) && (!options.sortBy || options.sortBy === 'relevance');
    const sortBy = options.sortBy === 'relevance' ? undefined : options.sortBy;
    let sort = '';
    if (sortBy) {
      const sortingCriteria = [];
      sortBy.split(',').forEach((sortOption) => {
        const [key, order] = sortOption.split(':');
        sortingCriteria.push((order === 'desc' ? '-' : '') + key);
      });
      sort = sortingCriteria.join(' ');
    } else {
      sort = 'createdAt';
    }

    const limit = options.limit && parseInt(options.limit, 10) > 0 ? parseInt(options.limit, 10) : 10;
    const page = options.page && parseInt(options.page, 10) > 0 ? parseInt(options.page, 10) : 1;
    const skip = (page - 1) * limit;

    // Search: `fieldName` can be comma-separated (e.g. name,nameUrdu,barcode). The query is split into
    // words and every word must match some field (see utils/searchQuery.js); input is regex-escaped.
    if (options.search && options.fieldName) {
      filter = applyTokenSearch(filter, options.search, options.fieldName);
    }

    const applyPopulate = (query) => {
      if (!options.populate) return query;
      if (Array.isArray(options.populate)) {
        options.populate.forEach((populateOption) => {
          query = query.populate(populateOption);
        });
        return query;
      }
      options.populate.split(',').forEach((populateOption) => {
        query = query.populate(
          populateOption
            .split('.')
            .reverse()
            .reduce((a, b) => ({ path: b, populate: a }))
        );
      });
      return query;
    };

    // Search with no explicit sort: best match first (see utils/searchQuery.js), then A-Z.
    if (wantsRelevance) {
      const fields = parseFields(options.fieldName);
      const candidates = await this.find(filter)
        .select(fields.join(' '))
        .limit(RELEVANCE_CANDIDATE_CAP + 1)
        .lean()
        .exec();
      if (candidates.length <= RELEVANCE_CANDIDATE_CAP) {
        const view = (doc) => Object.fromEntries(fields.map((f) => [f, readField(doc, f)]));
        const ranked = candidates
          .map((doc) => ({
            id: doc._id,
            score: scoreDocument(view(doc), options.search, { nameFields: fields, exactFields: fields }),
            label: String(readField(doc, fields[0]) || '').toLowerCase(),
          }))
          .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label) || String(a.id).localeCompare(String(b.id)));
        const pageIds = ranked.slice(skip, skip + limit).map((r) => r.id);
        const docs = await applyPopulate(this.find({ _id: { $in: pageIds } })).exec();
        const byId = new Map(docs.map((d) => [String(d._id), d]));
        return {
          results: pageIds.map((id) => byId.get(String(id))).filter(Boolean),
          page,
          limit,
          totalPages: Math.ceil(ranked.length / limit),
          totalResults: ranked.length,
        };
      }
    }

    const countPromise = this.countDocuments(filter).exec();
    let docsPromise = this.find(filter).sort(sort).skip(skip).limit(limit);

    docsPromise = applyPopulate(docsPromise);

    docsPromise = docsPromise.exec();

    return Promise.all([countPromise, docsPromise]).then((values) => {
      const [totalResults, results] = values;
      const totalPages = Math.ceil(totalResults / limit);
      const result = {
        results,
        page,
        limit,
        totalPages,
        totalResults,
      };
      return Promise.resolve(result);
    });
  };
};

module.exports = paginate;
