import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format. Must be a valid UUID.'),
});

export const refundOrderSchema = z
  .object({
    reason: z.string().min(1).max(500).optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in refund payload. Amount and IDs cannot be client-specified.' });

export const restockItemSchema = z
  .object({
    productId: z.string().uuid('Invalid product ID format. Must be a valid UUID.'),
    quantity: z.number().int('Quantity must be an integer.').positive('Quantity must be greater than 0.'),
  })
  .strict();

export const restockOrderSchema = z
  .object({
    reason: z.string().min(1, 'Restock reason is required.').max(500, 'Reason must not exceed 500 characters.'),
    items: z
      .array(restockItemSchema)
      .min(1, 'Items array must not be empty if provided.')
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in restock payload.' });

/**
 * Express middleware factory for validating request bodies with Zod.
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
      const primaryMessage = issues[0]?.message || 'Validation failed';
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
      const primaryMessage = issues[0]?.message || 'Validation failed';
      return next(new ValidationError(primaryMessage, issues));
    }
    req.params = result.data;
    next();
  };
}

export default {
  orderIdParamSchema,
  refundOrderSchema,
  restockOrderSchema,
  validateBody,
  validateParams,
};
