import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/common/Button/Button';
import {
  createPortalSession,
  getBillingSubscription,
  openExternalURLInNewTab,
} from '@/services/billing';
import { type HttpError } from '@/services/http';
import { formatDate } from '@/utils/date';
import './BillingPages.css';

function formatSubscriptionStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function formatInterval(interval: string) {
  return interval === 'year' ? 'Yearly' : 'Monthly';
}

function getPortalErrorMessage(error: unknown) {
  const normalized = error as HttpError | Error | null;
  const status = (normalized as HttpError | null)?.status;

  if (status === 404) {
    return 'We could not find a portal-enabled subscription for this organization yet.';
  }

  return 'We could not open the billing portal right now. Try again in a moment.';
}

export function BillingDashboardPage() {
  const navigate = useNavigate();
  const [portalError, setPortalError] = useState<string | null>(null);
  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'dashboard', 'subscription'],
    queryFn: getBillingSubscription,
    refetchOnMount: 'always',
  });

  const subscription = subscriptionQuery.data?.subscription ?? null;
  const canManageSubscription = subscription?.portal_available === true;
  const portalMutation = useMutation({
    mutationFn: createPortalSession,
    onSuccess: (result) => {
      openExternalURLInNewTab(result.portal_url);
    },
    onError: (error) => {
      setPortalError(getPortalErrorMessage(error));
    },
  });

  const handleOpenPortal = () => {
    if (!canManageSubscription) {
      return;
    }

    setPortalError(null);
    portalMutation.mutate();
  };

  const handleBillingAction = () => {
    if (canManageSubscription) {
      handleOpenPortal();
      return;
    }

    navigate('/billing');
  };

  return (
    <section className="billing-shell">
      <div className="billing-hero billing-hero-dashboard">
        <div className="billing-hero-copy">
          <p className="billing-eyebrow">Billing Settings</p>
          <h1>Review the subscription your organization is actually running on.</h1>
          <p className="billing-copy">
            This dashboard reads the current backend billing snapshot so admins can verify plan
            status, seat usage, and the next billing milestone without leaving the app.
          </p>
        </div>
      </div>

      {subscription?.cancel_at_period_end ? (
        <div className="billing-banner" role="status">
          Your subscription will end on {formatDate(subscription.current_period_end)}. You
          won&apos;t be charged again.
        </div>
      ) : null}

      {portalError ? (
        <div className="billing-banner billing-banner-error" role="alert">
          {portalError}
        </div>
      ) : null}

      {subscriptionQuery.isPending ? (
        <article className="billing-state-card" aria-live="polite">
          <h2>Loading billing snapshot</h2>
          <p>
            Fetching the latest subscription, plan, and seat usage details for this organization.
          </p>
        </article>
      ) : null}

      {subscriptionQuery.isError ? (
        <article className="billing-state-card billing-state-card-error" role="alert">
          <h2>Billing data is unavailable</h2>
          <p>We could not load the subscription snapshot right now. Try again in a moment.</p>
          <div className="billing-actions">
            <Button variant="primary" size="md" onPress={() => void subscriptionQuery.refetch()}>
              Retry
            </Button>
          </div>
        </article>
      ) : null}

      {!subscriptionQuery.isPending && !subscriptionQuery.isError && subscription ? (
        <>
          <div className="billing-grid billing-grid-dashboard">
            <article className="billing-card billing-card-current">
              <p className="billing-plan-code">Current plan</p>
              <h2>{subscription.plan_name}</h2>
              <p className="billing-price-meta">{subscription.plan_code}</p>
            </article>

            <article className="billing-card">
              <p className="billing-plan-code">Status</p>
              <h2>{formatSubscriptionStatus(subscription.status)}</h2>
              <p className="billing-price-meta">{formatInterval(subscription.billing_interval)}</p>
            </article>

            <article className="billing-card">
              <p className="billing-plan-code">Seat usage</p>
              <h2>
                {subscription.seats_used} / {subscription.seat_limit}
              </h2>
              <p className="billing-price-meta">Seats used</p>
            </article>
          </div>

          <div className="billing-grid billing-grid-dashboard-secondary">
            <article className="billing-card">
              <h2>Current billing period</h2>
              <p>
                {subscription.current_period_end
                  ? `Current period ends ${formatDate(subscription.current_period_end)}.`
                  : 'Current period end is not available yet.'}
              </p>
            </article>

            <article className="billing-card">
              <h2>What the backend is enforcing</h2>
              <p>
                Plan gating and seat limits are derived from this subscription snapshot, not from
                frontend state.
              </p>
              <code className="billing-code">
                {subscription.plan_name} • {formatSubscriptionStatus(subscription.status)} •{' '}
                {subscription.seats_used} / {subscription.seat_limit} seats used
              </code>
              <p className="billing-status-line">
                {canManageSubscription
                  ? 'The portal opens in a new tab so you can return here after payment or cancellation changes.'
                  : 'This organization is still using a local trial snapshot. Choose a plan and complete Polar checkout before portal access is available.'}
              </p>
              <div className="billing-card-footer">
                <Button
                  variant={canManageSubscription ? 'outline' : 'primary'}
                  size="lg"
                  block
                  isDisabled={portalMutation.isPending}
                  onPress={handleBillingAction}
                >
                  {portalMutation.isPending
                    ? 'Opening portal...'
                    : canManageSubscription
                      ? 'Manage Subscription'
                      : 'Choose Plan'}
                </Button>
              </div>
            </article>
          </div>
        </>
      ) : null}

      {!subscriptionQuery.isPending && !subscriptionQuery.isError && !subscription ? (
        <article className="billing-state-card">
          <h2>No active subscription</h2>
          <p>
            This organization does not have a billable plan yet. Choose a plan first, then return
            here to monitor status and seat usage.
          </p>
          <div className="billing-actions">
            <Button variant="primary" size="lg" onPress={() => navigate('/billing')}>
              View Pricing
            </Button>
            <Button variant="outline" size="lg" isDisabled>
              Manage Subscription
            </Button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
