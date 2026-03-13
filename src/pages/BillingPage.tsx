import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/common/Button/Button';
import {
  type BillingInterval,
  type CatalogPlan,
  type CatalogPlanPrice,
  createCheckoutSession,
  getBillingSubscription,
  listBillingPlans,
  redirectToExternalURL,
} from '@/services/billing';
import { type HttpError } from '@/services/http';
import './BillingPages.css';

type Notice = {
  tone: 'error' | 'info';
  text: string;
} | null;

const MONTHLY_INTERVAL = 'month';
const YEARLY_INTERVAL = 'year';

function formatPrice(amountAtomic: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(amountAtomic / 100);
}

function formatTrialLength(days: number) {
  if (days <= 0) {
    return 'No trial period';
  }

  return `${days}-day free trial`;
}

function formatIntervalLabel(interval: BillingInterval) {
  return interval === YEARLY_INTERVAL ? 'year' : 'month';
}

function formatCurrentStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function getPriceForInterval(
  plan: CatalogPlan,
  billingInterval: BillingInterval,
): CatalogPlanPrice | null {
  return plan.prices.find((price) => price.billing_interval === billingInterval) ?? null;
}

function getFallbackPrice(plan: CatalogPlan): CatalogPlanPrice | null {
  return plan.prices[0] ?? null;
}

function getCheckoutErrorMessage(error: unknown) {
  const normalized = error as HttpError | Error | null;
  const status = (normalized as HttpError | null)?.status;

  if (status === 409) {
    return 'This organization already has a provider-managed subscription. Open billing from the current plan instead of starting a second checkout.';
  }

  return 'We could not start checkout. Check your connection and try again.';
}

