import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './routes';
import './styles/tokens.css';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { setAuthTokenGetter } from './services/http';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
// const SIGN_IN_URL = import.meta.env.VITE_CLERK_SIGN_IN_URL ?? '/sign-in';
// const SIGN_UP_URL = import.meta.env.VITE_CLERK_SIGN_UP_URL ?? '/sign-up';
// const SIGN_IN_FORCE_REDIRECT_URL = import.meta.env.VITE_CLERK_SIGN_IN_FORCE_REDIRECT_URL ?? '/dashboard';
// const SIGN_UP_FORCE_REDIRECT_URL = import.meta.env.VITE_CLERK_SIGN_UP_FORCE_REDIRECT_URL ?? '/dashboard';
// const SIGN_IN_FALLBACK_REDIRECT_URL = import.meta.env.VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL ?? '/dashboard';
// const SIGN_UP_FALLBACK_REDIRECT_URL = import.meta.env.VITE_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL ?? '/dashboard';

if (!PUBLISHABLE_KEY) {
  throw new Error('Add your Clerk Publishable Key to the .env file');
}

const qc = new QueryClient();

function ClerkTokenBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(getToken);
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      // signInUrl={SIGN_IN_URL}
      // signUpUrl={SIGN_UP_URL}
      // signInForceRedirectUrl={SIGN_IN_FORCE_REDIRECT_URL}
      // signUpForceRedirectUrl={SIGN_UP_FORCE_REDIRECT_URL}
      // signInFallbackRedirectUrl={SIGN_IN_FALLBACK_REDIRECT_URL}
      // signUpFallbackRedirectUrl={SIGN_UP_FALLBACK_REDIRECT_URL}
    >
      <ClerkTokenBridge />
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>,
);
