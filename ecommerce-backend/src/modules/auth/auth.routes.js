import { Router } from 'express';
import { register, login, logout, getCurrentUser } from './auth.controller.js';
import { registerSchema, loginSchema, validateBody } from './auth.validation.js';
import { requireAuth } from './auth.middleware.js';
import { authLimiter } from '../../middleware/rateLimiter.js';

export const authRouter = Router();

// 1. Customer Registration (5 req / min / IP rate limit)
authRouter.post('/register', authLimiter, validateBody(registerSchema), register);

// 2. Customer & Admin Login (5 req / min / IP rate limit)
authRouter.post('/login', authLimiter, validateBody(loginSchema), login);

// 3. Logout (Idempotent session revocation & cookie clearing)
authRouter.post('/logout', logout);

// 4. Current Authenticated User Inspection
authRouter.get('/me', requireAuth, getCurrentUser);

export default authRouter;
