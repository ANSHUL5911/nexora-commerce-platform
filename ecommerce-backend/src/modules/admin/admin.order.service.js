import { sequelize } from '../../config/database.js';
import { orderRepository } from '../orders/order.repository.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { auditService } from './admin.audit.service.js';
import { toAdminOrderDTO, toAdminOrderSummaryDTO } from './admin.dto.js';
import { ALLOWED_STATUS_TRANSITIONS } from '../orders/order.constants.js';
import { OrderNotFoundError, InvalidOrderStateError } from '../orders/order.errors.js';
import { InventoryReservation } from '../../models/InventoryReservation.js';

export const adminOrderService = {
  /**
   * List paginated orders for administrative console with multi-parameter filtering.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   status?: string,
   *   userId?: string,
   *   search?: string,
   *   startDate?: Date,
   *   endDate?: Date,
   * }} query
   * @returns {Promise<{
   *   orders: ReturnType<typeof toAdminOrderSummaryDTO>[],
   *   pagination: { page: number, limit: number, total: number, totalPages: number }
   * }>}
   */
  async listOrders(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));

    const { rows, count } = await orderRepository.findAllOrdersAdmin({
      page,
      limit,
      status: query.status,
      userId: query.userId,
      search: query.search,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    const totalPages = Math.ceil(count / limit) || (count === 0 ? 0 : 1);
    const orders = rows.map(toAdminOrderSummaryDTO);

    return {
      orders,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
      },
    };
  },

  /**
   * Retrieve complete operational order details by ID.
   *
   * @param {string} orderId
   * @returns {Promise<ReturnType<typeof toAdminOrderDTO>>}
   */
  async getOrderById(orderId) {
    const order = await orderRepository.findAdminOrderById(orderId);

    if (!order) {
      throw new OrderNotFoundError('Order was not found.');
    }

    return toAdminOrderDTO(order);
  },

  /**
   * Transition order status adhering to explicit Order State Machine.
   * On cancellation of PENDING_PAYMENT orders, safely releases active inventory reservations via Phase 07.6.
   * Atomic audit logging inside the transaction.
   *
   * @param {string} orderId
   * @param {{ status: string, note?: string }} data
   * @param {{ adminId: string, ipAddress?: string }} context
   * @returns {Promise<ReturnType<typeof toAdminOrderDTO>>}
   */
  async updateOrderStatus(orderId, { status, note }, { adminId, ipAddress = '127.0.0.1' }) {
    return sequelize.transaction(async (tx) => {
      // 1. Lock order row FOR UPDATE
      const order = await orderRepository.findAdminOrderById(orderId, {
        transaction: tx,
        lock: true,
      });

      if (!order) {
        throw new OrderNotFoundError('Order was not found.');
      }

      const currentStatus = order.order_status;
      const allowedTargets = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];

      if (!allowedTargets.includes(status)) {
        throw new InvalidOrderStateError(
          `Cannot transition order '${orderId}' from status '${currentStatus}' to '${status}'.`
        );
      }

      // 2. If cancelling an order in PENDING_PAYMENT, release any active inventory reservations via Phase 07.6
      if (currentStatus === 'PENDING_PAYMENT' && status === 'CANCELLED') {
        const activeReservations = await InventoryReservation.findAll({
          where: {
            order_id: orderId,
            status: 'ACTIVE',
          },
          lock: tx.LOCK.UPDATE,
          transaction: tx,
        });

        for (const reservation of activeReservations) {
          await inventoryService.releaseReservation(reservation.id, {
            role: 'admin',
            transaction: tx,
          });
        }
      }

      // 3. Update order status
      await orderRepository.updateOrderStatus(orderId, status, { transaction: tx });

      // 4. Record atomic audit log
      await auditService.recordAuditLog({
        actorId: adminId,
        action: 'ADMIN_ORDER_STATUS_CHANGE',
        targetResource: 'orders',
        resourceId: orderId,
        ipAddress,
        detailsJson: {
          fromStatus: currentStatus,
          toStatus: status,
          note: note || null,
        },
        transaction: tx,
      });

      // 5. Reload and return updated order DTO
      const updatedOrder = await orderRepository.findAdminOrderById(orderId, { transaction: tx });
      return toAdminOrderDTO(updatedOrder);
    });
  },
};

export default adminOrderService;
