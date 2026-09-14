import { sequelize } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { Order } from '../../models/Order.js';
import { OrderItem } from '../../models/OrderItem.js';
import { StockRestockLog } from '../../models/StockRestockLog.js';
import { AuditLog } from '../../models/AuditLog.js';
import { orderRepository } from '../orders/order.repository.js';
import { OrderNotFoundError } from '../orders/order.errors.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { idempotencyRepository } from '../idempotency/idempotency.repository.js';
import {
  OrderNotRestockableError,
  RestockQuantityExceededError,
  RestockNotAllowedError,
} from './admin.errors.js';
import { toRestockResponseDTO } from './admin.dto.js';

export const restockService = {
  /**
   * Process explicit administrative inventory restocking for a REFUNDED order.
   *
   * Architectural Guarantees:
   *   1. Eligibility: Only REFUNDED orders can be restocked.
   *   2. Bounded Quantities: Restock quantity per product is strictly capped at (ordered_quantity - already_restocked_quantity).
   *   3. Concurrency Safety: Multi-product row locks ordered by UUID ASC with SELECT ... FOR UPDATE.
   *   4. Invariant Preservation: Increments stock_quantity; leaves reserved_quantity untouched.
   *   5. Full Auditability: StockRestockLog and AuditLog created atomically with stock update.
   *   6. Idempotency: Supports Idempotency-Key replay and transaction-bound completion.
   *
   * @param {{
   *   orderId: string,
   *   adminId: string,
   *   reason: string,
   *   items?: Array<{ productId: string, quantity: number }>,
   *   ipAddress?: string,
   *   idempotencyRecord?: import('../../models/IdempotencyRecord.js').IdempotencyRecord
   * }} params
   * @returns {Promise<ReturnType<typeof toRestockResponseDTO>>}
   */
  async restockOrder({ orderId, adminId, reason, items, ipAddress, idempotencyRecord }) {
    if (!orderId) {
      throw new OrderNotFoundError('Order was not found.');
    }

    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      throw new RestockNotAllowedError('Restock reason is required.');
    }

    // 1. Initial lookup to verify existence & eligibility
    const initialOrder = await orderRepository.findOrderById(orderId);
    if (!initialOrder) {
      throw new OrderNotFoundError('Order was not found.');
    }

    if (initialOrder.order_status !== 'REFUNDED') {
      throw new OrderNotRestockableError(
        `Order with status '${initialOrder.order_status}' cannot be restocked. Only REFUNDED orders are eligible for inventory restocking.`
      );
    }

    logger.info('Admin physical restock requested', {
      event: 'admin.restock.requested',
      orderId,
      adminId,
    });

    let finalRestockedItems = [];
    let reloadedOrder;

    // 2. Execute Atomic Multi-Product Restock inside PostgreSQL transaction
    await sequelize.transaction(async (tx) => {
      // Lock Order row FOR UPDATE
      reloadedOrder = await Order.findByPk(orderId, {
        lock: tx.LOCK.UPDATE,
        transaction: tx,
      });

      if (!reloadedOrder) {
        throw new OrderNotFoundError('Order was not found.');
      }

      if (reloadedOrder.order_status !== 'REFUNDED') {
        throw new OrderNotRestockableError(
          `Order status changed to '${reloadedOrder.order_status}' and cannot be restocked.`
        );
      }

      // Fetch immutable OrderItem snapshots
      const orderItems = await OrderItem.findAll({
        where: { order_id: orderId },
        transaction: tx,
      });

      if (!orderItems || orderItems.length === 0) {
        throw new RestockNotAllowedError('Order has no items to restock.');
      }

      // Query existing StockRestockLogs for this order under transaction
      const existingRestockLogs = await StockRestockLog.findAll({
        where: { order_id: orderId },
        transaction: tx,
      });

      // Compute total already restocked quantity per product_id
      const alreadyRestockedByProduct = {};
      for (const log of existingRestockLogs) {
        const pid = log.product_id;
        alreadyRestockedByProduct[pid] = (alreadyRestockedByProduct[pid] || 0) + Number(log.quantity_restocked);
      }

      // Build target items to restock with strict bounded quantity validation
      const itemsToProcess = [];

      if (items && Array.isArray(items) && items.length > 0) {
        // Specific items requested
        for (const reqItem of items) {
          const matchingOrderItem = orderItems.find((oi) => oi.product_id === reqItem.productId);
          if (!matchingOrderItem) {
            throw new RestockNotAllowedError(
              `Product '${reqItem.productId}' is not an item of order '${orderId}'.`
            );
          }

          const orderedQty = Number(matchingOrderItem.quantity);
          const alreadyRestockedQty = alreadyRestockedByProduct[reqItem.productId] || 0;
          const remainingEligible = Math.max(0, orderedQty - alreadyRestockedQty);

          if (reqItem.quantity <= 0) {
            throw new RestockNotAllowedError('Restock quantity must be greater than zero.');
          }

          if (reqItem.quantity > remainingEligible) {
            throw new RestockQuantityExceededError(
              `Requested restock quantity (${reqItem.quantity}) for product '${matchingOrderItem.product_name_snapshot}' exceeds remaining eligible quantity (${remainingEligible}). Ordered: ${orderedQty}, Already Restocked: ${alreadyRestockedQty}.`
            );
          }

          itemsToProcess.push({
            productId: reqItem.productId,
            productName: matchingOrderItem.product_name_snapshot,
            quantity: reqItem.quantity,
          });
        }
      } else {
        // Default: Full order restock (restock all remaining eligible quantities)
        for (const orderItem of orderItems) {
          const orderedQty = Number(orderItem.quantity);
          const alreadyRestockedQty = alreadyRestockedByProduct[orderItem.product_id] || 0;
          const remainingEligible = Math.max(0, orderedQty - alreadyRestockedQty);

          if (remainingEligible > 0) {
            itemsToProcess.push({
              productId: orderItem.product_id,
              productName: orderItem.product_name_snapshot,
              quantity: remainingEligible,
            });
          }
        }

        if (itemsToProcess.length === 0) {
          throw new RestockQuantityExceededError(
            'All items in this order have already been fully restocked.'
          );
        }
      }

      // 3. Lock all target products in ascending UUID order to prevent deadlocks
      const productIds = itemsToProcess.map((item) => item.productId);
      await inventoryRepository.findProductsForUpdate(productIds, { transaction: tx });

      // 4. Update product stock and write logs for each item
      for (const item of itemsToProcess) {
        await inventoryRepository.incrementProductStockQuantity(
          item.productId,
          item.quantity,
          { transaction: tx }
        );

        await StockRestockLog.create(
          {
            order_id: orderId,
            product_id: item.productId,
            quantity_restocked: item.quantity,
            initiated_by: adminId,
            reason: reason.trim(),
            created_at: new Date(),
          },
          { transaction: tx }
        );

        finalRestockedItems.push({
          productId: item.productId,
          productName: item.productName,
          quantityRestocked: item.quantity,
        });
      }

      // 5. Create AuditLog entry
      await AuditLog.create(
        {
          actor_id: adminId,
          action: 'RESTOCK_ORDER',
          target_resource: 'order',
          resource_id: orderId,
          ip_address: ipAddress || '127.0.0.1',
          details_json: {
            orderId,
            items: finalRestockedItems,
            reason: reason.trim(),
          },
          created_at: new Date(),
        },
        { transaction: tx }
      );

      // 6. Complete IdempotencyRecord inside settlement transaction
      if (idempotencyRecord) {
        const restockDTO = toRestockResponseDTO(reloadedOrder, finalRestockedItems, reason.trim());

        await idempotencyRepository.completeRecord(
          idempotencyRecord.id,
          {
            responseCode: 200,
            responseBody: {
              success: true,
              data: restockDTO,
              meta: {
                timestamp: new Date().toISOString(),
              },
            },
            orderId: reloadedOrder.id,
          },
          { transaction: tx }
        );
      }
    });

    logger.info('Admin physical restock completed successfully', {
      event: 'admin.restock.completed',
      orderId,
      adminId,
      itemsCount: finalRestockedItems.length,
      totalQuantity: finalRestockedItems.reduce((sum, i) => sum + i.quantityRestocked, 0),
    });

    return toRestockResponseDTO(reloadedOrder, finalRestockedItems, reason.trim());
  },
};

export default restockService;
