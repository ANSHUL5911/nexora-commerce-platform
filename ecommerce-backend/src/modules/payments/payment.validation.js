import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';

export const createPaymentSchema = z
  .object({
    orderId: z.string().uuid('Invalid order ID format. Must be a valid UUID.'),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in create payment payload' });

export const retryPaymentSchema = z
  .object({
    orderId: z.string().uuid('Invalid order ID format. Must be a valid UUID.'),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in retry payment payload' });

export const verifyPaymentSchema = z
  .object({
    orderId: z.string().uuid('Invalid order ID format. Must be a valid UUID.'),
    razorpayOrderId: z.string().min(1, 'Razorpay Order ID is required.').max(255),
    razorpayPaymentId: z.string().min(1, 'Razorpay Payment ID is required.').max(255),
    razorpaySignature: z.string().min(1, 'Razorpay signature is required.').max(255),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in verify payment payload' });

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

export default {
  createPaymentSchema,
  retryPaymentSchema,
  verifyPaymentSchema,
  validateBody,
};
