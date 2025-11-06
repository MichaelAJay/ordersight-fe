import { Outlet, NavLink, useLocation, Navigate } from 'react-router-dom';
import './layout.css';
import { useAuthStore } from '../stores/authStore';

export default function AuthenticatedLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const location = useLocation();

  if (isLoading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Authenticated - render
  return (
    <>
      <a href="#main-content" className="skip-link" id="main-content" tabIndex={-1}>
        Skip to main content
      </a>

      <nav className="nav">
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/stores">Stores</NavLink>
        <NavLink to="/menus">Menus</NavLink>
        <NavLink to="/orders">Orders</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/billing">Billing</NavLink>
        <NavLink to="/audits">Audit Logs</NavLink>
      </nav>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
