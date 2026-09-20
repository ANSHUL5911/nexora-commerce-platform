import { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal.jsx';
import { adminApi } from '../../../api/admin.js';

/**
 * ProductFormModal Component (Phase 07.26B)
 * Modal form for creating a new catalog product or editing catalog attributes of an existing product.
 * Handles integer paise conversion at the API boundary (Input: INR, Submission: integer paise).
 */
export function ProductFormModal({ isOpen, onClose, product, onProductSaved }) {
  const isEditing = Boolean(product);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priceInRupees, setPriceInRupees] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [stockQuantity, setStockQuantity] = useState('0');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setDescription(product.description || '');
      setCategory(product.category || '');
      setPriceInRupees(
        product.price_paise !== undefined
          ? (Number(product.price_paise) / 100).toFixed(2)
          : product.pricePaise !== undefined
          ? (Number(product.pricePaise) / 100).toFixed(2)
          : ''
      );
      setImageUrl(product.image_url || product.imageUrl || '');
      setStockQuantity(String(product.stock_quantity ?? product.stockQuantity ?? 0));
    } else {
      setName('');
      setDescription('');
      setCategory('');
      setPriceInRupees('');
      setImageUrl('');
      setStockQuantity('0');
    }
    setError(null);
  }, [product, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    const trimmedName = name.trim();
    const trimmedDesc = description.trim();
    const trimmedCategory = category.trim();
    const trimmedImage = imageUrl.trim();
    const parsedPrice = parseFloat(priceInRupees);

    if (!trimmedName) {
      setError('Product name is required.');
      return;
    }
    if (!trimmedDesc) {
      setError('Description is required.');
      return;
    }
    if (!trimmedCategory) {
      setError('Category is required.');
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Price in ₹ must be a non-negative number.');
      return;
    }
    if (!trimmedImage.startsWith('http://') && !trimmedImage.startsWith('https://')) {
      setError('Image URL must be a valid http or https URL.');
      return;
    }

    const pricePaise = Math.round(parsedPrice * 100);

    setSubmitting(true);
    try {
      let savedProduct;
      if (isEditing) {
        // Strict invariant: updateProduct only sends catalog fields
        const payload = {
          name: trimmedName,
          description: trimmedDesc,
          category: trimmedCategory,
          price_paise: pricePaise,
          image_url: trimmedImage,
        };
        const response = await adminApi.updateProduct(product.id, payload);
        savedProduct = response?.data;
      } else {
        // createProduct allows initial stock quantity
        const initialStock = Math.max(0, parseInt(stockQuantity, 10) || 0);
        const payload = {
          name: trimmedName,
          description: trimmedDesc,
          category: trimmedCategory,
          price_paise: pricePaise,
          image_url: trimmedImage,
          stock_quantity: initialStock,
        };
        const response = await adminApi.createProduct(payload);
        savedProduct = response?.data;
      }

      if (onProductSaved) {
        onProductSaved(savedProduct);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save product:', err);
      const msg = err.response?.data?.error?.message || err.message || 'Failed to save product.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? undefined : onClose}
      title={isEditing ? 'Edit Catalog Product' : 'Add New Product'}
      maxWidth="600px"
      ariaLabel={isEditing ? 'Edit Catalog Product Modal' : 'Add New Product Modal'}
    >
      <form onSubmit={handleSubmit} className="nx-admin-modal-form">
        <div className="nx-admin-field-group">
          <label htmlFor="product-name" className="nx-admin-form-label">
            Product Name <span className="nx-required">*</span>
          </label>
          <input
            id="product-name"
            type="text"
            className="nx-admin-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={255}
            disabled={submitting}
          />
        </div>

        <div className="nx-admin-grid-2col">
          <div className="nx-admin-field-group">
            <label htmlFor="product-category" className="nx-admin-form-label">
              Category <span className="nx-required">*</span>
            </label>
            <input
              id="product-category"
              type="text"
              className="nx-admin-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Footwear, Leatherware"
              required
              maxLength={100}
              disabled={submitting}
            />
          </div>

          <div className="nx-admin-field-group">
            <label htmlFor="product-price" className="nx-admin-form-label">
              Price (INR ₹) <span className="nx-required">*</span>
            </label>
            <input
              id="product-price"
              type="number"
              step="0.01"
              min="0"
              className="nx-admin-input"
              value={priceInRupees}
              onChange={(e) => setPriceInRupees(e.target.value)}
              placeholder="0.00"
              required
              disabled={submitting}
            />
            <span className="nx-admin-form-help">Converted to integer paise on submission</span>
          </div>
        </div>

        <div className="nx-admin-field-group">
          <label htmlFor="product-image" className="nx-admin-form-label">
            Image URL <span className="nx-required">*</span>
          </label>
          <input
            id="product-image"
            type="url"
            className="nx-admin-input"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/..."
            required
            maxLength={1024}
            disabled={submitting}
          />
        </div>

        {!isEditing ? (
          <div className="nx-admin-field-group">
            <label htmlFor="product-stock" className="nx-admin-form-label">
              Initial Stock Quantity
            </label>
            <input
              id="product-stock"
              type="number"
              min="0"
              step="1"
              className="nx-admin-input"
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              disabled={submitting}
            />
            <span className="nx-admin-form-help">
              Initial warehouse units available. Subsequent stock adjustments occur via operational restocking.
            </span>
          </div>
        ) : (
          <div className="nx-admin-callout is-info">
            <span>
              <strong>Inventory Separation:</strong> Product stock level ({stockQuantity} units) cannot be modified
              via catalog update. Stock increments occur through operational restocking of refunded orders.
            </span>
          </div>
        )}

        <div className="nx-admin-field-group">
          <label htmlFor="product-desc" className="nx-admin-form-label">
            Description <span className="nx-required">*</span>
          </label>
          <textarea
            id="product-desc"
            className="nx-admin-textarea"
            rows="4"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            maxLength={5000}
            disabled={submitting}
          />
        </div>

        {error && (
          <div className="nx-admin-form-error" role="alert">
            {error}
          </div>
        )}

        <div className="nx-admin-modal-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button-primary"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default ProductFormModal;
