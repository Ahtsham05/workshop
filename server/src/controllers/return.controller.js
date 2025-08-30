const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { returnService } = require('../services');

const createReturn = catchAsync(async (req, res) => {
    const returnDoc = await returnService.createReturn(req.body, req.user);
    res.status(httpStatus.CREATED).send(returnDoc);
});

const getReturns = catchAsync(async (req, res) => {
    const filter = pick(req.query, ['status', 'returnType', 'customerId', 'originalInvoiceId']);
    const options = pick(req.query, ['sortBy', 'limit', 'page', 'populate']);
    
    // Handle date filtering
    if (req.query.dateFrom || req.query.dateTo) {
        filter.createdAt = {};
        if (req.query.dateFrom) {
            filter.createdAt.$gte = new Date(req.query.dateFrom);
        }
        if (req.query.dateTo) {
            filter.createdAt.$lte = new Date(req.query.dateTo);
        }
    }

    const result = await returnService.queryReturns(filter, options);
    res.send(result);
});

const getReturn = catchAsync(async (req, res) => {
    const returnDoc = await returnService.getReturnById(req.params.returnId);
    if (!returnDoc) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Return not found');
    }
    res.send(returnDoc);
});

const updateReturn = catchAsync(async (req, res) => {
    const returnDoc = await returnService.updateReturnById(req.params.returnId, req.body, req.user);
    res.send(returnDoc);
});

const deleteReturn = catchAsync(async (req, res) => {
    await returnService.deleteReturnById(req.params.returnId);
    res.status(httpStatus.NO_CONTENT).send();
});

const approveReturn = catchAsync(async (req, res) => {
    const returnDoc = await returnService.approveReturn(req.params.returnId, req.user, req.body);
    res.send(returnDoc);
});

const rejectReturn = catchAsync(async (req, res) => {
    const returnDoc = await returnService.rejectReturn(req.params.returnId, req.user, req.body);
    res.send(returnDoc);
});

const processReturn = catchAsync(async (req, res) => {
    const returnDoc = await returnService.processReturn(req.params.returnId, req.user, req.body);
    res.send(returnDoc);
});

const getReturnsByInvoice = catchAsync(async (req, res) => {
    const filter = pick(req.query, ['status']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);
    const result = await returnService.getReturnsByInvoice(req.params.invoiceId, filter, options);
    res.send(result);
});

const getReturnsByCustomer = catchAsync(async (req, res) => {
    const filter = pick(req.query, ['status']);
    const options = pick(req.query, ['sortBy', 'limit', 'page']);
    
    // Handle date filtering
    if (req.query.dateFrom || req.query.dateTo) {
        filter.createdAt = {};
        if (req.query.dateFrom) {
            filter.createdAt.$gte = new Date(req.query.dateFrom);
        }
        if (req.query.dateTo) {
            filter.createdAt.$lte = new Date(req.query.dateTo);
        }
    }

    const result = await returnService.getReturnsByCustomer(req.params.customerId, filter, options);
    res.send(result);
});

const getReturnStatistics = catchAsync(async (req, res) => {
    const filter = pick(req.query, ['dateFrom', 'dateTo', 'customerId', 'status']);
    const result = await returnService.getReturnStatistics(filter);
    res.send(result);
});

module.exports = {
    createReturn,
    getReturns,
    getReturn,
    updateReturn,
    deleteReturn,
    approveReturn,
    rejectReturn,
    processReturn,
    getReturnsByInvoice,
    getReturnsByCustomer,
    getReturnStatistics
};
