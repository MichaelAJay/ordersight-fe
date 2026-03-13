import { useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import './layout.css';
import { SignedIn, SignedOut, RedirectToSignIn, UserButton, useAuth } from '@clerk/clerk-react';
import { SessionReconnectScreen } from '@/components/auth/SessionReconnectScreen';
import { useAuthRecoveryRequired } from '@/hooks/useAuthRecovery';
import { clearAuthRecoveryRequired } from '@/services/authRecovery';

export function AuthenticatedLayout() {
  const { isSignedIn } = useAuth();
  const authRecoveryRequired = useAuthRecoveryRequired();

  useEffect(() => {
    if (isSignedIn === false) {
      clearAuthRecoveryRequired();
    }
  }, [isSignedIn]);

  return (
    <>
      <SignedIn>
        {authRecoveryRequired ? (
          <SessionReconnectScreen />
        ) : (
          <>
            <a href="#main-content" className="skip-link" tabIndex={-1}>
              Skip to main content
            </a>

            <nav className="nav">
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/stores">Stores</NavLink>
              <NavLink to="/menus">Menus</NavLink>
              <NavLink to="/orders">Orders</NavLink>
              <NavLink to="/contacts">Contacts</NavLink>
              <NavLink to="/members">Members</NavLink>
              <NavLink to="/settings/billing">Billing</NavLink>
              <NavLink to="/audits">Audit Logs</NavLink>
              <UserButton />
            </nav>
            <main id="main-content" tabIndex={-1}>
              <Outlet />
            </main>
          </>
        )}
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
