import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';
import { MAX_RESERVATION_QUANTITY_PER_ITEM } from './inventory.constants.js';

export const createReservationSchema = z
  .object({
    productId: z
      .string({ required_error: 'Product ID is required', invalid_type_error: 'Product ID must be a string' })
      .uuid('Invalid product ID format. Must be a valid UUIDv4.')
      .optional(),
    product_id: z
      .string({ invalid_type_error: 'Product ID must be a string' })
      .uuid('Invalid product ID format. Must be a valid UUIDv4.')
      .optional(),
    orderId: z
      .string({ required_error: 'Order ID is required', invalid_type_error: 'Order ID must be a string' })
      .uuid('Invalid order ID format. Must be a valid UUIDv4.')
      .optional(),
    order_id: z
      .string({ invalid_type_error: 'Order ID must be a string' })
      .uuid('Invalid order ID format. Must be a valid UUIDv4.')
      .optional(),
    quantity: z
      .number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
      .int('Quantity must be an integer')
      .min(1, 'Quantity must be at least 1')
      .max(MAX_RESERVATION_QUANTITY_PER_ITEM, `Quantity cannot exceed ${MAX_RESERVATION_QUANTITY_PER_ITEM}`)
      .default(1),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' })
  .refine((data) => Boolean(data.productId || data.product_id), {
    message: 'Product ID is required',
    path: ['productId'],
  })
  .refine((data) => Boolean(data.orderId || data.order_id), {
    message: 'Order ID is required',
    path: ['orderId'],
  })
  .transform((data) => ({
    productId: data.productId || data.product_id,
    orderId: data.orderId || data.order_id,
    quantity: data.quantity,
  }));

export const reservationIdParamSchema = z.object({
  reservationId: z
    .string({ required_error: 'Reservation ID is required', invalid_type_error: 'Reservation ID must be a string' })
    .uuid('Invalid reservation ID format. Must be a valid UUIDv4.'),
});

export const productIdParamSchema = z.object({
  productId: z
    .string({ required_error: 'Product ID is required', invalid_type_error: 'Product ID must be a string' })
    .uuid('Invalid product ID format. Must be a valid UUIDv4.'),
});

/**
 * Express middleware factory for validating request body with Zod.
 * @param {z.ZodSchema} schema
 */
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      const primaryMessage = issues[0]?.message || 'Invalid request body';
      return next(new ValidationError(primaryMessage, issues));
    }
    req.body = result.data;
    next();
  };
}

/**
 * Express middleware factory for validating route parameters with Zod.
 * @param {z.ZodSchema} schema
 */
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      const primaryMessage = issues[0]?.message || 'Invalid route parameters';
      return next(new ValidationError(primaryMessage, issues));
    }
    req.params = result.data;
    next();
  };
}

/**
 * Express middleware factory for validating query parameters with Zod.
 * @param {z.ZodSchema} schema
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      const primaryMessage = issues[0]?.message || 'Invalid query parameters';
      return next(new ValidationError(primaryMessage, issues));
    }
    req.query = result.data;
    next();
  };
}

export default {
  createReservationSchema,
  reservationIdParamSchema,
  productIdParamSchema,
  validateBody,
  validateParams,
  validateQuery,
};
