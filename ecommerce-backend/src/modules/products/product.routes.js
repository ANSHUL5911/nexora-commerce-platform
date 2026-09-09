import { Router } from 'express';
import { listProducts, getProductById } from './product.controller.js';
import {
  validateQuery,
  validateParams,
  listProductsQuerySchema,
  productParamSchema,
} from './product.validation.js';

export const productRouter = Router();

// Public catalog routes
productRouter.get('/', validateQuery(listProductsQuerySchema), listProducts);
productRouter.get('/:id', validateParams(productParamSchema), getProductById);

export default productRouter;
