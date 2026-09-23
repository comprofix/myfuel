import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import { api, setUnauthorizedHandler, type User } from './api';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SourcesPage } from './pages/settings/SourcesPage';
import { SourceDetailPage } from './pages/settings/SourceDetailPage';
import { ActivityPage } from './pages/settings/ActivityPage';
import { AccountPage } from './pages/settings/AccountPage';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api<User>('/api/auth/me').then(setUser, () => setUser(null));
  }, []);

  if (user === undefined) return <div className="splash">Loading…</div>;
  if (user === null) return <LoginPage onLogin={setUser} />;

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img src="/favicon.svg" alt="" width={24} height={24} />
          MyFuel
        </div>
        <nav>
          <NavLink to="/" end>Map</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="user">
          <span>{user.username}</span>
          <button className="link" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="sources" replace />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="sources/:id" element={<SourceDetailPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
