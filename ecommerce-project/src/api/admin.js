import apiClient, { generateIdempotencyKey } from './client.js';

/**
 * Admin API Service
 * Interacts with /api/admin/* endpoints (RBAC admin required).
 */
export const adminApi = {
  /**
   * List catalog products with administrative filters (active, deleted, or all).
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   category?: string,
   *   search?: string,
   *   sortBy?: string,
   *   sortOrder?: string,
   *   inStockOnly?: boolean,
   *   status?: 'active'|'deleted'|'all'
   * }} [params]
   */
  async listProducts(params = {}) {
    const response = await apiClient.get('/admin/products', { params });
    return response.data;
  },

  /**
   * Retrieve single product by UUID for administrative view.
   *
   * @param {string} id
   */
  async getProduct(id) {
    const response = await apiClient.get(`/admin/products/${id}`);
    return response.data;
  },

  /**
   * Create a new catalog product with initial stock.
   *
   * @param {{
   *   name: string,
   *   description: string,
   *   price_paise: number,
   *   category: string,
   *   image_url: string,
   *   stock_quantity?: number
   * }} payload
   */
  async createProduct(payload) {
    const response = await apiClient.post('/admin/products', payload);
    return response.data;
  },

  /**
   * Update catalog-owned fields of a product (stock and reserved quantities rejected).
   *
   * @param {string} id
   * @param {{
   *   name?: string,
   *   description?: string,
   *   price_paise?: number,
   *   category?: string,
   *   image_url?: string
   * }} payload
   */
  async updateProduct(id, payload) {
    const response = await apiClient.patch(`/admin/products/${id}`, payload);
    return response.data;
  },

  /**
   * Soft-delete product from catalog.
   *
   * @param {string} id
   */
  async deleteProduct(id) {
    const response = await apiClient.delete(`/admin/products/${id}`);
    return response.data;
  },

  /**
   * Operational overview of catalog inventory levels (Read-only).
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   category?: string,
   *   search?: string,
   *   lowStockOnly?: boolean
   * }} [params]
   */
  async getInventory(params = {}) {
    const response = await apiClient.get('/admin/inventory', { params });
    return response.data;
  },

  /**
   * Paginated list of all system orders with multi-parameter filtering.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   status?: string,
   *   userId?: string,
   *   search?: string,
   *   startDate?: string,
   *   endDate?: string
   * }} [params]
   */
  async listOrders(params = {}) {
    const response = await apiClient.get('/admin/orders', { params });
    return response.data;
  },

  /**
   * Comprehensive operational order details.
   *
   * @param {string} orderId
   */
  async getOrder(orderId) {
    const response = await apiClient.get(`/admin/orders/${orderId}`);
    return response.data;
  },

  /**
   * Explicit order state machine transition.
   *
   * @param {string} orderId
   * @param {{
   *   status: 'PENDING_PAYMENT'|'PAID'|'PROCESSING'|'SHIPPED'|'DELIVERED'|'CANCELLED'|'EXPIRED'|'REFUNDED',
   *   note?: string
   * }} payload
   */
  async updateOrderStatus(orderId, payload) {
    const response = await apiClient.patch(`/admin/orders/${orderId}/status`, payload);
    return response.data;
  },

  /**
   * Administrative full refund for a settled order (Phase 07.12).
   *
   * @param {string} orderId
   * @param {{ reason?: string }} [payload]
   * @param {string} [idempotencyKey]
   */
  async refundOrder(orderId, payload = {}, idempotencyKey = generateIdempotencyKey()) {
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const response = await apiClient.post(`/admin/orders/${orderId}/refund`, payload, { headers });
    return response.data;
  },

  /**
   * Administrative explicit inventory restocking for a refunded order (Phase 07.12).
   *
   * @param {string} orderId
   * @param {{ reason: string, items?: Array<{ productId: string, quantity: number }> }} payload
   * @param {string} [idempotencyKey]
   */
  async restockOrder(orderId, payload, idempotencyKey = generateIdempotencyKey()) {
    const headers = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const response = await apiClient.post(`/admin/orders/${orderId}/restock`, payload, { headers });
    return response.data;
  },

  /**
   * Paginated query over immutable operational audit logs.
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   action?: string,
   *   actorId?: string,
   *   targetResource?: string,
   *   resourceId?: string,
   *   startDate?: string,
   *   endDate?: string
   * }} [params]
   */
  async listAuditLogs(params = {}) {
    const response = await apiClient.get('/admin/audit-logs', { params });
    return response.data;
  },
};

export default adminApi;
