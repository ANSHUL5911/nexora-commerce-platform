import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';

export const addItemSchema = z
  .object({
    productId: z
      .string({ required_error: 'Product ID is required', invalid_type_error: 'Product ID must be a string' })
      .uuid('Invalid product ID format. Must be a valid UUIDv4.')
      .optional(),
    product_id: z
      .string({ invalid_type_error: 'Product ID must be a string' })
      .uuid('Invalid product ID format. Must be a valid UUIDv4.')
      .optional(),
    quantity: z
      .number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
      .int('Quantity must be an integer')
      .min(1, 'Quantity must be at least 1')
      .max(10, 'Quantity cannot exceed 10')
      .default(1),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' })
  .refine((data) => Boolean(data.productId || data.product_id), {
    message: 'Product ID is required',
    path: ['productId'],
  })
  .transform((data) => ({
    productId: data.productId || data.product_id,
    quantity: data.quantity,
  }));

export const updateItemSchema = z
  .object({
    quantity: z
      .number({ required_error: 'Quantity is required', invalid_type_error: 'Quantity must be a number' })
      .int('Quantity must be an integer')
      .min(1, 'Quantity must be at least 1')
      .max(10, 'Quantity cannot exceed 10'),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in request body' });

export const cartItemIdParamSchema = z.object({
  itemId: z
    .string({ required_error: 'Item ID is required', invalid_type_error: 'Item ID must be a string' })
    .uuid('Invalid cart item ID format. Must be a valid UUIDv4.'),
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

export default {
  addItemSchema,
  updateItemSchema,
  cartItemIdParamSchema,
  validateBody,
  validateParams,
};
