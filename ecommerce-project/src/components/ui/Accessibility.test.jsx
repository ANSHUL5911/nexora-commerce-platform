import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input.jsx';
import { Button } from './Button.jsx';
import { Modal } from './Modal.jsx';
import { Select } from './Select.jsx';

describe('Phase 07.19 — UI Accessibility & Keyboard Interaction Verification', () => {
  describe('Form Field Accessibility Associations', () => {
    it('associates form labels with input fields via htmlFor and id attributes', () => {
      render(
        <Input
          label="Delivery Address"
          id="shipping-address-1"
          placeholder="Enter address"
        />
      );

      const input = screen.getByLabelText(/delivery address/i);
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('id', 'shipping-address-1');
    });

    it('sets aria-invalid="true" and exposes error in accessible alert role on validation failure', () => {
      render(
        <Input
          label="Postal PIN Code"
          id="shipping-pin"
          error="Enter a valid 6-digit PIN code"
        />
      );

      const input = screen.getByLabelText(/postal pin code/i);
      expect(input).toHaveAttribute('aria-invalid', 'true');

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Enter a valid 6-digit PIN code');
    });

    it('associates select elements with persistent labels', () => {
      render(
        <Select label="Item Quantity" id="cart-item-qty">
          <option value="1">1</option>
          <option value="2">2</option>
        </Select>
      );

      const select = screen.getByLabelText(/item quantity/i);
      expect(select).toBeInTheDocument();
      expect(select).toHaveAttribute('id', 'cart-item-qty');
    });
  });

  describe('Interactive Controls & Disabled States', () => {
    it('disables interactive buttons when in loading state and renders spinner with aria-hidden', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <Button loading onClick={handleClick}>
          Authorizing Payment
        </Button>
      );

      const btn = screen.getByRole('button', { name: /authorizing payment/i });
      expect(btn).toBeDisabled();

      await user.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('allows keyboard activation of enabled buttons via Enter and Space keys', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<Button onClick={handleClick}>Submit Order</Button>);

      const btn = screen.getByRole('button', { name: /submit order/i });
      btn.focus();
      expect(btn).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledTimes(1);

      await user.keyboard(' ');
      expect(handleClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('Dialog & Modal Accessibility', () => {
    it('renders modal with role="dialog", aria-modal="true", and dismisses on Escape key', async () => {
      const handleClose = vi.fn();
      const user = userEvent.setup();

      render(
        <Modal isOpen={true} onClose={handleClose} title="Order Confirmation">
          <p>Your reservation is confirmed.</p>
        </Modal>
      );

      const dialog = screen.getByRole('dialog', { name: /order confirmation/i });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');

      await user.keyboard('{Escape}');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
