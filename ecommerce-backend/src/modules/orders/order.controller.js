import { orderService } from './order.service.js';

/**
 * Controller to handle authenticated order creation from cart.
 * POST /api/orders
 */
export async function createOrder(req, res, next) {
  try {
    const orderDTO = await orderService.createOrderFromCart(req.user.id, req.body, {
      idempotencyRecord: req.idempotencyRecord,
    });
    return res.status(201).json({
      success: true,
      data: orderDTO,
    });
  } catch (err) {
    return next(err);
  }
}


/**
 * Controller to retrieve an order by ID for the authenticated user.
 * GET /api/orders/:orderId
 */
export async function getOrder(req, res, next) {
  try {
    const orderDTO = await orderService.getOrderById(req.params.orderId, {
      userId: req.user.id,
      role: req.user.role,
    });
    return res.status(200).json({
      success: true,
      data: orderDTO,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Controller to list paginated orders for the authenticated user.
 * GET /api/orders
 */
export async function listOrders(req, res, next) {
  try {
    const result = await orderService.listUserOrders(req.user.id, req.query);
    return res.status(200).json({
      success: true,
      data: result.orders,
      pagination: result.pagination,
    });
  } catch (err) {
    return next(err);
  }
}

export default {
  createOrder,
  getOrder,
  listOrders,
};
