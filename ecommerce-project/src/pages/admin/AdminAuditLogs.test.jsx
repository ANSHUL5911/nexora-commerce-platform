import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminAuditLogs } from './components/AdminAuditLogs.jsx';
import { adminApi } from '../../api/admin.js';

vi.mock('../../api/admin.js', () => ({
  adminApi: {
    listAuditLogs: vi.fn(),
  },
}));

describe('AdminAuditLogs Component (Phase 07.26B)', () => {
  const mockLogs = [
    {
      id: 'audit-001',
      action: 'ADMIN_CREATE_PRODUCT',
      actor: { fullName: 'Admin User', email: 'admin@nexora.local' },
      actorId: 'a-1',
      targetResource: 'products',
      resourceId: 'p-1',
      ipAddress: '127.0.0.1',
      details: { name: 'Handmade Boots', price_paise: 1850000 },
      createdAt: '2026-09-20T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    adminApi.listAuditLogs.mockResolvedValue({
      data: mockLogs,
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('renders immutable audit logs with timestamp, action, actor, and target resource', async () => {
    render(<AdminAuditLogs />);

    expect(await screen.findByRole('heading', { level: 2, name: /operational audit trail/i })).toBeInTheDocument();
    expect(screen.getAllByText('ADMIN_CREATE_PRODUCT').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('admin@nexora.local')).toBeInTheDocument();
    expect(screen.getAllByText('products').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument();

    // Verify it is strictly read-only: no edit or delete buttons exist
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('filters audit logs by action type', async () => {
    const user = userEvent.setup();
    render(<AdminAuditLogs />);

    await screen.findByText('ADMIN_CREATE_PRODUCT');

    const actionSelect = screen.getByLabelText(/filter action:/i);
    await user.selectOptions(actionSelect, 'ADMIN_CREATE_PRODUCT');

    expect(adminApi.listAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_CREATE_PRODUCT' })
    );
  });

  it('inspects JSON payload snapshot in a read-only modal', async () => {
    const user = userEvent.setup();
    render(<AdminAuditLogs />);

    const inspectBtn = await screen.findByRole('button', { name: /inspect audit log audit-001/i });
    await user.click(inspectBtn);

    expect(await screen.findByText('Audit Record #audit-001')).toBeInTheDocument();
    expect(screen.getByText(/audit payload snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/"name": "Handmade Boots"/i)).toBeInTheDocument();
  });
});
