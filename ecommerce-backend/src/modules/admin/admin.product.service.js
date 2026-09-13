import { sequelize } from '../../config/database.js';
import { productRepository } from '../products/product.repository.js';
import { auditService } from './admin.audit.service.js';
import { toAdminProductDTO } from './admin.dto.js';
import { NotFoundError } from '../../utils/errors.js';

export const adminProductService = {
  /**
   * List products with administrative filters (including active, deleted, or all).
   *
   * @param {{
   *   page?: number,
   *   limit?: number,
   *   category?: string,
   *   search?: string,
   *   sortBy?: string,
   *   sortOrder?: string,
   *   inStockOnly?: boolean,
   *   status?: 'active' | 'deleted' | 'all'
   * }} query
   * @returns {Promise<{
   *   products: ReturnType<typeof toAdminProductDTO>[],
   *   pagination: { page: number, limit: number, total: number, totalPages: number }
   * }>}
   */
  async listProducts(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));

    const { rows, count } = await productRepository.findAndCountAllAdmin({
      page,
      limit,
      category: query.category,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      inStockOnly: Boolean(query.inStockOnly),
      status: query.status || 'all',
    });

    const totalPages = Math.ceil(count / limit) || (count === 0 ? 0 : 1);
    const products = rows.map((product) => toAdminProductDTO(product));

    return {
      products,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
      },
    };
  },

  /**
   * Retrieve a single product by UUID for administrative view (including deleted).
   *
   * @param {string} id
   * @returns {Promise<ReturnType<typeof toAdminProductDTO>>}
   */
  async getProductById(id) {
    const product = await productRepository.findByIdAdmin(id);

    if (!product) {
      throw new NotFoundError(`Product with ID '${id}' was not found.`, 'PRODUCT_NOT_FOUND');
    }

    return toAdminProductDTO(product);
  },

  /**
   * Create a new product in the catalog with initial stock.
   * Atomic audit logging inside the transaction.
   *
   * @param {{
   *   name: string,
   *   description: string,
   *   price_paise: number,
   *   category: string,
   *   image_url: string,
   *   stock_quantity?: number
   * }} data
   * @param {{ adminId: string, ipAddress?: string }} context
   * @returns {Promise<ReturnType<typeof toAdminProductDTO>>}
   */
  async createProduct(data, { adminId, ipAddress = '127.0.0.1' }) {
    return sequelize.transaction(async (tx) => {
      const stockQuantity = Math.max(0, Number(data.stock_quantity ?? 0));

      const product = await productRepository.createProduct(
        {
          name: data.name.trim(),
          description: data.description.trim(),
          price_paise: data.price_paise,
          category: data.category.trim(),
          image_url: data.image_url.trim(),
          stock_quantity: stockQuantity,
          reserved_quantity: 0,
          is_deleted: false,
        },
        { transaction: tx }
      );

      await auditService.recordAuditLog({
        actorId: adminId,
        action: 'ADMIN_CREATE_PRODUCT',
        targetResource: 'products',
        resourceId: product.id,
        ipAddress,
        detailsJson: {
          name: product.name,
          category: product.category,
          price_paise: product.price_paise,
          stock_quantity: product.stock_quantity,
        },
        transaction: tx,
      });

      return toAdminProductDTO(product);
    });
  },

  /**
   * Update catalog-owned attributes of an existing product.
   * Modifying stock_quantity, reserved_quantity, or is_deleted is strictly prohibited here.
   * Atomic audit logging inside the transaction.
   *
   * @param {string} id
   * @param {{
   *   name?: string,
   *   description?: string,
   *   price_paise?: number,
   *   category?: string,
   *   image_url?: string
   * }} data
   * @param {{ adminId: string, ipAddress?: string }} context
   * @returns {Promise<ReturnType<typeof toAdminProductDTO>>}
   */
  async updateProduct(id, data, { adminId, ipAddress = '127.0.0.1' }) {
    return sequelize.transaction(async (tx) => {
      const product = await productRepository.findByIdAdmin(id, {
        transaction: tx,
        lock: true,
      });

      if (!product || product.is_deleted) {
        throw new NotFoundError(`Product with ID '${id}' was not found.`, 'PRODUCT_NOT_FOUND');
      }

      const updatePayload = {};
      if (data.name !== undefined) updatePayload.name = data.name.trim();
      if (data.description !== undefined) updatePayload.description = data.description.trim();
      if (data.price_paise !== undefined) updatePayload.price_paise = data.price_paise;
      if (data.category !== undefined) updatePayload.category = data.category.trim();
      if (data.image_url !== undefined) updatePayload.image_url = data.image_url.trim();

      await productRepository.updateProduct(id, updatePayload, { transaction: tx });

      const updatedProduct = await productRepository.findByIdAdmin(id, { transaction: tx });

      await auditService.recordAuditLog({
        actorId: adminId,
        action: 'ADMIN_UPDATE_PRODUCT',
        targetResource: 'products',
        resourceId: id,
        ipAddress,
        detailsJson: updatePayload,
        transaction: tx,
      });

      return toAdminProductDTO(updatedProduct);
    });
  },

  /**
   * Soft-delete a product from the catalog (sets is_deleted = true).
   * Preserves historical OrderItems and order snapshots.
   *
   * @param {string} id
   * @param {{ adminId: string, ipAddress?: string }} context
   * @returns {Promise<{ success: boolean, message: string, id: string }>}
   */
  async deleteProduct(id, { adminId, ipAddress = '127.0.0.1' }) {
    return sequelize.transaction(async (tx) => {
      const product = await productRepository.findByIdAdmin(id, {
        transaction: tx,
        lock: true,
      });

      if (!product || product.is_deleted) {
        throw new NotFoundError(`Product with ID '${id}' was not found.`, 'PRODUCT_NOT_FOUND');
      }

      await productRepository.softDeleteProduct(id, { transaction: tx });

      await auditService.recordAuditLog({
        actorId: adminId,
        action: 'ADMIN_DELETE_PRODUCT',
        targetResource: 'products',
        resourceId: id,
        ipAddress,
        detailsJson: { name: product.name },
        transaction: tx,
      });

      return {
        success: true,
        message: 'Product deleted successfully.',
        id,
      };
    });
  },
};

export default adminProductService;
