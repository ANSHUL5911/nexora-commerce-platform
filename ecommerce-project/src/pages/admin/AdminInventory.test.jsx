import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminInventory } from './components/AdminInventory.jsx';
import { adminApi } from '../../api/admin.js';

vi.mock('../../api/admin.js', () => ({
  adminApi: {
    getInventory: vi.fn(),
  },
}));

describe('AdminInventory Component (Phase 07.26B)', () => {
  const mockInventory = [
    {
      productId: 'p0000000-0000-4000-8000-000000000001',
      name: 'Derby Suede Boot',
      category: 'Footwear',
      stockQuantity: 10,
      reservedQuantity: 2,
      availableQuantity: 8,
      updatedAt: '2026-09-20T10:00:00Z',
    },
    {
      productId: 'p0000000-0000-4000-8000-000000000002',
      name: 'Leather Cardholder',
      category: 'Leatherware',
      stockQuantity: 4,
      reservedQuantity: 1,
      availableQuantity: 3,
      updatedAt: '2026-09-20T11:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.getInventory.mockResolvedValue({
      data: mockInventory,
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });
  });

  it('renders inventory table with stock, reserved, and available quantities', async () => {
    render(<AdminInventory />);

    expect(await screen.findByRole('heading', { level: 2, name: /inventory operations/i })).toBeInTheDocument();
    expect(screen.getByText('Derby Suede Boot')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // stock
    expect(screen.getByText('2')).toBeInTheDocument(); // reserved
    expect(screen.getByText('8')).toBeInTheDocument(); // available
    expect(screen.getByText('Leather Cardholder')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // low stock available
  });

  it('toggles low-stock filter and calls getInventory with lowStockOnly: true', async () => {
    const user = userEvent.setup();
    render(<AdminInventory />);

    await screen.findByText('Derby Suede Boot');

    const lowStockCheckbox = screen.getByLabelText(/low stock attention only/i);
    await user.click(lowStockCheckbox);

    expect(adminApi.getInventory).toHaveBeenCalledWith(
      expect.objectContaining({ lowStockOnly: true })
    );
  });

  it('filters inventory by search query', async () => {
    const user = userEvent.setup();
    render(<AdminInventory />);

    await screen.findByText('Derby Suede Boot');

    const searchInput = screen.getByPlaceholderText(/search by product name/i);
    await user.type(searchInput, 'Derby');

    const searchBtn = screen.getByRole('button', { name: /^search$/i });
    await user.click(searchBtn);

    expect(adminApi.getInventory).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Derby' })
    );
  });
});
