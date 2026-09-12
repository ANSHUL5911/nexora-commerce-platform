import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';
import { VALID_ORDER_STATUSES, SHIPPING_METHODS } from './order.constants.js';

export const shippingAddressSchema = z
  .object({
    fullName: z
      .string({ required_error: 'Full name is required' })
      .trim()
      .min(1, 'Full name cannot be empty')
      .max(255, 'Full name cannot exceed 255 characters'),
    addressLine1: z
      .string({ required_error: 'Address line 1 is required' })
      .trim()
      .min(1, 'Address line 1 cannot be empty')
      .max(500, 'Address line 1 cannot exceed 500 characters'),
    city: z
      .string({ required_error: 'City is required' })
      .trim()
      .min(1, 'City cannot be empty')
      .max(100, 'City cannot exceed 100 characters'),
    state: z
      .string({ required_error: 'State is required' })
      .trim()
      .min(1, 'State cannot be empty')
      .max(100, 'State cannot exceed 100 characters'),
    pincode: z
      .string({ required_error: 'Pincode is required' })
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Pincode must be exactly 6 Indian digits (e.g. 560001)'),
    phone: z
      .string({ required_error: 'Phone number is required' })
      .trim()
      .regex(/^[0-9+\-\s()]{10,20}$/, 'Phone number must be between 10 and 20 digits'),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in shipping address' });

export const checkoutItemSchema = z
  .object({
    productId: z
      .string({ required_error: 'Product ID is required' })
      .uuid('Invalid product ID format. Must be a valid UUIDv4.'),
    quantity: z
      .number({ required_error: 'Quantity is required' })
      .int('Quantity must be an integer')
      .min(1, 'Quantity must be at least 1')
      .max(10, 'Quantity cannot exceed 10 per line item'),
  })
  .strict({ message: 'Unrecognized fields in checkout line item' });

export const checkoutInitiateSchema = z
  .object({
    items: z
      .array(checkoutItemSchema)
      .min(1, 'At least one item is required for guest checkout')
      .refine(
        (items) => {
          const ids = items.map((i) => i.productId);
          return new Set(ids).size === ids.length;
        },
        { message: 'Duplicate product IDs in checkout items are not allowed' }
      )
      .optional(),
    shippingAddress: shippingAddressSchema,
    shippingMethod: z
      .enum(Object.values(SHIPPING_METHODS), {
        invalid_type_error: 'Invalid shipping method',
      })
      .optional(),
    shippingSpeed: z
      .enum(Object.values(SHIPPING_METHODS), {
        invalid_type_error: 'Invalid shipping speed',
      })
      .optional(),
    email: z.string().email('Invalid email address').optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in checkout initiation payload' })
  .refine((data) => Boolean(data.shippingMethod || data.shippingSpeed), {
    message: 'Shipping method is required (STANDARD, EXPRESS, or OVERNIGHT)',
    path: ['shippingMethod'],
  })
  .transform((data) => ({
    items: data.items,
    shippingAddress: data.shippingAddress,
    shippingMethod: data.shippingMethod || data.shippingSpeed,
    email: data.email,
  }));

export const createOrderSchema = z
  .object({
    shippingAddress: shippingAddressSchema,
    shippingMethod: z
      .enum(Object.values(SHIPPING_METHODS), {
        invalid_type_error: 'Invalid shipping method',
      })
      .optional(),
    shippingSpeed: z
      .enum(Object.values(SHIPPING_METHODS), {
        invalid_type_error: 'Invalid shipping speed',
      })
      .optional(),
  })
  .strict({ message: 'Unrecognized or unauthorized fields in order creation payload' })
  .refine((data) => Boolean(data.shippingMethod || data.shippingSpeed), {
    message: 'Shipping method is required (STANDARD, EXPRESS, or OVERNIGHT)',
    path: ['shippingMethod'],
  })
  .transform((data) => ({
    shippingAddress: data.shippingAddress,
    shippingMethod: data.shippingMethod || data.shippingSpeed,
  }));

export const orderIdParamSchema = z
  .object({
    orderId: z
      .string({ required_error: 'Order ID is required' })
      .uuid('Invalid order ID format. Must be a valid UUIDv4.'),
  })
  .strict();

export const listOrdersQuerySchema = z
  .object({
    page: z
      .preprocess((val) => (val === undefined ? 1 : Number(val)), z.number().int().min(1).default(1)),
    limit: z
      .preprocess((val) => (val === undefined ? 10 : Number(val)), z.number().int().min(1).max(50).default(10)),
    status: z
      .enum(VALID_ORDER_STATUSES, {
        invalid_type_error: 'Invalid order status filter',
      })
      .optional(),
  })
  .strict({ message: 'Unrecognized query parameter in order list request' });

export const transitionStatusSchema = z
  .object({
    status: z.enum(VALID_ORDER_STATUSES, {
      required_error: 'Target order status is required',
      invalid_type_error: 'Invalid target order status',
    }),
  })
  .strict({ message: 'Unrecognized fields in status transition payload' });

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
 * Express middleware factory for validating query strings with Zod.
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
  shippingAddressSchema,
  createOrderSchema,
  orderIdParamSchema,
  listOrdersQuerySchema,
  transitionStatusSchema,
  validateBody,
  validateParams,
  validateQuery,
};
