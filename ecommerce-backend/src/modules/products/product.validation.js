import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';

export const listProductsQuerySchema = z.object({
  page: z
    .coerce
    .number({ invalid_type_error: 'Page must be a valid number' })
    .int('Page must be an integer')
    .min(1, 'Page must be at least 1')
    .default(1),
  limit: z
    .coerce
    .number({ invalid_type_error: 'Limit must be a valid number' })
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(50, 'Limit cannot exceed 50 items per page')
    .default(10),
  category: z
    .string()
    .trim()
    .min(1, 'Category cannot be empty')
    .max(100, 'Category cannot exceed 100 characters')
    .optional(),
  search: z
    .string()
    .trim()
    .max(100, 'Search query cannot exceed 100 characters')
    .optional(),
  sortBy: z
    .enum(['price', 'price_asc', 'price_desc', 'name', 'created_at', 'createdAt', 'newest', 'oldest'], {
      errorMap: () => ({ message: 'Invalid sort field. Allowed values: price, price_asc, price_desc, name, created_at, newest, oldest' }),
    })
    .optional(),
  sortOrder: z
    .enum(['asc', 'desc', 'ASC', 'DESC'], {
      errorMap: () => ({ message: 'Invalid sort order. Allowed values: asc, desc' }),
    })
    .optional(),
  inStockOnly: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        const lower = val.toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
      }
      return val;
    }, z.boolean().optional())
    .optional(),
});

export const productParamSchema = z.object({
  id: z
    .string({ required_error: 'Product ID is required' })
    .uuid('Invalid product ID format. Must be a valid UUIDv4.'),
});

/**
 * Express middleware factory for validating request query parameters with Zod.
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
  listProductsQuerySchema,
  productParamSchema,
  validateQuery,
  validateParams,
};
