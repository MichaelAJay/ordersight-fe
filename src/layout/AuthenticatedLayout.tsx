import { Outlet, NavLink } from 'react-router-dom';
import './layout.css';
import { SignedIn, SignedOut, RedirectToSignIn, UserButton } from '@clerk/clerk-react';

export default function AuthenticatedLayout() {
  return (
    <>
      <SignedIn>
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
          <UserButton />
        </nav>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
