import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import './BillingPages.css';

export function BillingSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const checkoutID = searchParams.get('checkout_id')?.trim() ?? '';

  return (
    <section className="billing-shell">
      <div className="billing-hero billing-hero-success">
        <p className="billing-eyebrow">Checkout Complete</p>
        <h1>Payment handoff finished. Subscription sync is still webhook-driven.</h1>
        <p className="billing-copy">
          Polar redirected the browser back successfully. This page exists so the hosted checkout
          has a real landing route while the backend processes webhook events and updates
          subscription state.
        </p>
      </div>

      <div className="billing-grid">
        <article className="billing-card">
          <h2>Checkout Session</h2>
          <p>
            {checkoutID
              ? 'Polar included the checkout session identifier below.'
              : 'No checkout_id query parameter was present on this visit.'}
          </p>
          <code className="billing-code">{checkoutID || 'checkout_id missing'}</code>
        </article>

        <article className="billing-card">
          <h2>Next Backend Step</h2>
          <p>
            The backend should reconcile the organization subscription from webhook deliveries, not
            from this page load.
          </p>
          <code className="billing-code">customer.state_changed / checkout.updated</code>
        </article>
      </div>

      <article className="billing-note">
        <h2>What To Expect</h2>
        <p>
          Until the billing API is wired up, this screen is informational only. Later it can poll
          the backend for current subscription status and send the user back into the real billing
          workspace.
        </p>
      </article>

      <div className="billing-actions">
        <Button variant="primary" size="lg" onPress={() => navigate('/billing')}>
          Go To Billing
        </Button>
        <Button variant="outline" size="lg" onPress={() => navigate('/dashboard')}>
          Back To Dashboard
        </Button>
      </div>
    </section>
  );
}
