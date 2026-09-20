import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderRestockModal } from './components/OrderRestockModal.jsx';
import { adminApi } from '../../api/admin.js';

vi.mock('../../api/admin.js', () => ({
  adminApi: {
    restockOrder: vi.fn(),
  },
}));

describe('OrderRestockModal Component (Phase 07.26B)', () => {
  const refundedOrder = {
    id: 'o0000000-0000-4000-8000-000000000001',
    orderStatus: 'REFUNDED',
    items: [
      {
        id: 'oi-1',
        productId: 'p0000000-0000-4000-8000-000000000001',
        productName: 'Oxford Classic',
        quantity: 3,
        quantityRestocked: 1,
        remainingRestockableQuantity: 2,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders eligible items with remaining restockable quantity', () => {
    render(
      <OrderRestockModal
        isOpen={true}
        onClose={vi.fn()}
        order={refundedOrder}
        onRestockSuccess={vi.fn()}
      />
    );

    expect(screen.getByText(/restock refunded order items/i)).toBeInTheDocument();
    expect(screen.getByText('Oxford Classic')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // remaining
  });

  it('validates that reason is required before submitting', async () => {
    const user = userEvent.setup();
    render(
      <OrderRestockModal
        isOpen={true}
        onClose={vi.fn()}
        order={refundedOrder}
        onRestockSuccess={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /confirm restock/i });
    await user.click(submitBtn);

    expect(adminApi.restockOrder).not.toHaveBeenCalled();
  });

  it('submits restock with bounded items and reason', async () => {
    const user = userEvent.setup();
    adminApi.restockOrder.mockResolvedValue({
      data: { orderId: refundedOrder.id, totalQuantityRestocked: 2 },
    });

    const handleSuccess = vi.fn();
    render(
      <OrderRestockModal
        isOpen={true}
        onClose={vi.fn()}
        order={refundedOrder}
        onRestockSuccess={handleSuccess}
      />
    );

    const reasonInput = screen.getByPlaceholderText(/items returned to warehouse/i);
    await user.type(reasonInput, 'Returned by courier in pristine condition');

    const submitBtn = screen.getByRole('button', { name: /confirm restock/i });
    await user.click(submitBtn);

    expect(adminApi.restockOrder).toHaveBeenCalledWith(
      refundedOrder.id,
      {
        reason: 'Returned by courier in pristine condition',
        items: [
          {
            productId: 'p0000000-0000-4000-8000-000000000001',
            quantity: 2,
          },
        ],
      }
    );
    expect(handleSuccess).toHaveBeenCalled();
  });
});
