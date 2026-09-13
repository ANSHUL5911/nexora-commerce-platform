import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button.jsx';
import { Input } from './Input.jsx';
import { Select } from './Select.jsx';
import { Badge } from './Badge.jsx';
import { Modal } from './Modal.jsx';
import { EmptyState } from './EmptyState.jsx';
import { MemoryRouter } from 'react-router';

describe('UI Primitives', () => {
  describe('Button', () => {
    it('renders with correct variant and triggers onClick', async () => {
      const handleClick = vi.fn();
      render(<Button variant="primary" onClick={handleClick}>Submit</Button>);

      const btn = screen.getByRole('button', { name: /submit/i });
      expect(btn).toHaveClass('nx-btn-primary');

      const user = userEvent.setup();
      await user.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('handles loading state with spinner and disables button', () => {
      render(<Button loading>Processing</Button>);
      const btn = screen.getByRole('button');
      expect(btn).toBeDisabled();
      expect(screen.getByText('Processing')).toBeInTheDocument();
    });
  });

  describe('Input', () => {
    it('renders with label and accessible error message', () => {
      render(<Input label="Full Name" error="Name is required" id="test-name" />);

      expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
    });
  });

  describe('Select', () => {
    it('renders select dropdown with persistent label', () => {
      render(
        <Select label="Quantity" id="qty-select">
          <option value="1">1</option>
          <option value="2">2</option>
        </Select>
      );

      expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('1');
    });
  });

  describe('Badge', () => {
    it('maps status to correct variant styles', () => {
      const { rerender } = render(<Badge status="PAID" />);
      expect(screen.getByText('PAID')).toHaveClass('nx-badge-success');

      rerender(<Badge status="PROCESSING" />);
      expect(screen.getByText('PROCESSING')).toHaveClass('nx-badge-warning');

      rerender(<Badge status="CANCELLED" />);
      expect(screen.getByText('CANCELLED')).toHaveClass('nx-badge-error');
    });
  });

  describe('Modal', () => {
    it('renders dialog when isOpen is true and calls onClose on escape', async () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Dialog Title">
          <div>Dialog Content</div>
        </Modal>
      );

      expect(screen.getByRole('dialog', { name: /dialog title/i })).toBeInTheDocument();
      expect(screen.getByText('Dialog Content')).toBeInTheDocument();

      const user = userEvent.setup();
      await user.keyboard('{Escape}');
      expect(handleClose).toHaveBeenCalled();
    });

    it('does not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} title="Hidden Dialog">
          <div>Hidden Content</div>
        </Modal>
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('EmptyState', () => {
    it('renders title, description and action link', () => {
      render(
        <MemoryRouter>
          <EmptyState
            title="Empty Cart"
            description="Your cart is currently empty."
            actionLabel="Start Shopping"
            actionTo="/"
          />
        </MemoryRouter>
      );

      expect(screen.getByText('Empty Cart')).toBeInTheDocument();
      expect(screen.getByText('Your cart is currently empty.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /start shopping/i })).toHaveAttribute('href', '/');
    });
  });
});
