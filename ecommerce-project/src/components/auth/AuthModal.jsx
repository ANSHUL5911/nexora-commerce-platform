import { useState } from 'react';
import { Modal } from '../ui/Modal.jsx';
import { Input } from '../ui/Input.jsx';
import { Button } from '../ui/Button.jsx';
import { authApi } from '../../api/auth.js';
import './AuthModal.css';

export function AuthModal({ isOpen, onClose, onAuthSuccess, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setError(null);
    setSuccessMsg(null);
  };

  const handleModeSwitch = (newMode) => {
    setMode(newMode);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (mode === 'login') {
        const res = await authApi.login({ email, password });
        setSuccessMsg('Logged in successfully');
        resetForm();
        onAuthSuccess?.(res?.user);
        setTimeout(() => {
          onClose?.();
        }, 500);
      } else {
        const res = await authApi.register({ email, password, full_name: fullName });
        setSuccessMsg('Account created successfully');
        resetForm();
        onAuthSuccess?.(res?.user);
        setTimeout(() => {
          onClose?.();
        }, 500);
      }
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'login' ? 'Account Login' : 'Create Account'}
      maxWidth="440px"
    >
      <div className="auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
          onClick={() => handleModeSwitch('login')}
        >
          Sign In
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
          onClick={() => handleModeSwitch('register')}
        >
          Register
        </button>
      </div>

      {error && <div className="auth-alert-error" role="alert">{error}</div>}
      {successMsg && <div className="auth-alert-success" role="status">{successMsg}</div>}

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <Input
            label="Full Name"
            id="auth-fullname"
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
          />
        )}

        <Input
          label="Email Address"
          id="auth-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@domain.com"
        />

        <Input
          label="Password"
          id="auth-password"
          type="password"
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        <div style={{ marginTop: 'var(--space-6)' }}>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            style={{ width: '100%' }}
          >
            {mode === 'login' ? 'Sign In to Nexora' : 'Complete Registration'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
