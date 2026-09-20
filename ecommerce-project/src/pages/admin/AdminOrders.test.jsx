import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminOrders } from './components/AdminOrders.jsx';
import { adminApi } from '../../api/admin.js';

vi.mock('../../api/admin.js', () => ({
  adminApi: {
    listOrders: vi.fn(),
    getOrder: vi.fn(),
    updateOrderStatus: vi.fn(),
    refundOrder: vi.fn(),
    restockOrder: vi.fn(),
  },
}));

describe('AdminOrders Component (Phase 07.26B)', () => {
  const mockOrders = [
    {
      id: 'o0000000-0000-4000-8000-000000000001',
      customer: { fullName: 'Jane Doe', email: 'jane@example.com' },
      itemCount: 2,
      totalCostPaise: 3700000,
      orderStatus: 'PAID',
      paymentStatus: 'SUCCESS',
      createdAt: '2026-09-20T10:00:00Z',
    },
    {
      id: 'o0000000-0000-4000-8000-000000000002',
      customer: { fullName: 'Bob Smith', email: 'bob@example.com' },
      itemCount: 1,
      totalCostPaise: 1850000,
      orderStatus: 'PENDING_PAYMENT',
      paymentStatus: 'INITIATED',
      createdAt: '2026-09-20T11:00:00Z',
    },
  ];

  const mockOrderDetail = {
    id: 'o0000000-0000-4000-8000-000000000001',
    orderStatus: 'PAID',
    totalCostPaise: 3700000,
    subtotalPaise: 3700000,
    shippingFeePaise: 0,
    customer: { fullName: 'Jane Doe', email: 'jane@example.com', id: 'c-1' },
    shippingAddress: {
      fullName: 'Jane Doe',
      addressLine1: '123 Main St',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400001',
      phone: '9876543210',
    },
    items: [
      {
        id: 'oi-1',
        productId: 'p-1',
        productName: 'Handcrafted Oxford',
        unitPricePaise: 1850000,
        quantity: 2,
        lineTotalPaise: 3700000,
        quantityRestocked: 0,
        remainingRestockableQuantity: 0,
      },
    ],
    paymentAttempts: [
      {
        id: 'pa-1',
        attemptNumber: 1,
        razorpayOrderId: 'order_rzp123',
        razorpayPaymentId: 'pay_rzp456',
        status: 'SUCCESS',
        amountPaise: 3700000,
        createdAt: '2026-09-20T10:05:00Z',
      },
    ],
    restockLogs: [],
    isRefundEligible: true,
    isRestockEligible: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.listOrders.mockResolvedValue({
      data: mockOrders,
      pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
    });
    adminApi.getOrder.mockResolvedValue({
      data: mockOrderDetail,
    });
  });

  it('renders order list with order ID, customer, amount, and status', async () => {
    render(<AdminOrders />);

    expect(await screen.findByRole('heading', { level: 2, name: /order management/i })).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/i)).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText(/Bob Smith/i)).toBeInTheDocument();
    expect(screen.getByText('₹37000.00')).toBeInTheDocument();
  });

  it('filters orders by status dropdown', async () => {
    const user = userEvent.setup();
    render(<AdminOrders />);

    await screen.findByText(/Jane Doe/i);

    const statusSelect = screen.getByLabelText(/filter status:/i);
    await user.selectOptions(statusSelect, 'PAID');

    expect(adminApi.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PAID' })
    );
  });

  it('searches orders by query', async () => {
    const user = userEvent.setup();
    render(<AdminOrders />);

    await screen.findByText(/Jane Doe/i);

    const searchInput = screen.getByPlaceholderText(/search by customer name/i);
    await user.type(searchInput, 'Jane');

    const searchBtn = screen.getByRole('button', { name: /^search$/i });
    await user.click(searchBtn);

    expect(adminApi.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Jane' })
    );
  });

  it('opens order detail inspector on inspect button click', async () => {
    const user = userEvent.setup();
    render(<AdminOrders />);

    const inspectButtons = await screen.findAllByRole('button', { name: /^inspect/i });
    await user.click(inspectButtons[0]);

    expect(adminApi.getOrder).toHaveBeenCalledWith('o0000000-0000-4000-8000-000000000001');
    expect(await screen.findByText('Customer Information')).toBeInTheDocument();
    expect(screen.getByText('Shipping Address')).toBeInTheDocument();
    expect(screen.getByText('Handcrafted Oxford')).toBeInTheDocument();
    expect(screen.getByText('order_rzp123')).toBeInTheDocument();
  });

  it('allows advancing status within allowed state machine transitions', async () => {
    const user = userEvent.setup();
    adminApi.updateOrderStatus.mockResolvedValue({
      data: { ...mockOrderDetail, orderStatus: 'PROCESSING' },
    });

    render(<AdminOrders />);

    const inspectButtons = await screen.findAllByRole('button', { name: /^inspect/i });
    await user.click(inspectButtons[0]);

    await screen.findByText('Customer Information');

    // PAID order allows PROCESSING
    const statusSelect = screen.getByLabelText(/advance status to:/i);
    expect(screen.getByRole('option', { name: 'PROCESSING' })).toBeInTheDocument();

    await user.selectOptions(statusSelect, 'PROCESSING');

    const advanceBtn = screen.getByRole('button', { name: /advance status/i });
    await user.click(advanceBtn);

    expect(adminApi.updateOrderStatus).toHaveBeenCalledWith(
      'o0000000-0000-4000-8000-000000000001',
      expect.objectContaining({ status: 'PROCESSING' })
    );
  });

  it('opens refund modal when Issue Full Refund is clicked and issues refund with reason', async () => {
    const user = userEvent.setup();
    adminApi.refundOrder.mockResolvedValue({
      data: { orderId: 'o0000000-0000-4000-8000-000000000001', orderStatus: 'REFUNDED' },
    });

    render(<AdminOrders />);

    const inspectButtons = await screen.findAllByRole('button', { name: /^inspect/i });
    await user.click(inspectButtons[0]);

    const refundBtn = await screen.findByRole('button', { name: /issue full refund/i });
    await user.click(refundBtn);

    expect(screen.getByText(/issue full order refund/i)).toBeInTheDocument();

    const reasonInput = screen.getByPlaceholderText(/customer requested refund/i);
    await user.type(reasonInput, 'Damaged during transit');

    const confirmBtn = screen.getByRole('button', { name: /confirm full refund/i });
    await user.click(confirmBtn);

    expect(adminApi.refundOrder).toHaveBeenCalledWith(
      'o0000000-0000-4000-8000-000000000001',
      { reason: 'Damaged during transit' }
    );
  });
});
