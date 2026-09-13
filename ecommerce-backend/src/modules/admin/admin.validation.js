import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';

export const productIdParamSchema = z.object({
  id: z.string().uuid('Invalid product ID format. Must be a valid UUID.'),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format. Must be a valid UUID.'),
});

export const createProductSchema = z
  .object({
    name: z.string().min(1, 'Product name is required.').max(255, 'Product name must not exceed 255 characters.'),
    description: z.string().min(1, 'Description is required.').max(5000, 'Description must not exceed 5000 characters.'),
    price_paise: z
      .number({ required_error: 'Price in paise is required.' })
      .int('Price must be an integer paise amount.')
      .min(0, 'Price must be non-negative.'),
    category: z.string().min(1, 'Category is required.').max(100, 'Category must not exceed 100 characters.'),
    image_url: z
      .string({ required_error: 'Image URL is required.' })
      .url('Image URL must be a valid URL.')
      .max(1024, 'Image URL must not exceed 1024 characters.'),
    stock_quantity: z
      .number()
      .int('Stock quantity must be an integer.')
      .min(0, 'Stock quantity cannot be negative.')
      .default(0)
      .optional(),
  })
  .strict({
    message: 'Unrecognized or forbidden fields in product creation payload. Reserved quantity and deleted status cannot be client-specified.',
  });

export const updateProductSchema = z
  .object({
    name: z.string().min(1, 'Product name cannot be empty.').max(255).optional(),
    description: z.string().min(1, 'Description cannot be empty.').max(5000).optional(),
    price_paise: z
      .number()
      .int('Price must be an integer paise amount.')
      .min(0, 'Price must be non-negative.')
      .optional(),
    category: z.string().min(1, 'Category cannot be empty.').max(100).optional(),
    image_url: z.string().url('Image URL must be a valid URL.').max(1024).optional(),
  })
  .strict({
    message: 'Unrecognized or unauthorized fields in product update payload. Stock quantity, reserved quantity, and deleted status cannot be modified via product PATCH.',
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one valid catalog field must be provided for update.' }
  );

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  category: z.string().min(1).max(100).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['price', 'price_asc', 'price_desc', 'name', 'createdAt', 'created_at', 'newest', 'oldest']).optional(),
  sortOrder: z.enum(['asc', 'desc', 'ASC', 'DESC']).optional(),
  inStockOnly: z.coerce.boolean().optional(),
  status: z.enum(['active', 'deleted', 'all']).default('all').optional(),
});

export const listInventoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  category: z.string().min(1).max(100).optional(),
  search: z.string().max(100).optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z
    .enum(['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'REFUNDED'])
    .optional(),
  userId: z.string().uuid('Invalid user ID format.').optional(),
  search: z.string().max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(
      ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'REFUNDED'],
      { required_error: 'Target order status is required.' }
    ),
    note: z.string().max(500, 'Note must not exceed 500 characters.').optional(),
  })
  .strict({
    message: 'Unrecognized or unauthorized fields in status update payload.',
  });

export const listAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  action: z.string().max(100).optional(),
  actorId: z.string().uuid('Invalid actor ID format.').optional(),
  targetResource: z.string().max(100).optional(),
  resourceId: z.string().max(255).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
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
      .refine(
        (items) => {
          const ids = items.map((i) => i.productId);
          return new Set(ids).size === ids.length;
        },
        { message: 'Duplicate product IDs are not permitted in restock payload.' }
      )
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
      const primaryMessage = issues[0]?.message || 'Validation failed';
      return next(new ValidationError(primaryMessage, issues));
    }
    req.query = result.data;
    next();
  };
}

export default {
  productIdParamSchema,
  orderIdParamSchema,
  createProductSchema,
  updateProductSchema,
  listProductsQuerySchema,
  listInventoryQuerySchema,
  listOrdersQuerySchema,
  updateOrderStatusSchema,
  listAuditLogsQuerySchema,
  refundOrderSchema,
  restockOrderSchema,
  validateBody,
  validateParams,
  validateQuery,
};
