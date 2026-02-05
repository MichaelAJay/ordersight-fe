import { useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HttpError, postJSON } from '../../services/http';

type BootstrapRequest = {
  clerk_org_id?: string;
  clerk_user_id?: string;
};

type BootstrapResponse = {
  organization: unknown;
  membership: unknown;
  subscription: unknown;
  user_id: string;
};

export default function OnboardingBootstrapPage() {
  const { isLoaded, isSignedIn, orgId, userId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const state = (location.state ?? {}) as { returnTo?: string };
  const params = new URLSearchParams(location.search);
  const returnTo = state.returnTo ?? params.get('returnTo') ?? '/dashboard';
  const safeReturnTo = returnTo.startsWith('/') ? returnTo : '/dashboard';

  useEffect(() => {
    if (!isLoaded) return;

    // If they somehow hit this route signed out, send them back.
    if (!isSignedIn) {
      navigate('/sign-up');
      return;
    }

    (async () => {
      try {
        const payload: BootstrapRequest = {
          clerk_org_id: orgId ?? undefined,
          clerk_user_id: userId ?? undefined,
        };

        await postJSON<BootstrapRequest, BootstrapResponse>('/bootstrap', payload);

        // Upon success, navigate to the intended page (default to dashboard)
        navigate(safeReturnTo, { replace: true, state: { bootstrapAttempted: true } });
      } catch (err) {
        const normalized = err as HttpError | Error | null;
        const message = normalized?.message ?? 'Bootstrap failed';
        const details = normalized && 'details' in normalized ? normalized.details : undefined;
        const detailsText =
          typeof details === 'string' ? details : details ? JSON.stringify(details, null, 2) : null;
        setError(detailsText ? `${message}\n${detailsText}` : message);
      }
    })();
  }, [isLoaded, isSignedIn, navigate, orgId, safeReturnTo, userId]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Setting things up...</h1>
        {!error ? <p>Please wait.</p> : <p style={{ whiteSpace: 'pre-wrap' }}>{error}</p>}
      </div>
    </div>
  );
}
