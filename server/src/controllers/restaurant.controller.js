const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { restaurantService } = require('../services');

const createFloor = catchAsync(async (req, res) => {
  const floor = await restaurantService.createFloor(req.body, req);
  res.status(httpStatus.CREATED).send(floor);
});

const getFloors = catchAsync(async (req, res) => {
  const floors = await restaurantService.queryFloors(req);
  res.send(floors);
});

const updateFloor = catchAsync(async (req, res) => {
  const floor = await restaurantService.updateFloor(req.params.floorId, req.body, req);
  res.send(floor);
});

const deleteFloor = catchAsync(async (req, res) => {
  await restaurantService.deleteFloor(req.params.floorId, req);
  res.status(httpStatus.NO_CONTENT).send();
});

const createTable = catchAsync(async (req, res) => {
  const table = await restaurantService.createTable(req.body, req);
  res.status(httpStatus.CREATED).send(table);
});

const getTables = catchAsync(async (req, res) => {
  const query = pick(req.query, ['floorId']);
  const tables = await restaurantService.queryTables(query, req);
  res.send(tables);
});

const updateTable = catchAsync(async (req, res) => {
  const table = await restaurantService.updateTable(req.params.tableId, req.body, req);
  res.send(table);
});

const regenerateQr = catchAsync(async (req, res) => {
  const table = await restaurantService.regenerateTableQr(req.params.tableId, req);
  res.send(table);
});

const createOrder = catchAsync(async (req, res) => {
  const order = await restaurantService.createOrder(req.body, req);
  res.status(httpStatus.CREATED).send(order);
});

const getOrders = catchAsync(async (req, res) => {
  const query = pick(req.query, ['status', 'source', 'serviceMode', 'limit']);
  const orders = await restaurantService.queryOrders(query, req);
  res.send(orders);
});

const getDeliveryCustomerLookup = catchAsync(async (req, res) => {
  const query = pick(req.query, ['phone', 'excludeOrderId']);
  const data = await restaurantService.lookupDeliveryCustomerContext(query, req);
  res.send(data);
});

const getOrder = catchAsync(async (req, res) => {
  const order = await restaurantService.getOrderById(req.params.orderId, req);
  res.send(order);
});

const patchOrderStatus = catchAsync(async (req, res) => {
  const order = await restaurantService.updateOrderStatus(req.params.orderId, req.body, req);
  res.send(order);
});

const patchOrder = catchAsync(async (req, res) => {
  const order = await restaurantService.updateOrder(req.params.orderId, req.body, req);
  res.send(order);
});

const patchLineStatus = catchAsync(async (req, res) => {
  const order = await restaurantService.updateLineKitchenStatus(
    req.params.orderId,
    req.params.lineId,
    req.body,
    req
  );
  res.send(order);
});

const getStats = catchAsync(async (req, res) => {
  const stats = await restaurantService.getStats(req);
  res.send(stats);
});

const createReservation = catchAsync(async (req, res) => {
  const row = await restaurantService.createReservation(req.body, req);
  res.status(httpStatus.CREATED).send(row);
});

const getReservations = catchAsync(async (req, res) => {
  const query = pick(req.query, ['from', 'to']);
  const rows = await restaurantService.queryReservations(query, req);
  res.send(rows);
});

const patchReservation = catchAsync(async (req, res) => {
  const row = await restaurantService.updateReservation(req.params.reservationId, req.body, req);
  res.send(row);
});

module.exports = {
  createFloor,
  getFloors,
  updateFloor,
  deleteFloor,
  createTable,
  getTables,
  updateTable,
  regenerateQr,
  createOrder,
  getOrders,
  getDeliveryCustomerLookup,
  getOrder,
  patchOrderStatus,
  patchOrder,
  patchLineStatus,
  getStats,
  createReservation,
  getReservations,
  patchReservation,
};
