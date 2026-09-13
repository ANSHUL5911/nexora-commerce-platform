import { Op } from 'sequelize';
import { AuditLog, User } from '../../models/index.js';
import { toAuditLogDTO } from './admin.dto.js';

/**
 * Keys that must NEVER be stored in audit logs.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'secret',
  'session',
  'sessionId',
  'token',
  'guestToken',
  'guest_token',
  'guest_token_hash',
  'csrf',
  'csrfToken',
  'key_secret',
  'razorpay_signature',
  'signature',
  'card',
  'cvv',
  'authHeader',
  'authorization',
  'cookie',
]);

/**
 * Recursively sanitize metadata to remove sensitive tokens or secrets.
 * @param {any} value
 * @returns {any}
 */
function sanitizeAuditMetadata(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeAuditMetadata);
  }

  const clean = {};
  for (const [k, v] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase())) {
      continue;
    }
    clean[k] = sanitizeAuditMetadata(v);
  }
  return clean;
}

export const auditService = {
  /**
   * Atomically record an administrative action in the audit_logs table.
   *
   * @param {{
   *   actorId: string,
   *   action: string,
   *   targetResource: string,
   *   resourceId?: string,
   *   ipAddress: string,
   *   detailsJson?: object,
   *   transaction?: import('sequelize').Transaction
   * }} params
   * @returns {Promise<AuditLog>}
   */
  async recordAuditLog({
    actorId,
    action,
    targetResource,
    resourceId = null,
    ipAddress = '127.0.0.1',
    detailsJson = null,
    transaction,
  }) {
    const safeDetails = detailsJson ? sanitizeAuditMetadata(detailsJson) : null;

    return AuditLog.create(
      {
        actor_id: actorId,
        action,
        target_resource: targetResource,
        resource_id: resourceId ? String(resourceId) : null,
        ip_address: ipAddress || '127.0.0.1',
        details_json: safeDetails,
      },
      { transaction }
    );
  },

  /**
   * List paginated audit logs with multi-parameter filtering and deterministic ordering.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   action?: string,
   *   actorId?: string,
   *   targetResource?: string,
   *   resourceId?: string,
   *   startDate?: Date,
   *   endDate?: Date,
   * }} query
   * @returns {Promise<{
   *   auditLogs: ReturnType<typeof toAuditLogDTO>[],
   *   pagination: { page: number, limit: number, total: number, totalPages: number }
   * }>}
   */
  async listAuditLogs(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    const whereConditions = {};

    if (query.action) {
      whereConditions.action = query.action;
    }

    if (query.actorId) {
      whereConditions.actor_id = query.actorId;
    }

    if (query.targetResource) {
      whereConditions.target_resource = query.targetResource;
    }

    if (query.resourceId) {
      whereConditions.resource_id = query.resourceId;
    }

    if (query.startDate || query.endDate) {
      whereConditions.created_at = {};
      if (query.startDate) {
        whereConditions.created_at[Op.gte] = query.startDate;
      }
      if (query.endDate) {
        whereConditions.created_at[Op.lte] = query.endDate;
      }
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: User,
          as: 'actor',
          attributes: ['id', 'email', 'full_name', 'role'],
        },
      ],
      order: [
        ['created_at', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset,
      distinct: true,
    });

    const totalPages = Math.ceil(count / limit) || (count === 0 ? 0 : 1);
    const auditLogs = rows.map(toAuditLogDTO);

    return {
      auditLogs,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
      },
    };
  },
};

export default auditService;
