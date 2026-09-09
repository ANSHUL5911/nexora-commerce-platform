import { productService } from './product.service.js';

/**
 * Handler for GET /api/products
 */
export async function listProducts(req, res, next) {
  try {
    const { products, pagination } = await productService.listProducts(req.query);

    return res.status(200).json({
      products,
      pagination,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Handler for GET /api/products/:id
 */
export async function getProductById(req, res, next) {
  try {
    const { id } = req.params;
    const product = await productService.getProductById(id);

    return res.status(200).json({
      product,
      requestId: req.id,
    });
  } catch (err) {
    return next(err);
  }
}

export default {
  listProducts,
  getProductById,
};
