import { z } from 'zod';
import { ValidationError } from '../../utils/errors.js';

export const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .max(255, 'Email cannot exceed 255 characters')
    .transform((val) => val.toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters'),
  full_name: z
    .string({ required_error: 'Full name is required' })
    .trim()
    .min(1, 'Full name cannot be empty')
    .max(255, 'Full name cannot exceed 255 characters'),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .max(255, 'Email cannot exceed 255 characters')
    .transform((val) => val.toLowerCase()),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

/**
 * Express middleware factory for validating request body with Zod schema.
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
  registerSchema,
  loginSchema,
  validateBody,
};