export function BillingPage() {
  const [preferredInterval, setPreferredInterval] = useState<BillingInterval>(MONTHLY_INTERVAL);
  const [notice, setNotice] = useState<Notice>(null);

  const plansQuery = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: listBillingPlans,
  });

  const subscriptionQuery = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: getBillingSubscription,
  });

  const checkoutMutation = useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: (result) => {
      redirectToExternalURL(result.checkout_url);
    },
    onError: (error) => {
      setNotice({
        tone: 'error',
        text: getCheckoutErrorMessage(error),
      });
    },
  });

  const isLoading = plansQuery.isPending || subscriptionQuery.isPending;
  const hasError = plansQuery.isError || subscriptionQuery.isError;
  const plans = plansQuery.data?.plans ?? [];
  const availableIntervals = new Set(
    plans.flatMap((plan) => plan.prices.map((price) => price.billing_interval)),
  );
  const selectedInterval = availableIntervals.has(preferredInterval)
    ? preferredInterval
    : availableIntervals.has(MONTHLY_INTERVAL)
      ? MONTHLY_INTERVAL
      : availableIntervals.has(YEARLY_INTERVAL)
        ? YEARLY_INTERVAL
        : preferredInterval;
  const subscription = subscriptionQuery.data?.subscription ?? null;
  const currentPlanCode =
    subscription && subscription.status !== 'canceled' ? subscription.plan_code : null;

  const handleRetry = () => {
    setNotice(null);
    void plansQuery.refetch();
    void subscriptionQuery.refetch();
  };

  const handleCheckout = (planPriceID: string) => {
    setNotice(null);
    checkoutMutation.mutate({ plan_price_id: planPriceID });
  };

  return (
    <section className="billing-shell">
      <div className="billing-hero">
        <div className="billing-hero-copy">
          <p className="billing-eyebrow">Billing</p>
          <h1>Choose a plan that matches the team you need to run.</h1>
          <p className="billing-copy">
            Pricing is loaded from the live billing catalog and checkout stays hosted by Polar, so
            plan changes and payment collection remain outside the app.
          </p>
        </div>

        <div className="billing-interval-switch" aria-label="Billing interval">
          <Button
            className="billing-interval-button"
            size="sm"
            variant="outline"
            aria-pressed={selectedInterval === MONTHLY_INTERVAL}
            onPress={() => setPreferredInterval(MONTHLY_INTERVAL)}
          >
            Monthly
          </Button>
          <Button
            className="billing-interval-button"
            size="sm"
            variant="outline"
            aria-pressed={selectedInterval === YEARLY_INTERVAL}
            onPress={() => setPreferredInterval(YEARLY_INTERVAL)}
          >
            Yearly
          </Button>
        </div>
      </div>

      {subscription ? (
        <article className="billing-note billing-note-inline">
          <h2>Current Subscription</h2>
          <p>
            {subscription.plan_name} is {formatCurrentStatus(subscription.status)} with{' '}
            {subscription.seats_used} of {subscription.seat_limit} seats in use.
          </p>
        </article>
      ) : null}

      {notice ? (
        <div
          className={
            notice.tone === 'error' ? 'billing-banner billing-banner-error' : 'billing-banner'
          }
          role="alert"
        >
          {notice.text}
        </div>
      ) : null}

      {isLoading ? (
        <article className="billing-state-card" aria-live="polite">
          <h2>Loading pricing</h2>
          <p>Fetching the active catalog and your organization&apos;s current plan.</p>
        </article>
      ) : null}

      {hasError && !isLoading ? (
        <article className="billing-state-card billing-state-card-error" role="alert">
          <h2>Billing data is unavailable</h2>
          <p>We could not load pricing or subscription details right now. Try again in a moment.</p>
          <div className="billing-actions">
            <Button variant="primary" size="md" onPress={handleRetry}>
              Retry
            </Button>
          </div>
        </article>
      ) : null}

      {!isLoading && !hasError && plans.length === 0 ? (
        <article className="billing-state-card">
          <h2>No active plans</h2>
          <p>
            The billing catalog is empty right now. Add active plan prices in the backend first.
          </p>
        </article>
      ) : null}

      {!isLoading && !hasError && plans.length > 0 ? (
        <div className="billing-grid">
          {plans.map((plan) => {
            const intervalPrice = getPriceForInterval(plan, selectedInterval);
            const fallbackPrice = getFallbackPrice(plan);
            const displayPrice = intervalPrice ?? fallbackPrice;
            const isCurrentPlan = currentPlanCode === plan.code;
            const isUnavailable = intervalPrice == null;
            const isPendingCheckout =
              checkoutMutation.isPending &&
              checkoutMutation.variables?.plan_price_id === intervalPrice?.id;
            const displayInterval =
              intervalPrice?.billing_interval ?? displayPrice?.billing_interval;

            return (
              <article
                key={plan.id}
                className={isCurrentPlan ? 'billing-card billing-card-current' : 'billing-card'}
              >
                <div className="billing-card-header">
                  <div>
                    <p className="billing-plan-code">{plan.code}</p>
                    <h2>{plan.name}</h2>
                  </div>

                  {isCurrentPlan ? <span className="billing-badge">Current plan</span> : null}
                </div>

                {displayPrice ? (
                  <div className="billing-price-block">
                    <p className="billing-price">
                      {formatPrice(displayPrice.amount_atomic, displayPrice.currency)}
                    </p>
                    <p className="billing-price-meta">
                      per {formatIntervalLabel(displayInterval ?? selectedInterval)}
                    </p>
                    {isUnavailable ? (
                      <p className="billing-price-subtle">
                        {selectedInterval === YEARLY_INTERVAL ? 'Yearly' : 'Monthly'} pricing is not
                        available for this plan yet.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="billing-price-block">
                    <p className="billing-price">Unavailable</p>
                    <p className="billing-price-meta">
                      No active prices were returned for this plan.
                    </p>
                  </div>
                )}

                <ul className="billing-feature-list">
                  <li>{formatTrialLength(plan.trial_length)}</li>
                  <li>
                    {displayPrice
                      ? `${displayPrice.seat_limit} seats included`
                      : 'Seat limit unavailable'}
                  </li>
                  <li>
                    {isCurrentPlan && subscription
                      ? `Current interval: ${formatIntervalLabel(subscription.billing_interval)}`
                      : `Billed ${formatIntervalLabel(displayInterval ?? selectedInterval)}ly`}
                  </li>
                </ul>

                {isCurrentPlan && subscription ? (
                  <p className="billing-status-line">
                    Status: {formatCurrentStatus(subscription.status)}
                    {subscription.cancel_at_period_end ? ' until the current period ends' : ''}
                  </p>
                ) : null}

                <div className="billing-card-footer">
                  <Button
                    variant={isCurrentPlan ? 'outline' : 'primary'}
                    size="lg"
                    block
                    isDisabled={isCurrentPlan || isUnavailable || checkoutMutation.isPending}
                    onPress={() => {
                      if (intervalPrice) {
                        handleCheckout(intervalPrice.id);
                      }
                    }}
                  >
                    {isCurrentPlan
                      ? 'Current plan'
                      : isUnavailable
                        ? 'Unavailable'
                        : isPendingCheckout
                          ? 'Redirecting...'
                          : plan.trial_length > 0
                            ? 'Start trial'
                            : 'Subscribe'}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
