const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const productListService = require('../services/productList.service');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const scopeOf = async (req) => {
  await resolveWriteBranchId(req);
  const { organizationId, branchId } = getBranchContext(req);
  return { organizationId, branchId };
};

const listProductLists = catchAsync(async (req, res) => {
  res.send(await productListService.listProductLists(await scopeOf(req)));
});

const getProductList = catchAsync(async (req, res) => {
  res.send(await productListService.getProductList(await scopeOf(req), req.params.listId));
});

const createProductList = catchAsync(async (req, res) => {
  const list = await productListService.createProductList(await scopeOf(req), req.body, req.user.id);
  res.status(httpStatus.CREATED).send(list);
});

const updateProductList = catchAsync(async (req, res) => {
  res.send(await productListService.updateProductList(await scopeOf(req), req.params.listId, req.body, req.user.id));
});

const deleteProductList = catchAsync(async (req, res) => {
  await productListService.deleteProductList(await scopeOf(req), req.params.listId);
  res.status(httpStatus.NO_CONTENT).send();
});

const addProducts = catchAsync(async (req, res) => {
  res.send(await productListService.addProductsToList(await scopeOf(req), req.params.listId, req.body, req.user.id));
});

const removeProducts = catchAsync(async (req, res) => {
  res.send(await productListService.removeProductsFromList(await scopeOf(req), req.params.listId, req.body, req.user.id));
});

const updateItem = catchAsync(async (req, res) => {
  res.send(await productListService.updateListItem(await scopeOf(req), req.params.listId, req.params.productId, req.body, req.user.id));
});

const getMemberships = catchAsync(async (req, res) => {
  res.send(await productListService.getListMemberships(await scopeOf(req), String(req.query.productIds).split(',')));
});

const getDoNotOrder = catchAsync(async (req, res) => {
  res.send(await productListService.getDoNotOrderProducts(await scopeOf(req)));
});

const getOrderLines = catchAsync(async (req, res) => {
  res.send(await productListService.getListOrderLines(await scopeOf(req), req.params.listId));
});

module.exports = {
  listProductLists,
  getProductList,
  createProductList,
  updateProductList,
  deleteProductList,
  addProducts,
  removeProducts,
  updateItem,
  getMemberships,
  getDoNotOrder,
  getOrderLines,
};
