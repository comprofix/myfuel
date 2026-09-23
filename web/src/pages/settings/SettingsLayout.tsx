import { NavLink, Outlet } from 'react-router';

export function SettingsLayout() {
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Settings">
        <NavLink to="/settings/sources">Data sources</NavLink>
        <NavLink to="/settings/activity">Activity</NavLink>
        <NavLink to="/settings/account">Account</NavLink>
      </nav>
      <div className="settings">
        <Outlet />
      </div>
    </div>
  );
}
