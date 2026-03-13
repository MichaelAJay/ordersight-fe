import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import { getBillingSubscription } from '@/services/billing';
import { formatDateTime } from '@/utils/date';
import './BillingPages.css';

const SUCCESS_POLL_INTERVAL_MS = 1500;

function formatSubscriptionStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export function BillingSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const checkoutID = searchParams.get('checkout_id')?.trim() ?? '';

  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'success', 'subscription'],
    queryFn: getBillingSubscription,
    refetchInterval: (query) => {
      if (!checkoutID) {
        return false;
      }

      const subscription = query.state.data?.subscription;
      if (subscription?.status === 'active') {
        return false;
      }

      return SUCCESS_POLL_INTERVAL_MS;
    },
  });

  const subscription = subscriptionQuery.data?.subscription ?? null;
  const isPollingForActivation =
    Boolean(checkoutID) && subscription?.status !== 'active' && !subscriptionQuery.isError;

  return (
    <section className="billing-shell">
      <div className="billing-hero billing-hero-success">
        <div className="billing-hero-copy">
          <p className="billing-eyebrow">Checkout Complete</p>
          <h1>Payment successful.</h1>
          <p className="billing-copy">
            Polar returned the browser successfully. We&apos;re now checking your subscription state
            so the app can reflect the completed purchase without relying on this page as the source
            of truth.
          </p>
        </div>
      </div>

      <div className="billing-grid">
        <article className="billing-card billing-card-emphasis">
          <div className="billing-card-header">
            <div>
              <p className="billing-plan-code">Subscription sync</p>
              <h2>
                {subscription?.status === 'active'
                  ? 'Subscription active'
                  : subscriptionQuery.isError
                    ? 'We could not confirm the subscription yet'
                    : 'Confirming your subscription'}
              </h2>
            </div>

            {subscription ? (
              <span className="billing-badge billing-badge-success">
                {formatSubscriptionStatus(subscription.status)}
              </span>
            ) : null}
          </div>

          <p>
            {subscription?.status === 'active'
              ? `${subscription.plan_name} is now active and ready to use.`
              : subscriptionQuery.isError
                ? 'We could not reach the billing API just now. Your purchase may still be processing in the background.'
                : 'Webhook processing usually finishes within a few seconds. This page will refresh the subscription status automatically.'}
          </p>

          {isPollingForActivation ? (
            <p className="billing-status-line" aria-live="polite">
              Polling for an active subscription every {SUCCESS_POLL_INTERVAL_MS / 1000} seconds.
            </p>
          ) : null}

          {subscription?.current_period_end ? (
            <p className="billing-status-line">
              Current period ends {formatDateTime(subscription.current_period_end)}.
            </p>
          ) : null}
        </article>

        <article className="billing-card">
          <h2>Checkout Session</h2>
          <p>
            {checkoutID
              ? 'Polar sent the checkout session identifier below on the success redirect.'
              : 'No checkout_id query parameter was present on this visit.'}
          </p>
          <code className="billing-code">{checkoutID || 'checkout_id missing'}</code>
        </article>

        <article className="billing-card">
          <h2>Current Billing Snapshot</h2>
          <p>
            {subscription
              ? `${subscription.seats_used} of ${subscription.seat_limit} seats are currently in use on ${subscription.plan_name}.`
              : 'No subscription snapshot is available yet. The backend will populate this as soon as it processes the Polar webhook.'}
          </p>
          <code className="billing-code">
            {subscription
              ? `${subscription.plan_name} • ${formatSubscriptionStatus(subscription.status)} • ${subscription.billing_interval}`
              : 'Awaiting subscription record'}
          </code>
        </article>
      </div>

      <article className="billing-note">
        <h2>Why This Page Polls</h2>
        <p>
          Checkout completion and local subscription activation are connected by webhook delivery,
          not the browser redirect itself. Polling the backend briefly gives the user immediate
          feedback without making the redirect route responsible for billing state changes.
        </p>
      </article>

      <div className="billing-actions">
        <Button variant="primary" size="lg" onPress={() => navigate('/dashboard')}>
          Continue To Dashboard
        </Button>
        <Button variant="outline" size="lg" onPress={() => navigate('/settings/billing')}>
          Open Billing
        </Button>
      </div>
    </section>
  );
}
