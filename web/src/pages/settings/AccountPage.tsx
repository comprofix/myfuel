import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import type { Msg } from './shared';

export function AccountPage() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) return setMsg({ ok: false, text: 'New passwords do not match' });
    try {
      await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
      setMsg({ ok: true, text: 'Password changed. Other sessions were signed out.' });
      setCurrent(''); setNew(''); setConfirm('');
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <>
      <h1>Account</h1>
      <form className="card form-grid" onSubmit={submit}>
        <h2>Change password</h2>
        <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label>New password (10+ characters)<input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(e) => setNew(e.target.value)} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <div className="actions">
          <button className="primary" disabled={!currentPassword || newPassword.length < 10}>Change password</button>
          {msg && <span className={msg.ok ? 'success' : 'error'}>{msg.text}</span>}
        </div>
      </form>
    </>
  );
}
