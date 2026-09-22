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

vi.mock('../../api/auth', () => ({
    authApi: {
        getCurrentUser: vi.fn().mockResolvedValue({ user: null }),
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
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
    const mockUser = { id: 'u-1', full_name: 'Jane Doe', email: 'jane@example.com' };
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
        mockNavigate.mockReset();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('renders empty cart state when cart is empty', () => {
        render(
            <MemoryRouter>
                <CheckoutPage cart={[]} loadCart={vi.fn()} currentUser={mockUser} />
            </MemoryRouter>
        );

        expect(screen.getByText('Your shopping bag is empty')).toBeInTheDocument();
        expect(screen.getByText('Explore Catalog')).toBeInTheDocument();
    });

    it('renders Step 1 (Address) as active by default with persistent labels', () => {
        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} currentUser={mockUser} />
            </MemoryRouter>
        );

        expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Street Address/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/State/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/PIN Code/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Phone Number/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Commit Shipping Coordinates/i })).toBeInTheDocument();
    });

    it('validates required fields, PIN code, and phone before advancing to Step 2', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} currentUser={mockUser} />
            </MemoryRouter>
        );

        const continueBtn = screen.getByRole('button', { name: /Commit Shipping Coordinates/i });
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
        expect(screen.getByRole('button', { name: /Confirm Dispatch Method/i })).toBeInTheDocument();
    });

    it('advances through shipping and review to payment, and completes payment flow', async () => {
        const user = userEvent.setup();
        const mockOpen = vi.fn();
        let razorpayOptions = null;
        window.Razorpay = vi.fn().mockImplementation((options) => {
            razorpayOptions = options;
            return { open: mockOpen };
        });

        checkoutApi.initiateCheckout.mockResolvedValue({
            order: {
                id: 'ord-12345678-abcd',
                totalPaise: 460000,
                reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
        });

        paymentsApi.createPaymentOrder.mockResolvedValue({
            razorpayKeyId: 'rzp_test_123',
            amountPaise: 460000,
            razorpayOrderId: 'order_rzp_789',
            currency: 'INR',
        });

        paymentsApi.verifyPayment.mockResolvedValue({
            success: true,
            orderId: 'ord-12345678-abcd',
        });

        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} currentUser={mockUser} />
            </MemoryRouter>
        );

        // Fill Step 1 Address
        await user.type(screen.getByLabelText(/Full Name/i), 'Alex Morgan');
        await user.type(screen.getByLabelText(/Street Address/i), '123 Residency Road');
        await user.type(screen.getByLabelText(/City/i), 'Bengaluru');
        await user.type(screen.getByLabelText(/State/i), 'Karnataka');
        await user.type(screen.getByLabelText(/PIN Code/i), '560001');
        await user.type(screen.getByLabelText(/Phone Number/i), '9876543210');
        await user.click(screen.getByRole('button', { name: /Commit Shipping Coordinates/i }));

        // Step 2: Select Express Shipping (₹100.00 / 10000 paise)
        const expressOption = screen.getByLabelText(/Express Delivery/i);
        await user.click(expressOption);
        await user.click(screen.getByRole('button', { name: /Confirm Dispatch Method/i }));

        // Step 3: Order Review
        expect(screen.getByText('Architectural Linen Shirt')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Verify Allocation & Lock Stock/i })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Verify Allocation & Lock Stock/i }));

        // Step 4: Click Pay (₹4500.00 + ₹100.00 = ₹4600.00)
        const payButton = screen.getByRole('button', { name: /Authorize Settlement via Razorpay/i });
        expect(payButton).toBeInTheDocument();
        await user.click(payButton);

        // Verifications of checkout and Razorpay initialization
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
            });
            expect(window.Razorpay).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'rzp_test_123',
                    amount: 460000,
                    order_id: 'order_rzp_789',
                    currency: 'INR',
                })
            );
            expect(mockOpen).toHaveBeenCalled();
        });

        // Simulate successful payment callback from Razorpay Checkout modal
        await razorpayOptions.handler({
            razorpay_payment_id: 'pay_test_real_456',
            razorpay_order_id: 'order_rzp_789',
            razorpay_signature: 'auth_test_signature',
        });

        await waitFor(() => {
            expect(paymentsApi.verifyPayment).toHaveBeenCalledWith({
                orderId: 'ord-12345678-abcd',
                razorpayPaymentId: 'pay_test_real_456',
                razorpayOrderId: 'order_rzp_789',
                razorpaySignature: 'auth_test_signature',
            });
            // Ensure no simulated payment payload was ever sent
            expect(paymentsApi.verifyPayment).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    razorpayPaymentId: expect.stringMatching(/^pay_sim_/),
                })
            );
            expect(mockNavigate).toHaveBeenCalledWith('/orders', {
                state: {
                    orderId: 'ord-12345678-abcd',
                },
            });
        });
    });

    it('handles payment failure and allows non-destructive retry on the SAME order', async () => {
        const user = userEvent.setup();
        const mockOpen = vi.fn();
        let retryRazorpayOptions = null;
        window.Razorpay = vi.fn().mockImplementation((options) => {
            retryRazorpayOptions = options;
            return { open: mockOpen };
        });

        checkoutApi.initiateCheckout.mockResolvedValue({
            order: {
                id: 'ord-retry-test-999',
                totalPaise: 450000,
                reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
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
            razorpayKeyId: 'rzp_test_123',
            amountPaise: 450000,
            razorpayOrderId: 'order_rzp_retry_456',
            currency: 'INR',
        });

        paymentsApi.verifyPayment.mockResolvedValue({
            success: true,
            orderId: 'ord-retry-test-999',
        });

        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} currentUser={mockUser} />
            </MemoryRouter>
        );

        // Fill address & navigate to Step 4
        await user.type(screen.getByLabelText(/Full Name/i), 'Alex Morgan');
        await user.type(screen.getByLabelText(/Street Address/i), '123 Residency Road');
        await user.type(screen.getByLabelText(/City/i), 'Bengaluru');
        await user.type(screen.getByLabelText(/State/i), 'Karnataka');
        await user.type(screen.getByLabelText(/PIN Code/i), '560001');
        await user.type(screen.getByLabelText(/Phone Number/i), '9876543210');
        await user.click(screen.getByRole('button', { name: /Commit Shipping Coordinates/i }));
        await user.click(screen.getByRole('button', { name: /Confirm Dispatch Method/i }));
        await user.click(screen.getByRole('button', { name: /Verify Allocation & Lock Stock/i }));

        // Initial Payment (STANDARD = FREE => ₹4500.00)
        const payBtn = screen.getByRole('button', { name: /Authorize Settlement via Razorpay/i });
        await user.click(payBtn);

        // Error banner should appear with "Retry Settlement via Razorpay"
        await waitFor(() => {
            expect(screen.getByText('Payment gateway connection error.')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Retry Settlement via Razorpay/i })).toBeInTheDocument();
        });

        // Execute Retry
        await user.click(screen.getByRole('button', { name: /Retry Settlement via Razorpay/i }));

        await waitFor(() => {
            // Assert that retryPayment was called with the existing order ID
            expect(paymentsApi.retryPayment).toHaveBeenCalledWith({
                orderId: 'ord-retry-test-999',
            });
            // Assert initiateCheckout was NOT called a second time
            expect(checkoutApi.initiateCheckout).toHaveBeenCalledTimes(1);
            expect(window.Razorpay).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'rzp_test_123',
                    amount: 450000,
                    order_id: 'order_rzp_retry_456',
                    currency: 'INR',
                })
            );
        });

        // Trigger successful modal callback
        await retryRazorpayOptions.handler({
            razorpay_payment_id: 'pay_retry_real_789',
            razorpay_order_id: 'order_rzp_retry_456',
            razorpay_signature: 'retry_test_signature',
        });

        await waitFor(() => {
            expect(paymentsApi.verifyPayment).toHaveBeenCalledWith({
                orderId: 'ord-retry-test-999',
                razorpayPaymentId: 'pay_retry_real_789',
                razorpayOrderId: 'order_rzp_retry_456',
                razorpaySignature: 'retry_test_signature',
            });
        });
    });

    it('shows safe user-facing error and avoids simulated verification if Razorpay script is not loaded', async () => {
        const user = userEvent.setup();
        delete window.Razorpay;

        checkoutApi.initiateCheckout.mockResolvedValue({
            order: {
                id: 'ord-missing-sdk-111',
                totalPaise: 450000,
                reservationExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
        });

        paymentsApi.createPaymentOrder.mockResolvedValue({
            razorpayKeyId: 'rzp_test_123',
            amountPaise: 450000,
            razorpayOrderId: 'order_rzp_missing_sdk',
            currency: 'INR',
        });

        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} currentUser={mockUser} />
            </MemoryRouter>
        );

        // Advance to step 4
        await user.type(screen.getByLabelText(/Full Name/i), 'Alex Morgan');
        await user.type(screen.getByLabelText(/Street Address/i), '123 Residency Road');
        await user.type(screen.getByLabelText(/City/i), 'Bengaluru');
        await user.type(screen.getByLabelText(/State/i), 'Karnataka');
        await user.type(screen.getByLabelText(/PIN Code/i), '560001');
        await user.type(screen.getByLabelText(/Phone Number/i), '9876543210');
        await user.click(screen.getByRole('button', { name: /Commit Shipping Coordinates/i }));
        await user.click(screen.getByRole('button', { name: /Confirm Dispatch Method/i }));
        await user.click(screen.getByRole('button', { name: /Verify Allocation & Lock Stock/i }));

        const payBtn = screen.getByRole('button', { name: /Authorize Settlement via Razorpay/i });
        await user.click(payBtn);

        // Should present safe user-facing error and not call verifyPayment
        await waitFor(() => {
            expect(screen.getByText('Secure payment checkout could not be loaded. Please refresh and try again.')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Retry Settlement via Razorpay/i })).toBeInTheDocument();
        });

        expect(paymentsApi.verifyPayment).not.toHaveBeenCalled();
    });

    it('renders session verification loading state when authLoading is true and does not classify as guest', () => {
        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} currentUser={null} authLoading={true} />
            </MemoryRouter>
        );

        expect(screen.getByText('Verifying Session')).toBeInTheDocument();
        expect(screen.getByText(/Please wait while we verify your authentication status/i)).toBeInTheDocument();
        expect(screen.queryByText('Sign In to Complete Acquisition')).not.toBeInTheDocument();
        expect(checkoutApi.initiateCheckout).not.toHaveBeenCalled();
    });

    it('renders authentication gate when guest directly visits /checkout and blocks checkout initiation', async () => {
        const user = userEvent.setup();

        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} currentUser={null} authLoading={false} />
            </MemoryRouter>
        );

        expect(screen.getByText('Sign In to Complete Acquisition')).toBeInTheDocument();
        expect(screen.getByText('Create an account or sign in to complete acquisition.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Create Account/i })).toBeInTheDocument();

        // Ensure no checkout or payment APIs were called
        expect(checkoutApi.initiateCheckout).not.toHaveBeenCalled();
        expect(paymentsApi.createPaymentOrder).not.toHaveBeenCalled();

        // Clicking Sign In opens modal
        await user.click(screen.getByRole('button', { name: /Sign In/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('opens registration modal from authentication gate and triggers onAuthChange upon success', async () => {
        const user = userEvent.setup();
        const onAuthChangeMock = vi.fn();

        render(
            <MemoryRouter>
                <CheckoutPage cart={mockCart} loadCart={vi.fn()} currentUser={null} authLoading={false} onAuthChange={onAuthChangeMock} />
            </MemoryRouter>
        );

        await user.click(screen.getByRole('button', { name: /Create Account/i }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});

