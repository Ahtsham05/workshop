const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const stockService = require('./stock.service');
const { roundQty, roundMoney } = require('./common');

/**
 * WIP bookkeeping for a production order. Material quantities on a line are in the line's
 * own units ("credited"); a WIP lot holds physical units of whatever was issued, where
 * `lot.ratio` physical units = 1 credited unit (1 unless an alternative was issued).
 */

const EPS = 1e-6;

const lotCredited = (lot) => roundQty(lot.quantity / (lot.ratio || 1));

const lotsForLine = (order, materialLineId) =>
  order.wipLots
    .filter((lot) => String(lot.materialLineId) === String(materialLineId) && lot.quantity > EPS)
    .sort((a, b) => new Date(a.issuedAt) - new Date(b.issuedAt));

/** Credited quantity of a material line currently in WIP. */
const lineWip = (order, material) => roundQty(lotsForLine(order, material._id).reduce((s, lot) => s + lotCredited(lot), 0));

/**
 * Still to be issued for a line: requirement minus what's on the floor or already built in.
 * Returned and scrapped material no longer counts as issued (scrap has to be replaced).
 */
const lineRemaining = (material) =>
  Math.max(
    0,
    roundQty(
      material.requiredQuantity -
        (material.issuedQuantity || 0) +
        (material.returnedQuantity || 0) +
        (material.scrappedQuantity || 0)
    )
  );

/** Physical units of one product/variant this order holds in WIP — the 'wip' ledger balance. */
const wipBalanceOf = (order, productId, variantId) =>
  roundQty(
    order.wipLots
      .filter(
        (lot) => String(lot.productId) === String(productId) && String(lot.variantId || '') === String(variantId || '')
      )
      .reduce((s, lot) => s + lot.quantity, 0)
  );

const wipValue = (order) => roundMoney(order.wipLots.reduce((s, lot) => s + lot.quantity * (lot.unitCost || 0), 0));

const pruneEmptyLots = (order) => {
  // eslint-disable-next-line no-param-reassign
  order.wipLots = order.wipLots.filter((lot) => lot.quantity > EPS);
};

/**
 * Takes `credited` units of a material line out of WIP, oldest lot first, writing one
 * ledger row per lot touched. Serial lots give up whole units (their first N serials).
 * Returns what was taken. The caller decides where it went (consumed / returned / scrapped)
 * through `type` and the serial status.
 */
const takeFromWip = async (
  order,
  material,
  credited,
  {
    organizationId,
    branchId,
    type,
    refType,
    refId,
    createdBy,
    location,
    serialStatus,
    serialNote,
    serialOrderId = null,
    session,
  }
) => {
  const taken = [];
  let left = roundQty(credited);
  // eslint-disable-next-line no-restricted-syntax
  for (const lot of lotsForLine(order, material._id)) {
    if (left <= EPS) break;
    const isSerialLot = !!(lot.imeiIds && lot.imeiIds.length);
    let units = roundQty(Math.min(lot.quantity, left * (lot.ratio || 1)));
    if (isSerialLot) units = Math.min(lot.imeiIds.length, Math.round(units));
    if (units <= EPS) continue; // eslint-disable-line no-continue

    const imeiIds = isSerialLot ? lot.imeiIds.slice(0, units) : undefined;
    const serialNumbers = isSerialLot && lot.serialNumbers ? lot.serialNumbers.slice(0, units) : undefined;
    lot.quantity = roundQty(lot.quantity - units);
    if (isSerialLot) {
      lot.imeiIds = lot.imeiIds.slice(units);
      if (lot.serialNumbers) lot.serialNumbers = lot.serialNumbers.slice(units);
      // eslint-disable-next-line no-await-in-loop
      await stockService.setSerialStatus(imeiIds, {
        status: serialStatus,
        productionOrderId: serialOrderId,
        note: serialNote,
        userId: createdBy,
        session,
      });
    }
    left = roundQty(left - units / (lot.ratio || 1));

    // eslint-disable-next-line no-await-in-loop
    const item = await stockService.resolveItem({
      organizationId,
      branchId,
      productId: lot.productId,
      variantId: lot.variantId,
      session,
    });
    // eslint-disable-next-line no-await-in-loop
    await stockService.writeMovement(item, {
      organizationId,
      branchId,
      type,
      bucket: 'wip',
      delta: -units,
      balanceAfter: wipBalanceOf(order, lot.productId, lot.variantId),
      unitCost: lot.unitCost,
      refType,
      refId,
      productionOrderId: order._id,
      location,
      batchId: lot.batchId,
      imeiIds,
      serialNumbers,
      createdBy,
      session,
    });
    taken.push({
      lot,
      item,
      units,
      credited: roundQty(units / (lot.ratio || 1)),
      cost: roundMoney(units * (lot.unitCost || 0)),
      imeiIds,
      serialNumbers,
    });
  }
  if (left > EPS && credited > EPS) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Only ${roundQty(credited - left)} ${material.unit} of "${material.productName}" is in WIP for this order`
    );
  }
  return taken;
};

module.exports = {
  EPS,
  lotCredited,
  lotsForLine,
  lineWip,
  lineRemaining,
  wipBalanceOf,
  wipValue,
  pruneEmptyLots,
  takeFromWip,
};
