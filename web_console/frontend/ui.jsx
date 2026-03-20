import React, { useEffect } from 'react';
import { api, tr } from './config.js';

export function BusyButton({ busy, className = '', children, ...props }) {
  return (
    <button
      {...props}
      className={[className, busy ? 'is-busy' : ''].filter(Boolean).join(' ')}
      disabled={busy || props.disabled}
      aria-busy={busy ? 'true' : 'false'}
    >
      {children}
    </button>
  );
}

export function Modal({ open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-shell is-open">
      <button type="button" className="modal-backdrop" aria-label={tr('close_sidebar')} onClick={onCancel} />
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">{title}</h3>
        <p className="subtle">{message}</p>
        <div className="modal-actions">
          <button type="button" className="ghost-btn" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function AuthScreen({ view }) {
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const path = view === 'setup' ? '/api/auth/setup' : '/api/auth/login';
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      window.location.reload();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">{tr('brand_name')}</p>
        <h1>{view === 'setup' ? tr('auth_setup_title') : tr('auth_login_title')}</h1>
        <p className="subtle">{view === 'setup' ? tr('auth_setup_desc') : tr('auth_login_desc')}</p>
        <form className="stack auth-form" onSubmit={handleSubmit}>
          <label>
            <span>{tr('auth_password')}</span>
            <input type="password" minLength="8" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <BusyButton type="submit" busy={busy}>
            {view === 'setup' ? tr('auth_setup_submit') : tr('auth_login_submit')}
          </BusyButton>
        </form>
        <p className="auth-error">{error}</p>
      </section>
    </main>
  );
}
