import { inventoryService } from './inventory.service.js';

/**
 * Handler for POST /api/inventory/reservations
 * Creates a transactional inventory reservation bound to an existing Order.
 */
export async function createReservation(req, res, next) {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { productId, quantity, orderId } = req.body;

    const reservation = await inventoryService.reserveInventory(productId, quantity, {
      orderId,
      userId,
      role,
    });

    return res.status(201).json({
      message: 'Inventory reserved successfully',
      reservation,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for GET /api/inventory/reservations/:reservationId
 * Retrieves a reservation with customer ownership verification.
 */
export async function getReservation(req, res, next) {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { reservationId } = req.params;

    const reservation = await inventoryService.getReservation(reservationId, {
      userId,
      role,
    });

    return res.status(200).json({
      reservation,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for POST /api/inventory/reservations/:reservationId/release
 * Manually releases an active reservation and restores stock.
 */
export async function releaseReservation(req, res, next) {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { reservationId } = req.params;

    const reservation = await inventoryService.releaseReservation(reservationId, {
      userId,
      role,
    });

    return res.status(200).json({
      message: 'Reservation released successfully',
      reservation,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for POST /api/inventory/reservations/:reservationId/convert
 * Converts an active reservation into a permanent stock deduction.
 */
export async function convertReservation(req, res, next) {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { reservationId } = req.params;

    const reservation = await inventoryService.convertReservation(reservationId, {
      userId,
      role,
    });

    return res.status(200).json({
      message: 'Reservation converted successfully',
      reservation,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for GET /api/inventory/products/:productId
 * Retrieves current public stock counters for a product.
 */
export async function getProductInventory(req, res, next) {
  try {
    const { productId } = req.params;
    const inventory = await inventoryService.getProductInventory(productId);

    return res.status(200).json({
      inventory,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

export default {
  createReservation,
  getReservation,
  releaseReservation,
  convertReservation,
  getProductInventory,
};
