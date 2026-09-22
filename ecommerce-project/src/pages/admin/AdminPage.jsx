import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { authApi } from '../../api/auth.js';
import { AdminNav } from './components/AdminNav.jsx';
import { AdminOverview } from './components/AdminOverview.jsx';
import { AdminOrders } from './components/AdminOrders.jsx';
import { AdminInventory } from './components/AdminInventory.jsx';
import { AdminProducts } from './components/AdminProducts.jsx';
import { AdminAuditLogs } from './components/AdminAuditLogs.jsx';
import './AdminPage.css';

/**
 * AdminPage Component (Phase 07.26B)
 * Nexora Commerce Operations Console.
 * Evolved from temporary authorization verification shell into the complete commerce operations interface.
 */
export function AdminPage({ currentUser, onAuthChange }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedOrderId, setSelectedOrderId] = useState(null);

  // Derive active tab from URL pathname or query parameter
  const resolveActiveTab = () => {
    const path = location.pathname.toLowerCase();
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');

    if (path.includes('/admin/orders') || tabParam === 'orders') return 'orders';
    if (path.includes('/admin/inventory') || tabParam === 'inventory') return 'inventory';
    if (path.includes('/admin/products') || tabParam === 'products') return 'products';
    if (path.includes('/admin/audit') || tabParam === 'audit') return 'audit';
    return 'overview';
  };

  const activeTab = resolveActiveTab();

  const handleSelectTab = (tabId, targetPath) => {
    navigate(targetPath);
  };

  const handleSelectOrderFromOverview = (orderId) => {
    setSelectedOrderId(orderId);
    navigate('/admin/orders');
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      if (onAuthChange) {
        await onAuthChange(null);
      }
      navigate('/');
    }
  };

  return (
    <div className="nx-admin-layout">
      {/* Header & Section Navigation */}
      <AdminNav
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Operations Canvas */}
      <main className="nx-admin-main" id="main-content" tabIndex="-1">
        <div className="nx-admin-container">
          {activeTab === 'overview' && (
            <AdminOverview
              onNavigateTab={handleSelectTab}
              onSelectOrder={handleSelectOrderFromOverview}
            />
          )}

          {activeTab === 'orders' && (
            <AdminOrders
              selectedOrderId={selectedOrderId}
              onClearSelectedOrder={() => setSelectedOrderId(null)}
            />
          )}

          {activeTab === 'inventory' && (
            <AdminInventory onNavigateToOrders={handleSelectTab} />
          )}

          {activeTab === 'products' && <AdminProducts />}

          {activeTab === 'audit' && <AdminAuditLogs />}
        </div>
      </main>
    </div>
  );
}

export default AdminPage;
