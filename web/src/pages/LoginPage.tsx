import { useState, type FormEvent } from 'react';
import { api, type User } from '../api';
import { changeServer, isNativeApp } from '../native';

export function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api<User>('/api/auth/login', { method: 'POST', body: { username, password } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand big">
          <img src="/favicon.svg" alt="" width={36} height={36} />
          MyFuel
        </div>
        <label>
          Username
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || !username || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        {isNativeApp && (
          <p className="muted small">
            Server: {window.location.host} · <button type="button" className="link" onClick={changeServer}>Change server</button>
          </p>
        )}
      </form>
    </div>
  );
}
