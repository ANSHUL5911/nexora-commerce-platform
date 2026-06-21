import express from 'express';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';

const router = express.Router();

router.get('/:orderId', async (req, res) => {
  const { orderId } = req.params;

  let order = await Order.findByPk(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const products = await Promise.all(order.products.map(async (product) => {
    const productDetails = await Product.findByPk(product.productId);
    return {
      ...product,
      product: productDetails
    };
  }));

  const currentTime = Date.now();

  const trackingInfo = products.map((item) => {
    const estimatedDelivery = item.estimatedDeliveryTimeMs;
    const orderTime = order.orderTimeMs;

    let status = 'Preparing';
    let progress = 0;

    if (currentTime >= estimatedDelivery) {
      status = 'Delivered';
      progress = 100;
    } else if (currentTime > orderTime + (estimatedDelivery - orderTime) * 0.3) {
      status = 'Shipped';
      progress = 50;
    }

    return {
      productId: item.productId,
      quantity: item.quantity,
      estimatedDeliveryTimeMs: estimatedDelivery,
      product: item.product,
      status,
      progress
    };
  });

  res.json({
    orderId: order.id,
    orderTimeMs: order.orderTimeMs,
    products: trackingInfo
  });
});

export default router;