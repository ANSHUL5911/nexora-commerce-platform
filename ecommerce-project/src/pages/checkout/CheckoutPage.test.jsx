import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { CheckoutPage } from './CheckoutPage';
import { checkoutApi } from '../../api/checkout';
import { paymentsApi } from '../../api/payments';

vi.mock('../../api/checkout', () => ({
    checkoutApi: {
        initiateCheckout: vi.fn(),
    },
}));

vi.mock('../../api/payments', () => ({
    paymentsApi: {
        createPaymentOrder: vi.fn(),
        retryPayment: vi.fn(),
        verifyPayment: vi.fn(),
    },
}));

vi.mock('../../api/cart', () => ({
    cartApi: {
        getCart: vi.fn(),
        updateItem: vi.fn(),
        removeItem: vi.fn(),
        clearCart: vi.fn(),
    },
}));

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
    const actual = await vi.importActual('react-router');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

describe('CheckoutPage Component (Phase 07.15)', () => {
    const mockCart = [
        {
            id: 'item-1',
            productId: 'prod-1',
            name: 'Architectural Linen Shirt',
            pricePaise: 450000,
            quantity: 1,
            image: 'images/products/shirt.jpg',
            available_quantity: 4,
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('renders empty cart state when cart is empty', () => {
        render(
            <MemoryRouter>
                <CheckoutPage cart={[]} loadCart={vi.fn()} />
            </MemoryRouter>
        );

        expect(screen.getByText('Your shopping bag is empty')).toBeInTheDocument();
        expect(screen.getByText('Explore Catalog')).toBeInTheDocument();
    });

    it('renders Step 1 (Address) as active by default with persistent labels', () => {
        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Street Address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/State/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/PIN Code/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Continue to Shipping Method/i })).toBeInTheDocument();
    });

    it('validates required fields, PIN code, and phone before advancing to Step 2', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} />
            </MemoryRouter>
        );

        const continueBtn = screen.getByRole('button', { name: /Continue to Shipping Method/i });
        await user.click(continueBtn);

        expect(screen.getByText('Full name is required')).toBeInTheDocument();
        expect(screen.getByText('Street address is required')).toBeInTheDocument();
        expect(screen.getByText('City is required')).toBeInTheDocument();
        expect(screen.getByText('State is required')).toBeInTheDocument();
        expect(screen.getByText('PIN code is required')).toBeInTheDocument();
        expect(screen.getByText('Phone number is required')).toBeInTheDocument();

        // Fill invalid PIN and phone
        await user.type(screen.getByLabelText(/Full Name/i), 'Alex Morgan');
        await user.type(screen.getByLabelText(/Street Address/i), '123 Residency Road');
        await user.type(screen.getByLabelText(/City/i), 'Bengaluru');
        await user.type(screen.getByLabelText(/State/i), 'Karnataka');
        await user.type(screen.getByLabelText(/PIN Code/i), '1234');
        await user.type(screen.getByLabelText(/Phone Number/i), '999');

        await user.click(continueBtn);

        expect(screen.getByText('Enter a valid 6-digit PIN code')).toBeInTheDocument();
        expect(screen.getByText('Enter a valid 10-digit phone number')).toBeInTheDocument();

        // Correct PIN and Phone
        await user.clear(screen.getByLabelText(/PIN Code/i));
        await user.type(screen.getByLabelText(/PIN Code/i), '560001');
        await user.clear(screen.getByLabelText(/Phone Number/i));
        await user.type(screen.getByLabelText(/Phone Number/i), '9876543210');

        await user.click(continueBtn);

        // Step 1 should collapse to summary and Step 2 should become active
        expect(screen.getByText('Alex Morgan')).toBeInTheDocument();
        expect(screen.getByText(/123 Residency Road/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Continue to Order Review/i })).toBeInTheDocument();
    });

    it('advances through shipping and review to payment, and completes payment flow', async () => {
        const user = userEvent.setup();
        checkoutApi.initiateCheckout.mockResolvedValue({
            order: {
                id: 'ord-12345678-abcd',
                totalPaise: 460000,
                reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
            guestToken: 'raw_guest_token_secret_xyz',
        });

        paymentsApi.createPaymentOrder.mockResolvedValue({
            keyId: 'rzp_test_123',
            amount: 460000,
            razorpayOrderId: 'order_rzp_789',
        });

        paymentsApi.verifyPayment.mockResolvedValue({
            success: true,
            orderId: 'ord-12345678-abcd',
        });

        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} />
            </MemoryRouter>
        );

        // Fill Step 1 Address
        await user.type(screen.getByLabelText(/Full Name/i), 'Alex Morgan');
        await user.type(screen.getByLabelText(/Street Address/i), '123 Residency Road');
        await user.type(screen.getByLabelText(/City/i), 'Bengaluru');
        await user.type(screen.getByLabelText(/State/i), 'Karnataka');
        await user.type(screen.getByLabelText(/PIN Code/i), '560001');
        await user.type(screen.getByLabelText(/Phone Number/i), '9876543210');
        await user.click(screen.getByRole('button', { name: /Continue to Shipping Method/i }));

        // Step 2: Select Express Shipping (₹100.00 / 10000 paise)
        const expressOption = screen.getByLabelText(/Express Delivery/i);
        await user.click(expressOption);
        await user.click(screen.getByRole('button', { name: /Continue to Order Review/i }));

        // Step 3: Order Review
        expect(screen.getByText('Architectural Linen Shirt')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Proceed to Payment/i })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Proceed to Payment/i }));

        // Step 4: Click Pay (₹4500.00 + ₹100.00 = ₹4600.00)
        const payButton = screen.getByRole('button', { name: /Pay ₹4600\.00 via Razorpay/i });
        expect(payButton).toBeInTheDocument();
        await user.click(payButton);

        // Verifications
        await waitFor(() => {
            expect(checkoutApi.initiateCheckout).toHaveBeenCalledWith({
                shippingAddress: {
                    fullName: 'Alex Morgan',
                    addressLine1: '123 Residency Road',
                    city: 'Bengaluru',
                    state: 'Karnataka',
                    pincode: '560001',
                    phone: '9876543210',
                },
                shippingMethod: 'EXPRESS',
            });
            expect(paymentsApi.createPaymentOrder).toHaveBeenCalledWith({
                orderId: 'ord-12345678-abcd',
                guestToken: 'raw_guest_token_secret_xyz',
            });
            expect(paymentsApi.verifyPayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderId: 'ord-12345678-abcd',
                    guestToken: 'raw_guest_token_secret_xyz',
                })
            );
            expect(mockNavigate).toHaveBeenCalledWith('/orders', {
                state: {
                    guestToken: 'raw_guest_token_secret_xyz',
                    orderId: 'ord-12345678-abcd',
                },
            });
        });

        // Verify guestToken was NEVER saved to localStorage or sessionStorage
        expect(localStorage.getItem('guestToken')).toBeNull();
        expect(sessionStorage.getItem('guestToken')).toBeNull();
    });

    it('handles payment failure and allows non-destructive retry on the SAME order', async () => {
        const user = userEvent.setup();
        checkoutApi.initiateCheckout.mockResolvedValue({
            order: {
                id: 'ord-retry-test-999',
                totalPaise: 450000,
                reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
            guestToken: 'retry_guest_token',
        });

        // First attempt fails during createPaymentOrder
        paymentsApi.createPaymentOrder.mockRejectedValueOnce({
            response: {
                data: {
                    error: {
                        message: 'Payment gateway connection error.',
                    },
                },
            },
        });

        // Retry attempt succeeds
        paymentsApi.retryPayment.mockResolvedValueOnce({
            keyId: 'rzp_test_123',
            amount: 450000,
            razorpayOrderId: 'order_rzp_retry_456',
        });

        paymentsApi.verifyPayment.mockResolvedValue({
            success: true,
            orderId: 'ord-retry-test-999',
        });

        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} />
            </MemoryRouter>
        );

        // Fill address & navigate to Step 4
        await user.type(screen.getByLabelText(/Full Name/i), 'Alex Morgan');
        await user.type(screen.getByLabelText(/Street Address/i), '123 Residency Road');
        await user.type(screen.getByLabelText(/City/i), 'Bengaluru');
        await user.type(screen.getByLabelText(/State/i), 'Karnataka');
        await user.type(screen.getByLabelText(/PIN Code/i), '560001');
        await user.type(screen.getByLabelText(/Phone Number/i), '9876543210');
        await user.click(screen.getByRole('button', { name: /Continue to Shipping Method/i }));
        await user.click(screen.getByRole('button', { name: /Continue to Order Review/i }));
        await user.click(screen.getByRole('button', { name: /Proceed to Payment/i }));

        // Initial Payment (STANDARD = FREE => ₹4500.00)
        const payBtn = screen.getByRole('button', { name: /Pay ₹4500\.00 via Razorpay/i });
        await user.click(payBtn);

        // Error banner should appear with "Retry Payment"
        await waitFor(() => {
            expect(screen.getByText('Payment gateway connection error.')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Retry Payment/i })).toBeInTheDocument();
        });

        // Execute Retry
        await user.click(screen.getByRole('button', { name: /Retry Payment/i }));

        await waitFor(() => {
            // Assert that retryPayment was called with the existing order ID
            expect(paymentsApi.retryPayment).toHaveBeenCalledWith({
                orderId: 'ord-retry-test-999',
                guestToken: 'retry_guest_token',
            });
            // Assert initiateCheckout was NOT called a second time
            expect(checkoutApi.initiateCheckout).toHaveBeenCalledTimes(1);
            expect(paymentsApi.verifyPayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    orderId: 'ord-retry-test-999',
                    guestToken: 'retry_guest_token',
                })
            );
        });
    });
});
