import { Outlet, NavLink } from 'react-router-dom';
import './layout.css';

export default function AppLayout() {
  return (
    <div>
      <nav className="nav">
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/stores">Stores</NavLink>
        <NavLink to="/menus">Menus</NavLink>
        <NavLink to="orders">Orders</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/billing">Billing</NavLink>
        <NavLink to="/audits">Audit Logs</NavLink>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
