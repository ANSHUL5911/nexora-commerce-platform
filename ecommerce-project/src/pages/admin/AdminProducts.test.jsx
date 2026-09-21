import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminProducts } from './components/AdminProducts.jsx';
import { adminApi } from '../../api/admin.js';

vi.mock('../../api/admin.js', () => ({
  adminApi: {
    listProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
  },
}));

describe('AdminProducts Component (Phase 07.26B)', () => {
  const mockProducts = [
    {
      id: 'p0000000-0000-4000-8000-000000000001',
      name: 'Chelsea Boot',
      description: 'Handmade Italian leather boots',
      category: 'Footwear',
      pricePaise: 2450000,
      image_url: 'https://images.unsplash.com/boot.jpg',
      stockQuantity: 15,
      reservedQuantity: 3,
      availableQuantity: 12,
      isDeleted: false,
      createdAt: '2026-09-20T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.listProducts.mockResolvedValue({
      data: mockProducts,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('renders products table with name, category, price in INR, stock and status', async () => {
    render(<AdminProducts />);

    expect(await screen.findByRole('heading', { level: 2, name: /catalog management/i })).toBeInTheDocument();
    expect(screen.getByText('Chelsea Boot')).toBeInTheDocument();
    expect(screen.getByText('Footwear')).toBeInTheDocument();
    expect(screen.getByText('₹24500.00')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument(); // stock
    expect(screen.getByText('12')).toBeInTheDocument(); // available
    expect(screen.getAllByText(/active/i).length).toBeGreaterThanOrEqual(1);
  });

  it('creates new product converting price from INR to integer paise', async () => {
    const user = userEvent.setup();
    adminApi.createProduct.mockResolvedValue({
      data: { id: 'p-new', name: 'New Loafer' },
    });

    render(<AdminProducts />);

    const addBtn = await screen.findByRole('button', { name: /\+ add product/i });
    await user.click(addBtn);

    expect(screen.getByRole('heading', { name: /add new product/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/product name/i), { target: { value: 'Suede Loafer' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Footwear' } });
    fireEvent.change(screen.getByLabelText(/price \(inr/i), { target: { value: '150.50' } });
    fireEvent.change(screen.getByLabelText(/image url/i), { target: { value: 'https://example.com/loafer.jpg' } });
    fireEvent.change(screen.getByLabelText(/initial stock quantity/i), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Premium soft suede loafers' } });

    const submitBtn = screen.getByRole('button', { name: /create product/i });
    await user.click(submitBtn);

    expect(adminApi.createProduct).toHaveBeenCalledWith({
      name: 'Suede Loafer',
      category: 'Footwear',
      price_paise: 15050, // 150.50 * 100 paise
      image_url: 'https://example.com/loafer.jpg',
      stock_quantity: 25,
      description: 'Premium soft suede loafers',
    });
  });

  it('edits product and strictly isolates catalog fields without sending stock', async () => {
    const user = userEvent.setup();
    adminApi.updateProduct.mockResolvedValue({
      data: { ...mockProducts[0], name: 'Updated Chelsea Boot' },
    });

    render(<AdminProducts />);

    const editBtn = await screen.findByRole('button', { name: /edit product chelsea boot/i });
    await user.click(editBtn);

    expect(screen.getByRole('heading', { name: /edit catalog product/i })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/product name/i);
    fireEvent.change(nameInput, { target: { value: 'Updated Chelsea Boot' } });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(saveBtn);

    expect(adminApi.updateProduct).toHaveBeenCalledWith(
      'p0000000-0000-4000-8000-000000000001',
      expect.objectContaining({
        name: 'Updated Chelsea Boot',
      })
    );

    // Verify stock_quantity is NOT passed in update payload
    const passedPayload = adminApi.updateProduct.mock.calls[0][1];
    expect(passedPayload).not.toHaveProperty('stock_quantity');
    expect(passedPayload).not.toHaveProperty('reserved_quantity');
  });

  it('confirms and soft-deletes product', async () => {
    const user = userEvent.setup();
    adminApi.deleteProduct.mockResolvedValue({
      success: true,
      message: 'Product deleted successfully.',
    });

    render(<AdminProducts />);

    const deleteBtn = await screen.findByRole('button', { name: /deactivate product chelsea boot/i });
    await user.click(deleteBtn);

    expect(screen.getByRole('heading', { name: /deactivate product/i })).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /confirm deactivation/i });
    await user.click(confirmBtn);

    expect(adminApi.deleteProduct).toHaveBeenCalledWith('p0000000-0000-4000-8000-000000000001');
  });
});
